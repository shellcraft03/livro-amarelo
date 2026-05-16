import logging
import os
import re
import uuid
import unicodedata
from datetime import datetime, timedelta, timezone

import requests

from . import api, x_api
from .db import connect, dict_cursor

WORKER_ID = os.environ.get('IGPT2_WORKER_ID') or f'igpt2-{os.getpid()}-{uuid.uuid4()}'
LOCK_SECONDS = int(os.environ.get('IGPT2_LOCK_SECONDS', '300'))
BATCH_SIZE = int(os.environ.get('IGPT2_WORKER_BATCH_SIZE', '5'))
INTERVAL_SECONDS = int(os.environ.get('IGPT2_WORKER_INTERVAL_SECONDS', '60'))
MIN_LOOKBACK_DAYS = int(os.environ.get('IGPT2_MIN_LOOKBACK_DAYS', '3'))
MAX_TWEETS_PER_ACCOUNT = int(os.environ.get('IGPT2_MAX_TWEETS_PER_ACCOUNT', '30'))
DEFAULT_MIN_TWEET_CREATED_AT = os.environ.get('DEFAULT_MIN_TWEET_CREATED_AT', '').strip()

LIVRO_RE = re.compile(r'livro\s+amarelo', re.IGNORECASE)
RENAN_RE = re.compile(r'renan\s+santos', re.IGNORECASE)


def _strip_accents(text):
    return unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode('ascii')


def _parse_tweet(text):
    cleaned = re.sub(r'@\w+\s*', '', _strip_accents(text)).strip()
    if LIVRO_RE.search(cleaned):
        return {'question': cleaned, 'type': 'livro'}
    if RENAN_RE.search(cleaned):
        return {'question': cleaned, 'type': 'entrevistas'}
    return None


def _parse_created_at(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(timezone.utc)
    except ValueError:
        logging.warning('Ignoring invalid tweet created_at value: %s', value)
        return None


def _effective_start_time(value):
    candidates = [datetime.now(timezone.utc) - timedelta(days=MIN_LOOKBACK_DAYS)]

    user_cursor = _parse_created_at(value)
    if user_cursor:
        candidates.append(user_cursor)

    default_min = _parse_created_at(DEFAULT_MIN_TWEET_CREATED_AT)
    if default_min:
        candidates.append(default_min)

    start = max(candidates)
    return start.replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _is_auth_error(exc):
    status = getattr(getattr(exc, 'response', None), 'status_code', None)
    text = str(exc).lower()
    try:
        text += ' ' + exc.response.text.lower()
    except Exception:
        pass
    return status in (401, 403) or 'invalid_grant' in text


def _error_code(exc):
    status = getattr(getattr(exc, 'response', None), 'status_code', None)
    if status:
        return f'http_{status}'
    return exc.__class__.__name__


def _get_tweet_cost_cents(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT value
            FROM igpt2_global_settings
            WHERE key = 'tweet_cost_cents'
            LIMIT 1
            """
        )
        row = cur.fetchone()

    if not row:
        raise RuntimeError('Missing igpt2_global_settings.tweet_cost_cents')

    try:
        value = int(row[0])
    except (TypeError, ValueError) as exc:
        raise RuntimeError('Invalid igpt2_global_settings.tweet_cost_cents') from exc

    if value <= 0:
        raise RuntimeError('Invalid igpt2_global_settings.tweet_cost_cents')
    return value


def _acquire_accounts(conn, tweet_cost_cents):
    with dict_cursor(conn) as cur:
        cur.execute(
            """
            SELECT state.user_id
            FROM igpt2_automation_state state
            JOIN igpt2_access_grants access_grant ON access_grant.user_id = state.user_id
            JOIN igpt2_x_oauth_tokens token ON token.user_id = state.user_id
            WHERE access_grant.access_status = 'approved'
              AND access_grant.credit_balance_cents >= %s
              AND token.revoked_at IS NULL
              AND state.next_run_at <= now()
              AND (state.locked_until IS NULL OR state.locked_until < now())
            ORDER BY state.next_run_at ASC
            LIMIT %s
            FOR UPDATE OF state SKIP LOCKED
            """,
            (tweet_cost_cents, BATCH_SIZE),
        )
        ids = [row['user_id'] for row in cur.fetchall()]

        if not ids:
            conn.commit()
            return []

        cur.execute(
            """
            UPDATE igpt2_automation_state
            SET locked_until = now() + (%s || ' seconds')::interval,
                locked_by = %s,
                updated_at = now()
            WHERE user_id = ANY(%s::uuid[])
            """,
            (LOCK_SECONDS, WORKER_ID, ids),
        )

        cur.execute(
            """
            SELECT u.id AS user_id,
                   u.x_user_id,
                   u.x_username,
                   access_grant.credit_balance_cents,
                   state.last_tweet_created_at,
                   token.access_token_enc,
                   token.refresh_token_enc,
                   token.expires_at
            FROM igpt2_users u
            JOIN igpt2_access_grants access_grant ON access_grant.user_id = u.id
            JOIN igpt2_automation_state state ON state.user_id = u.id
            JOIN igpt2_x_oauth_tokens token ON token.user_id = u.id
            WHERE u.id = ANY(%s::uuid[])
            """,
            (ids,),
        )
        accounts = cur.fetchall()
    conn.commit()
    return accounts


def _release_account(conn, user_id, had_error=False):
    next_seconds = max(INTERVAL_SECONDS, 300) if had_error else INTERVAL_SECONDS
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_automation_state
            SET locked_until = NULL,
                locked_by = NULL,
                next_run_at = now() + (%s || ' seconds')::interval,
                consecutive_errors = CASE WHEN %s THEN consecutive_errors + 1 ELSE 0 END,
                updated_at = now()
            WHERE user_id = %s
              AND locked_by = %s
            """,
            (next_seconds, had_error, user_id, WORKER_ID),
        )
    conn.commit()


def _mark_token_revoked(conn, user_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_x_oauth_tokens
            SET revoked_at = now(), updated_at = now()
            WHERE user_id = %s
            """,
            (user_id,),
        )
    conn.commit()


def _has_run(conn, user_id, tweet_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM igpt2_automation_runs
            WHERE user_id = %s
              AND input_tweet_id = %s
            LIMIT 1
            """,
            (user_id, str(tweet_id)),
        )
        return cur.fetchone() is not None


def _record_run(conn, user_id, tweet, parsed, status, tweet_cost_cents, image_generated=False, published_tweet_id=None, api_result=None, error_message=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO igpt2_automation_runs (
              user_id,
              input_tweet_id,
              captured_tweet_created_at,
              source_type,
              image_generated,
              published_tweet_id,
              api_result,
              status,
              error_message,
              balance_delta_cents
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, input_tweet_id) WHERE input_tweet_id IS NOT NULL DO NOTHING
            """,
            (
                user_id,
                str(tweet['id']),
                tweet.get('created_at'),
                parsed['type'],
                image_generated,
                published_tweet_id,
                api_result,
                status,
                (error_message or '')[:1000] if error_message else None,
                -tweet_cost_cents if status == 'published' else 0,
            ),
    )
    conn.commit()


def _record_balance_event(conn, user_id, delta_cents, source, note=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO igpt2_balance_events (
              user_id,
              delta_cents,
              source,
              note,
              created_at
            )
            VALUES (%s, %s, %s, %s, now())
            """,
            (user_id, int(delta_cents), source, note),
        )
    conn.commit()


def _debit_success(conn, user_id, tweet_cost_cents):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_access_grants
            SET credit_balance_cents = GREATEST(0, credit_balance_cents - %s),
                updated_at = now()
            WHERE user_id = %s
              AND credit_balance_cents >= %s
            """,
            (tweet_cost_cents, user_id, tweet_cost_cents),
        )
    conn.commit()
    _record_balance_event(conn, user_id, -tweet_cost_cents, 'bot', 'Publicacao do bot')


def _update_cursor(conn, user_id, tweet):
    created_at = tweet.get('created_at')
    if not created_at:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_automation_state
            SET last_tweet_id = %s,
                last_tweet_created_at = GREATEST(last_tweet_created_at, %s::timestamptz),
                updated_at = now()
            WHERE user_id = %s
            """,
            (str(tweet['id']), created_at, user_id),
        )
    conn.commit()


def _fresh_balance_ok(conn, user_id, tweet_cost_cents):
    with dict_cursor(conn) as cur:
        cur.execute(
            """
            SELECT credit_balance_cents, access_status
            FROM igpt2_access_grants
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
    return bool(row and row['access_status'] == 'approved' and row['credit_balance_cents'] >= tweet_cost_cents)


def _process_tweet(conn, account, tweet, access_token, tweet_cost_cents):
    user_id = account['user_id']

    if _has_run(conn, user_id, tweet['id']):
        _update_cursor(conn, user_id, tweet)
        return

    parsed = _parse_tweet(tweet.get('text'))
    if not parsed:
        logging.info('Captured non-matching tweet @%s tweet=%s created_at=%s', account['x_username'], tweet.get('id'), tweet.get('created_at'))
        _update_cursor(conn, user_id, tweet)
        return

    logging.info('Processing @%s tweet=%s: %s', account['x_username'], tweet['id'], (tweet.get('text') or '')[:80])
    logging.info('Question (%s): %s', parsed['type'], parsed['question'][:80])
    answer = None
    image_generated = False

    try:
        answer = api.answer(parsed['question'], parsed['type'])
        if not answer:
            raise RuntimeError('Bot API returned empty answer')

        image = api.generate_image(parsed['question'], answer, parsed['type'])
        image_generated = True
        media_id = x_api.upload_media(image, access_token)
        if not media_id:
            raise RuntimeError('X media upload returned no media id')

        reply = x_api.create_reply(media_id, tweet['id'], access_token)
        _record_run(
            conn,
            user_id,
            tweet,
            parsed,
            'published',
            tweet_cost_cents,
            image_generated=image_generated,
            published_tweet_id=(reply.get('data') or {}).get('id'),
            api_result=f"x_api_status={reply.get('_http_status', 200)}",
        )
        _debit_success(conn, user_id, tweet_cost_cents)
        _update_cursor(conn, user_id, tweet)
    except Exception as exc:
        logging.exception('Tweet processing failed @%s tweet=%s', account['x_username'], tweet.get('id'))
        _record_run(
            conn,
            user_id,
            tweet,
            parsed,
            'failed',
            tweet_cost_cents,
            image_generated=image_generated,
            error_message=_error_code(exc),
        )
        _update_cursor(conn, user_id, tweet)
        raise


def _process_account(conn, account, tweet_cost_cents):
    had_error = False
    try:
        access_token = x_api.refresh_access_token_if_needed(conn, account)
        tweets = x_api.get_user_tweets(
            account['x_user_id'],
            access_token,
            _effective_start_time(account.get('last_tweet_created_at')),
            MAX_TWEETS_PER_ACCOUNT,
        )
        if not tweets:
            logging.info('No tweets for @%s', account['x_username'])
            return

        for tweet in tweets:
            if not _fresh_balance_ok(conn, account['user_id'], tweet_cost_cents):
                logging.info('Stopping @%s: no balance or not approved', account['x_username'])
                break
            try:
                _process_tweet(conn, account, tweet, access_token, tweet_cost_cents)
            except Exception as exc:
                had_error = True
                logging.error('Tweet failed @%s tweet=%s: %s', account['x_username'], tweet.get('id'), exc)
                if _is_auth_error(exc):
                    _mark_token_revoked(conn, account['user_id'])
                    break
    except Exception as exc:
        had_error = True
        logging.error('Account failed @%s: %s', account['x_username'], exc)
        if _is_auth_error(exc):
            _mark_token_revoked(conn, account['user_id'])
    finally:
        _release_account(conn, account['user_id'], had_error)


def run_once():
    with connect() as conn:
        tweet_cost_cents = _get_tweet_cost_cents(conn)
        logging.info('Using tweet_cost_cents=%s', tweet_cost_cents)
        accounts = _acquire_accounts(conn, tweet_cost_cents)
        if not accounts:
            logging.info('No eligible accounts')
            return

        logging.info('Acquired %s account(s)', len(accounts))
        for account in accounts:
            _process_account(conn, account, tweet_cost_cents)
