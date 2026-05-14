import io
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import requests
from requests_oauthlib import OAuth1

from .ImageGenerator import generate_answer_image

INEVITAVEL_GPT_KEYWORD = os.environ['INEVITAVEL_GPT_KEYWORD']
INEVITAVEL_BOT_HANDLE  = os.environ['INEVITAVEL_BOT_HANDLE']
BOT_API_URL            = os.environ['BOT_API_URL']
BOT_API_SECRET         = os.environ['BOT_API_SECRET']

# Railway: monte um volume em /data e defina STATE_DIR=/data para persistência
STATE_DIR           = os.environ.get('STATE_DIR', '/tmp')
LAST_CREATED_AT_FILE = os.path.join(STATE_DIR, 'last_tweet_created_at.txt')
PROCESSED_IDS_FILE  = os.path.join(STATE_DIR, 'processed_ids.json')
RETRY_QUEUE_FILE    = os.path.join(STATE_DIR, 'retry_tweets.json')
MIN_TIMELINE_LOOKBACK_DAYS = 3

_LIVRO_RE = re.compile(r'livro\s+amarelo', re.IGNORECASE)
_RENAN_RE = re.compile(r'renan\s+santos',  re.IGNORECASE)

_GPT_KEYWORD_RE = re.compile(
    re.escape(
        unicodedata.normalize('NFD', INEVITAVEL_GPT_KEYWORD)
        .encode('ascii', 'ignore')
        .decode('ascii')
    ),
    re.IGNORECASE,
)


# ── Estado local ──────────────────────────────────────────────────────────────

def _read_last_created_at():
    try:
        return open(LAST_CREATED_AT_FILE).read().strip() or None
    except FileNotFoundError:
        return None


def _save_last_created_at(created_at):
    os.makedirs(STATE_DIR, exist_ok=True)
    open(LAST_CREATED_AT_FILE, 'w').write(str(created_at))


def _parse_created_at(created_at):
    if not created_at:
        return None
    try:
        normalized = created_at.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        logging.warning('Ignoring invalid tweet created_at: %s', created_at)
        return None


def _read_default_min_created_at():
    created_at = os.environ.get('DEFAULT_MIN_TWEET_CREATED_AT', '').strip()
    if not created_at:
        return None
    if not _parse_created_at(created_at):
        logging.warning('Ignoring invalid DEFAULT_MIN_TWEET_CREATED_AT env var: %s', created_at)
        return None
    return created_at


def _is_created_at_newer(candidate, current):
    candidate_dt = _parse_created_at(candidate)
    if not candidate_dt:
        return False
    current_dt = _parse_created_at(current)
    return current_dt is None or candidate_dt > current_dt


def _save_last_created_at_if_newer(created_at):
    if not created_at:
        return
    current = _read_last_created_at()
    if _is_created_at_newer(created_at, current):
        logging.info('Saving last_tweet_created_at=%s', created_at)
        _save_last_created_at(created_at)


def _format_created_at(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _min_allowed_start_time():
    return _format_created_at(datetime.now(timezone.utc) - timedelta(days=MIN_TIMELINE_LOOKBACK_DAYS))


def _effective_start_time(last_created_at, min_created_at):
    start_time = last_created_at if _is_created_at_newer(last_created_at, min_created_at) else min_created_at
    min_allowed = _min_allowed_start_time()
    if _is_created_at_newer(min_allowed, start_time):
        logging.info(
            'Using minimum allowed start_time=%s because configured cursor is older than %s days',
            min_allowed,
            MIN_TIMELINE_LOOKBACK_DAYS,
        )
        return min_allowed
    return start_time


def _read_processed():
    try:
        return set(json.loads(open(PROCESSED_IDS_FILE).read()))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def _save_processed(ids):
    os.makedirs(STATE_DIR, exist_ok=True)
    ordered_ids = sorted(ids, key=int)
    open(PROCESSED_IDS_FILE, 'w').write(json.dumps(ordered_ids[-1000:]))


def _read_retry_queue():
    try:
        retry_items = json.loads(open(RETRY_QUEUE_FILE).read())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    if isinstance(retry_items, dict):
        queue = {}
        for tweet_id, item in retry_items.items():
            if not isinstance(item, dict):
                continue
            normalized_item = dict(item)
            normalized_item['id'] = str(tweet_id)
            queue[str(tweet_id)] = normalized_item
        return queue

    if isinstance(retry_items, list):
        return {
            str(item['id']): item
            for item in retry_items
            if isinstance(item, dict) and item.get('id')
        }

    return {}


def _save_retry_queue(queue):
    os.makedirs(STATE_DIR, exist_ok=True)
    ordered_items = sorted(queue.values(), key=lambda item: int(item['id']))
    open(RETRY_QUEUE_FILE, 'w').write(json.dumps(ordered_items[-1000:]))


# ── Twitter API ───────────────────────────────────────────────────────────────

def _bearer_headers():
    return {'Authorization': f'Bearer {os.environ["BEARER_TOKEN"].strip()}'}


def _oauth1():
    return OAuth1(
        os.environ['CONSUMER_KEY'].strip(),
        os.environ['CONSUMER_SECRET'].strip(),
        os.environ['ACESS_TOKEN'].strip(),
        os.environ['ACESS_TOKEN_SECRET'].strip(),
    )


def _filter_tweets_newer_than_created_at(tweets, last_created_at):
    if not last_created_at:
        return tweets

    if not _parse_created_at(last_created_at):
        return tweets

    newer_tweets = [
        tweet
        for tweet in tweets
        if _is_created_at_newer(tweet.get('created_at'), last_created_at)
    ]
    skipped_count = len(tweets) - len(newer_tweets)
    if skipped_count:
        logging.info(
            'Ignored %s tweet(s) returned at or before last_tweet_created_at=%s',
            skipped_count,
            last_created_at,
        )
    return newer_tweets


def _get_user_by_username(username):
    logging.info('Twitter API request: get_user_by_username username=%s', username)
    r = requests.get(
        f'https://api.x.com/2/users/by/username/{username}',
        headers=_bearer_headers(),
        timeout=30,
    )
    logging.info('Twitter API response: get_user_by_username status=%s', r.status_code)
    r.raise_for_status()
    return r.json()['data']


def _get_user_tweets(user_id, max_results=30, start_time=None):
    params = {
        'max_results':  max_results,
        'tweet.fields': 'author_id,created_at,text',
        'exclude':      'retweets',
    }
    if start_time:
        params['start_time'] = start_time

    logging.info(
        'Twitter API request: get_user_tweets user_id=%s start_time=%s max_results=%s',
        user_id,
        start_time,
        max_results,
    )
    r = requests.get(
        f'https://api.x.com/2/users/{user_id}/tweets',
        headers=_bearer_headers(),
        params=params,
        timeout=30,
    )
    logging.info('Twitter API response: get_user_tweets status=%s', r.status_code)
    r.raise_for_status()
    return r.json()


def _upload_media(image_bytes):
    logging.info('Twitter API request: upload_media bytes=%s', len(image_bytes))
    r = requests.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        auth=_oauth1(),
        files={'media': ('reply.jpg', image_bytes, 'image/jpeg')},
        timeout=60,
    )
    logging.info('Twitter API response: upload_media status=%s', r.status_code)
    r.raise_for_status()
    return r.json()['media_id_string']


def _create_reply(media_id, reply_to_id):
    payload = {
        'text':  'Faça perguntas, verifique as fontes.\nVisite: https://www.inevitavelgpt.com/',
        'media': {'media_ids': [media_id]},
        'reply': {'in_reply_to_tweet_id': reply_to_id},
    }
    logging.info('Twitter API request: create_reply reply_to_id=%s media_id=%s', reply_to_id, media_id)
    r = requests.post(
        'https://api.x.com/2/tweets',
        auth=_oauth1(),
        json=payload,
        timeout=30,
    )
    logging.info('Twitter API response: create_reply status=%s', r.status_code)
    r.raise_for_status()
    return r.json()


# ── Question parsing ──────────────────────────────────────────────────────────

def _strip_accents(text):
    return unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii')


def _parse_tweet(tweet_text):
    stripped = _strip_accents(tweet_text)
    m = _GPT_KEYWORD_RE.search(stripped)
    if not m:
        return None, None

    text = (tweet_text[:m.start()] + tweet_text[m.end():]).strip()
    text = re.sub(r'@\w+\s*', '', text).strip()
    normalized_text = _strip_accents(text)

    if _LIVRO_RE.search(normalized_text):
        return text, 'livro'
    if _RENAN_RE.search(normalized_text):
        return text, 'entrevistas'
    return None, None


# ── Bot API ───────────────────────────────────────────────────────────────────

def _call_bot_api(question, qtype):
    try:
        resp = requests.post(
            BOT_API_URL,
            json={'question': question, 'type': qtype},
            headers={'Content-Type': 'application/json', 'X-Bot-Secret': BOT_API_SECRET},
            timeout=90,
        )
        resp.raise_for_status()
        return resp.json().get('answer', '')
    except Exception as exc:
        logging.error('Bot API error: %s', exc)
        return None


# ── Orquestração principal ────────────────────────────────────────────────────

def _answer_and_reply(tweet_id, question, qtype):
    answer = _call_bot_api(question, qtype)
    if not answer:
        logging.warning('Bot API returned no answer for tweet %s - will retry', tweet_id)
        return False

    try:
        image_bytes = generate_answer_image(question, answer, qtype)
    except Exception as exc:
        logging.error('Image generation failed for tweet %s: %s - will retry', tweet_id, exc)
        return False

    try:
        media_id = _upload_media(image_bytes)
        _create_reply(media_id, tweet_id)
        logging.info('Replied to tweet %s', tweet_id)
    except requests.HTTPError as exc:
        logging.error('Twitter reply failed: %s %s - will retry', exc.response.status_code, exc.response.text[:200])
        return False
    except Exception as exc:
        logging.error('Twitter reply error: %s - will retry', exc)
        return False

    return True


def buscar_e_responder():
    last_created_at = _read_last_created_at()
    min_created_at = _read_default_min_created_at()
    start_time = _effective_start_time(last_created_at, min_created_at)
    processed = _read_processed()
    retry_queue = _read_retry_queue()

    for tweet_id, retry_item in sorted(retry_queue.items(), key=lambda item: int(item[0])):
        if tweet_id in processed:
            logging.info('Retry tweet %s already processed, removing from queue', tweet_id)
            retry_queue.pop(tweet_id, None)
            continue

        question = retry_item.get('question')
        qtype = retry_item.get('type')
        if not question or not qtype:
            logging.info('Invalid retry item for tweet %s, removing from queue', tweet_id)
            retry_queue.pop(tweet_id, None)
            continue

        logging.info('Retrying tweet %s', tweet_id)
        if not _answer_and_reply(tweet_id, question, qtype):
            continue

        processed.add(tweet_id)
        retry_queue.pop(tweet_id, None)
        _save_last_created_at_if_newer(retry_item.get('created_at'))
        _save_processed(processed)
        _save_retry_queue(retry_queue)

    try:
        bot_user = _get_user_by_username(INEVITAVEL_BOT_HANDLE)
        data = _get_user_tweets(bot_user['id'], max_results=100, start_time=start_time)
    except requests.HTTPError as exc:
        logging.error('Twitter timeline lookup failed: %s %s', exc.response.status_code, exc.response.text[:200])
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return
    except Exception as exc:
        logging.error('Twitter timeline lookup error: %s', exc)
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return

    tweets = _filter_tweets_newer_than_created_at(data.get('data') or [], start_time)
    if not tweets:
        logging.info('No new tweets')
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return
    tweets = sorted(
        tweets,
        key=lambda tweet: _parse_created_at(tweet.get('created_at')) or datetime.min.replace(tzinfo=timezone.utc),
    )

    for tweet in tweets:
        tweet_id = str(tweet['id'])
        created_at = tweet.get('created_at')

        if tweet_id in processed:
            logging.info('Already processed tweet %s, skipping', tweet_id)
            continue

        logging.info('Processing tweet %s: %s', tweet_id, tweet['text'][:80])

        question, qtype = _parse_tweet(tweet['text'])
        if not question:
            logging.info('No matching pattern in tweet %s', tweet_id)
            _save_last_created_at_if_newer(created_at)
            continue

        logging.info('Question (%s): %s', qtype, question[:80])

        if not _answer_and_reply(tweet_id, question, qtype):
            retry_queue[tweet_id] = {
                'id': tweet_id,
                'question': question,
                'type': qtype,
                'created_at': created_at,
            }
            _save_retry_queue(retry_queue)
            continue

        processed.add(tweet_id)
        retry_queue.pop(tweet_id, None)
        _save_last_created_at_if_newer(created_at)
        _save_processed(processed)
        _save_retry_queue(retry_queue)

    _save_processed(processed)
    _save_retry_queue(retry_queue)
