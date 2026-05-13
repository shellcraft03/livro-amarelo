import io
import json
import logging
import os
import re
import unicodedata

import requests
from requests_oauthlib import OAuth1

from .ImageGenerator import generate_answer_image

INEVITAVEL_GPT_KEYWORD = os.environ['INEVITAVEL_GPT_KEYWORD']
INEVITAVEL_BOT_HANDLE  = os.environ['INEVITAVEL_BOT_HANDLE']
BOT_API_URL            = os.environ['BOT_API_URL']
BOT_API_SECRET         = os.environ['BOT_API_SECRET']

# Railway: monte um volume em /data e defina STATE_DIR=/data para persistência
STATE_DIR           = os.environ.get('STATE_DIR', '/tmp')
LAST_ID_FILE        = os.path.join(STATE_DIR, 'last_tweet_id.txt')
PROCESSED_IDS_FILE  = os.path.join(STATE_DIR, 'processed_ids.json')
RETRY_QUEUE_FILE    = os.path.join(STATE_DIR, 'retry_tweets.json')

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

def _read_last_id():
    try:
        return open(LAST_ID_FILE).read().strip() or None
    except FileNotFoundError:
        return None


def _save_last_id(tweet_id):
    os.makedirs(STATE_DIR, exist_ok=True)
    open(LAST_ID_FILE, 'w').write(str(tweet_id))


def _read_default_min_since_id():
    min_since_id = os.environ.get('DEFAULT_MIN_SINCE_ID', '').strip()
    if not min_since_id:
        return None

    try:
        int(min_since_id)
    except ValueError:
        logging.warning('Ignoring invalid DEFAULT_MIN_SINCE_ID env var: %s', min_since_id)
        return None

    return min_since_id


def _effective_since_id(last_id, min_since_id):
    if not min_since_id:
        return last_id
    if not last_id:
        return min_since_id
    return _max_id(min_since_id, last_id)


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


def _filter_tweets_newer_than_since_id(tweets, since_id):
    if not since_id:
        return tweets

    try:
        since_int = int(since_id)
    except ValueError:
        return tweets

    newer_tweets = [tweet for tweet in tweets if int(tweet['id']) > since_int]
    skipped_count = len(tweets) - len(newer_tweets)
    if skipped_count:
        logging.info('Ignored %s tweet(s) returned at or before since_id=%s', skipped_count, since_id)
    return newer_tweets


def _search_recent(query, max_results=30, since_id=None):
    params = {
        'query':        query,
        'max_results':  max_results,
        'tweet.fields': 'author_id,created_at,text',
        'expansions':   'author_id',
        'user.fields':  'username',
    }
    if since_id:
        params['since_id'] = since_id

    logging.info(
        'Twitter API request: search_recent since_id=%s max_results=%s',
        since_id,
        max_results,
    )
    r = requests.get(
        'https://api.x.com/2/tweets/search/recent',
        headers=_bearer_headers(),
        params=params,
        timeout=30,
    )
    logging.info('Twitter API response: search_recent status=%s', r.status_code)
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
    logging.info('Twitter API response: upload_media status=%s body=%s', r.status_code, r.text[:500])
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
    text = (tweet_text[:m.start()] + tweet_text[m.end():]).strip() if m else tweet_text.strip()
    text = re.sub(r'@\w+\s*', '', text).strip()

    if _LIVRO_RE.search(text):
        return text, 'livro'
    if _RENAN_RE.search(text):
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

def _max_id(a, b):
    return a if (b is None or int(a) > int(b)) else b


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
    last_id   = _read_last_id()
    min_since_id = _read_default_min_since_id()
    since_id = _effective_since_id(last_id, min_since_id)
    processed = _read_processed()
    retry_queue = _read_retry_queue()

    for tweet_id, retry_item in sorted(retry_queue.items(), key=lambda item: int(item[0])):
        if tweet_id in processed:
            logging.info('Retry tweet %s already processed, removing from queue', tweet_id)
            retry_queue.pop(tweet_id, None)
            continue
        if min_since_id and int(tweet_id) <= int(min_since_id):
            logging.info('Retry tweet %s is before DEFAULT_MIN_SINCE_ID, removing from queue', tweet_id)
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

    query = f'from:{INEVITAVEL_BOT_HANDLE} ("livro amarelo" OR "renan santos")'

    try:
        data = _search_recent(query, max_results=10, since_id=since_id)
    except requests.HTTPError as exc:
        logging.error('Twitter search failed: %s %s', exc.response.status_code, exc.response.text[:200])
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return
    except Exception as exc:
        logging.error('Twitter search error: %s', exc)
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return

    tweets = _filter_tweets_newer_than_since_id(data.get('data') or [], since_id)
    if not tweets:
        logging.info('No new tweets')
        _save_processed(processed)
        _save_retry_queue(retry_queue)
        return

    users_by_id = {
        str(u['id']): u['username'].lower()
        for u in (data.get('includes') or {}).get('users', [])
    }

    new_max_id = None
    already_processed_max = None
    saw_new_tweet = False

    for tweet in tweets:
        tweet_id = str(tweet['id'])

        if tweet_id in processed:
            logging.info('Already processed tweet %s, skipping', tweet_id)
            already_processed_max = _max_id(tweet_id, already_processed_max)
            continue

        saw_new_tweet = True

        author_handle = users_by_id.get(str(tweet['author_id']), '').lower()
        if author_handle != INEVITAVEL_BOT_HANDLE.lower():
            logging.info('Skipping tweet %s from @%s', tweet_id, author_handle)
            new_max_id = _max_id(tweet_id, new_max_id)
            continue

        logging.info('Processing tweet %s: %s', tweet_id, tweet['text'][:80])

        question, qtype = _parse_tweet(tweet['text'])
        if not question:
            logging.info('No matching pattern in tweet %s', tweet_id)
            new_max_id = _max_id(tweet_id, new_max_id)
            continue

        logging.info('Question (%s): %s', qtype, question[:80])

        if not _answer_and_reply(tweet_id, question, qtype):
            retry_queue[tweet_id] = {'id': tweet_id, 'question': question, 'type': qtype}
            new_max_id = _max_id(tweet_id, new_max_id)
            continue

        processed.add(tweet_id)
        retry_queue.pop(tweet_id, None)
        new_max_id = _max_id(tweet_id, new_max_id)

    # Anti-loop: if the entire batch was already-processed (no new tweets), advance cursor
    if not saw_new_tweet and already_processed_max:
        new_max_id = already_processed_max

    if new_max_id:
        _save_last_id(str(int(new_max_id) + 1))
    _save_processed(processed)
    _save_retry_queue(retry_queue)
