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


def _read_processed():
    try:
        return set(json.loads(open(PROCESSED_IDS_FILE).read()))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def _save_processed(ids):
    os.makedirs(STATE_DIR, exist_ok=True)
    open(PROCESSED_IDS_FILE, 'w').write(json.dumps(list(ids)[-1000:]))


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

    r = requests.get(
        'https://api.x.com/2/tweets/search/recent',
        headers=_bearer_headers(),
        params=params,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def _upload_media(image_bytes):
    r = requests.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        auth=_oauth1(),
        files={'media': ('reply.jpg', image_bytes, 'image/jpeg')},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()['media_id_string']


def _create_reply(media_id, reply_to_id):
    payload = {
        'text':  'https://www.inevitavelgpt.com/',
        'media': {'media_ids': [media_id]},
        'reply': {'in_reply_to_tweet_id': reply_to_id},
    }
    r = requests.post(
        'https://api.x.com/2/tweets',
        auth=_oauth1(),
        json=payload,
        timeout=30,
    )
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


def buscar_e_responder():
    last_id   = _read_last_id()
    processed = _read_processed()

    query = f'from:{INEVITAVEL_BOT_HANDLE} ("livro amarelo" OR "renan santos")'

    try:
        data = _search_recent(query, max_results=10, since_id=last_id)
    except requests.HTTPError as exc:
        logging.error('Twitter search failed: %s %s', exc.response.status_code, exc.response.text[:200])
        return
    except Exception as exc:
        logging.error('Twitter search error: %s', exc)
        return

    tweets = data.get('data') or []
    if not tweets:
        logging.info('No new tweets')
        return

    users_by_id = {
        str(u['id']): u['username'].lower()
        for u in (data.get('includes') or {}).get('users', [])
    }

    new_max_id = None

    for tweet in tweets:
        tweet_id = str(tweet['id'])

        if tweet_id in processed:
            continue

        author_handle = users_by_id.get(str(tweet['author_id']), '').lower()
        if author_handle != INEVITAVEL_BOT_HANDLE.lower():
            logging.info('Skipping tweet %s from @%s', tweet_id, author_handle)
            processed.add(tweet_id)
            new_max_id = _max_id(tweet_id, new_max_id)
            continue

        logging.info('Processing tweet %s: %s', tweet_id, tweet['text'][:80])

        question, qtype = _parse_tweet(tweet['text'])
        if not question:
            logging.info('No matching pattern in tweet %s', tweet_id)
            processed.add(tweet_id)
            new_max_id = _max_id(tweet_id, new_max_id)
            continue

        logging.info('Question (%s): %s', qtype, question[:80])

        answer = _call_bot_api(question, qtype)
        if not answer:
            logging.warning('Bot API returned no answer for tweet %s — will retry', tweet_id)
            continue

        try:
            image_bytes = generate_answer_image(question, answer, qtype)
        except Exception as exc:
            logging.error('Image generation failed for tweet %s: %s — will retry', tweet_id, exc)
            continue

        try:
            media_id = _upload_media(image_bytes)
            _create_reply(media_id, tweet_id)
            logging.info('Replied to tweet %s', tweet_id)
        except requests.HTTPError as exc:
            logging.error('Twitter reply failed: %s %s — will retry', exc.response.status_code, exc.response.text[:200])
            continue
        except Exception as exc:
            logging.error('Twitter reply error: %s — will retry', exc)
            continue

        processed.add(tweet_id)
        new_max_id = _max_id(tweet_id, new_max_id)

    if new_max_id:
        _save_last_id(new_max_id)
    _save_processed(processed)
