import base64
import os
from datetime import datetime, timedelta, timezone

import requests

from .crypto import decrypt_secret, encrypt_secret

X_CLIENT_ID = os.environ['X_CLIENT_ID']
X_CLIENT_SECRET = os.environ.get('X_CLIENT_SECRET', '').strip()

TOKEN_URL = 'https://api.x.com/2/oauth2/token'
TWEET_TEXT = 'Faca perguntas, verifique as fontes.\nVisite: https://www.inevitavelgpt.com/'


def _auth_headers():
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    if X_CLIENT_SECRET:
        raw = f'{X_CLIENT_ID}:{X_CLIENT_SECRET}'.encode()
        headers['Authorization'] = 'Basic ' + base64.b64encode(raw).decode()
    return headers


def _bearer(access_token):
    return {'Authorization': f'Bearer {access_token}'}


def refresh_access_token_if_needed(conn, account):
    expires_at = account.get('expires_at')
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and expires_at - datetime.now(timezone.utc) > timedelta(minutes=2):
        return decrypt_secret(account['access_token_enc'])

    if not account.get('refresh_token_enc'):
        return decrypt_secret(account['access_token_enc'])

    refresh_token = decrypt_secret(account['refresh_token_enc'])
    response = requests.post(
        TOKEN_URL,
        headers=_auth_headers(),
        data={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
            'client_id': X_CLIENT_ID,
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    expires_at_new = None
    if data.get('expires_in'):
        expires_at_new = datetime.now(timezone.utc) + timedelta(seconds=int(data['expires_in']))

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_x_oauth_tokens
            SET access_token_enc = %s,
                refresh_token_enc = COALESCE(%s, refresh_token_enc),
                token_type = %s,
                scope = %s,
                expires_at = %s,
                revoked_at = NULL,
                updated_at = now()
            WHERE user_id = %s
            """,
            (
                encrypt_secret(data['access_token']),
                encrypt_secret(data['refresh_token']) if data.get('refresh_token') else None,
                data.get('token_type', 'bearer'),
                data.get('scope'),
                expires_at_new,
                account['user_id'],
            ),
        )
    conn.commit()
    return data['access_token']


def get_user_tweets(x_user_id, access_token, start_time, max_results):
    response = requests.get(
        f'https://api.x.com/2/users/{x_user_id}/tweets',
        headers=_bearer(access_token),
        params={
            'max_results': max_results,
            'tweet.fields': 'author_id,created_at,text',
            'exclude': 'retweets',
            'start_time': start_time,
        },
        timeout=30,
    )
    response.raise_for_status()
    tweets = response.json().get('data') or []
    return sorted(tweets, key=lambda item: item.get('created_at') or '')


def upload_media(image_bytes, access_token):
    response = requests.post(
        'https://api.x.com/2/media/upload',
        headers={**_bearer(access_token), 'Content-Type': 'application/json'},
        json={
            'media': base64.b64encode(image_bytes).decode(),
            'media_category': 'tweet_image',
            'media_type': 'image/jpeg',
        },
        timeout=90,
    )
    response.raise_for_status()
    data = response.json().get('data') or {}
    return data.get('id') or data.get('media_id_string')


def create_reply(media_id, reply_to_id, access_token):
    response = requests.post(
        'https://api.x.com/2/tweets',
        headers={**_bearer(access_token), 'Content-Type': 'application/json'},
        json={
            'text': TWEET_TEXT,
            'media': {'media_ids': [str(media_id)]},
            'reply': {'in_reply_to_tweet_id': str(reply_to_id)},
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    data['_http_status'] = response.status_code
    return data
