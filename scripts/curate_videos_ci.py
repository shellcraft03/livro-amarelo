import os
import re
import json
import sys
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass
import psycopg2
from psycopg2.extras import RealDictCursor
from openai import OpenAI
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

DATABASE_URL       = os.environ["DATABASE_URL"]
OPENAI_API_KEY     = os.environ["OPENAI_API_KEY"]
WEBSHARE_USERNAME  = os.environ["WEBSHARE_PROXY_USERNAME"]
WEBSHARE_PASSWORD  = os.environ["WEBSHARE_PROXY_PASSWORD"]
SYSTEM_PROMPT      = os.environ["SYSTEM_PROMPT_ENTREVISTAS"]

ytt_api = YouTubeTranscriptApi(
    proxy_config=WebshareProxyConfig(
        proxy_username=WEBSHARE_USERNAME,
        proxy_password=WEBSHARE_PASSWORD,
    )
)

openai_client = OpenAI(api_key=OPENAI_API_KEY)


def extract_video_id(url):
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


def fetch_transcript(video_id):
    try:
        snippets = ytt_api.fetch(video_id, languages=['pt'])
    except Exception:
        snippets = ytt_api.fetch(video_id)
    return ' '.join(s.text for s in snippets)


def sanitize_field(value, max_len=200):
    if not value or not isinstance(value, str):
        return None
    return re.sub(r'[\x00-\x1F\x7F]', ' ', value).strip()[:max_len]


def curate(conn, video):
    vid_id     = video['id']
    url        = video['url']
    title      = sanitize_field(video.get('title'), 300)
    individual = sanitize_field(video.get('individual'), 200)

    print(f"[{vid_id}] Curando: {url}")

    video_id = extract_video_id(url)
    if not video_id:
        print(f"[{vid_id}] URL inválida, pulando.")
        return

    try:
        full = fetch_transcript(video_id)
    except Exception as e:
        print(f"[{vid_id}] Não foi possível obter transcrição, pulando (será tentado novamente): {e}")
        return

    parts = []
    if title:
        parts.append(f"Título informado: {title}")
    if individual:
        parts.append(f"Entrevistado informado: {individual}")
    parts.append(f"Tamanho total da transcrição: ~{round(len(full) / 5)} palavras")
    parts.append(f"\nTranscrição:\n{full}")
    user_message = '\n'.join(parts)

    try:
        res = openai_client.chat.completions.create(
            model='gpt-4.1-mini',
            temperature=0,
            max_tokens=200,
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user',   'content': user_message},
            ],
        )
        raw = res.choices[0].message.content.strip()
    except Exception as e:
        print(f"[{vid_id}] Erro na chamada OpenAI: {e}")
        return

    try:
        verdict = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[{vid_id}] Resposta inválida do modelo: {raw}")
        return

    approved = bool(verdict.get('approved'))
    reason   = str(verdict.get('reason', ''))[:500]

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE videos
            SET curated          = %s,
                rejection_reason = %s,
                curated_at       = NOW()
            WHERE id = %s
            """,
            (approved, None if approved else reason, vid_id),
        )
    conn.commit()

    print(f"[{vid_id}] {'✓ Aprovado' if approved else '✗ Reprovado'}: {reason}\n")


def main():
    conn = psycopg2.connect(DATABASE_URL)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM videos WHERE curated IS NULL ORDER BY created_at")
        pending = cur.fetchall()

    if not pending:
        print("Nenhum vídeo pendente de curadoria.")
        conn.close()
        sys.exit(0)

    print(f"{len(pending)} vídeo(s) para curar.\n")

    for video in pending:
        curate(conn, video)

    conn.close()
    print("Curadoria concluída.")


if __name__ == '__main__':
    main()
