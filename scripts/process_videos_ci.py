import os
import re
import json
import sys
import math
import unicodedata
import requests
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

import psycopg2
from psycopg2.extras import RealDictCursor
from openai import OpenAI
from pinecone import Pinecone
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig
from youtube_transcript_api._transcripts import TranscriptList

DATABASE_URL      = os.environ["DATABASE_URL"]
OPENAI_API_KEY    = os.environ["OPENAI_API_KEY"]
PINECONE_API_KEY  = os.environ["PINECONE_API_KEY"]
PINECONE_INDEX    = os.environ["PINECONE_INDEX_ENTREVISTAS"]
WEBSHARE_USERNAME = os.environ["WEBSHARE_PROXY_USERNAME"]
WEBSHARE_PASSWORD = os.environ["WEBSHARE_PROXY_PASSWORD"]
SYSTEM_PROMPT     = os.environ["SYSTEM_PROMPT_CURADORIA"]
BLOCKED_YOUTUBE_CHANNEL_NAMES = os.environ["BLOCKED_YOUTUBE_CHANNEL_NAMES"]

EMBEDDING_MODEL = 'text-embedding-3-large'
CHUNK_SIZE      = 400
UPSERT_BATCH    = 100
SPEAKER_BLOCK   = 50

PROXY_URL = f'http://{WEBSHARE_USERNAME}:{WEBSHARE_PASSWORD}@p.webshare.io:80'
PROXIES   = {'http': PROXY_URL, 'https': PROXY_URL}

ytt_api = YouTubeTranscriptApi(
    proxy_config=WebshareProxyConfig(
        proxy_username=WEBSHARE_USERNAME,
        proxy_password=WEBSHARE_PASSWORD,
        filter_ip_locations=["us"],
    )
)

openai_client  = OpenAI(api_key=OPENAI_API_KEY)
pc             = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(PINECONE_INDEX)


def normalize_channel_name(name):
    if not name or not isinstance(name, str):
        return None
    normalized = unicodedata.normalize('NFKD', name)
    without_accents = ''.join(
        char for char in normalized
        if not unicodedata.combining(char)
    )
    return re.sub(r'\s+', ' ', without_accents).strip().lower()


def parse_blocked_channel_names(value):
    return {
        normalized
        for normalized in (normalize_channel_name(part) for part in (value or '').split(';'))
        if normalized
    }


def find_blocked_channel_term(channel_name):
    normalized_channel = normalize_channel_name(channel_name)
    if not normalized_channel:
        return None
    return next(
        (
            term for term in BLOCKED_CHANNEL_NAMES
            if re.search(rf'(?<!\w){re.escape(term)}(?!\w)', normalized_channel)
        ),
        None,
    )


BLOCKED_CHANNEL_NAMES = parse_blocked_channel_names(BLOCKED_YOUTUBE_CHANNEL_NAMES)
print(f'Bloqueio de canais do YouTube: {len(BLOCKED_CHANNEL_NAMES)} termo(s) configurado(s).')


# ── Shared helpers ────────────────────────────────────────────────────────────

def extract_video_id(url):
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


def sanitize_field(value, max_len=200):
    if not value or not isinstance(value, str):
        return None
    return re.sub(r'[\x00-\x1F\x7F]', ' ', value).strip()[:max_len]


def extract_video_metadata_from_innertube(innertube_data):
    details = innertube_data.get('videoDetails') or {}
    microformat = innertube_data.get('microformat', {}).get('playerMicroformatRenderer', {})
    title = details.get('title') or microformat.get('title', {}).get('simpleText')
    channel = details.get('author') or microformat.get('ownerChannelName')
    published_at = microformat.get('publishDate') or microformat.get('uploadDate')
    return {
        'published_at': published_at,
        'title': sanitize_field(title, 300),
        'channel': sanitize_field(channel, 200),
    }


def fetch_transcript_data(video_id):
    """Single transcript and metadata fetch used by both curation and indexing."""
    fetcher = ytt_api._fetcher
    html = fetcher._fetch_video_html(video_id)
    api_key = fetcher._extract_innertube_api_key(html, video_id)
    innertube_data = fetcher._fetch_innertube_data(video_id, api_key)
    captions_json = fetcher._extract_captions_json(innertube_data, video_id)
    transcript_list = TranscriptList.build(fetcher._http_client, video_id, captions_json)
    transcript = transcript_list.find_transcript(['pt-BR', 'pt', 'pt-PT', 'en'])
    snippets = transcript.fetch()
    segments = [{'text': s.text, 'offset_ms': int(s.start * 1000)} for s in snippets]
    return segments, extract_video_metadata_from_innertube(innertube_data)


def reject_video(conn, vid_id, reason):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE videos SET curated = false, rejection_reason = %s, curated_at = NOW() WHERE id = %s",
            (reason, vid_id),
        )
    conn.commit()
    print(f"[{vid_id}] Reprovado: {reason}")


# ── Curation ──────────────────────────────────────────────────────────────────

def curate(conn, video, segments):
    vid_id     = video['id']
    title      = sanitize_field(video.get('title'), 300)
    individual = sanitize_field(video.get('individual'), 200)
    full_text  = ' '.join(s['text'] for s in segments)

    parts = []
    if title:      parts.append(f"Título informado: {title}")
    if individual: parts.append(f"Entrevistado informado: {individual}")
    parts.append(f"Tamanho total da transcrição: ~{round(len(full_text) / 5)} palavras")
    parts.append(f"\n<TRANSCRICAO_NAO_CONFIAVEL>\n{full_text}\n</TRANSCRICAO_NAO_CONFIAVEL>")

    try:
        res = openai_client.chat.completions.create(
            model='gpt-4.1-mini',
            temperature=0,
            max_tokens=200,
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user',   'content': '\n'.join(parts)},
            ],
        )
        raw = res.choices[0].message.content.strip()
    except Exception as e:
        print(f"[{vid_id}] Erro na chamada OpenAI (curadoria): {e}")
        return None

    try:
        verdict = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[{vid_id}] Resposta inválida do modelo: {raw}")
        return None

    approved = bool(verdict.get('approved'))
    reason   = str(verdict.get('reason', ''))[:500]

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE videos SET curated = %s, rejection_reason = %s, curated_at = NOW() WHERE id = %s",
            (approved, None if approved else reason, vid_id),
        )
    conn.commit()
    print(f"[{vid_id}] {'✓ Aprovado' if approved else '✗ Reprovado'}: {reason}")
    return approved


# ── Indexing ──────────────────────────────────────────────────────────────────

def fetch_video_metadata(video_id):
    try:
        headers = {'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0'}
        res  = requests.get(f'https://www.youtube.com/watch?v={video_id}', headers=headers, proxies=PROXIES, timeout=15)
        html = res.text
        m_date    = re.search(r'"publishDate"\s*:\s*"([^"]+)"', html) or re.search(r'"uploadDate"\s*:\s*"([^"]+)"', html)
        m_title   = re.search(r'"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"', html)
        m_channel = re.search(r'"ownerChannelName"\s*:\s*"([^"]+)"', html)
        return {
            'published_at': m_date.group(1).split('T')[0] if m_date else None,
            'title':        m_title.group(1) if m_title else None,
            'channel':      m_channel.group(1) if m_channel else None,
        }
    except Exception:
        return {'published_at': None, 'title': None, 'channel': None}


def chunk_segments(segments, max_chars=CHUNK_SIZE):
    chunks, buffer = [], []

    def flush(segs):
        if not segs:
            return
        raw  = ' '.join(s['text'].strip() for s in segs if s['text'].strip()).strip()
        text = raw.replace('<', '&lt;').replace('>', '&gt;')
        if len(text) >= 80:
            chunks.append({'text': text, 'startOffsetMs': segs[0]['offset_ms']})

    def split_buffer():
        nonlocal buffer
        for i in range(len(buffer) - 1, 0, -1):
            if re.search(r'[.!?]\s*$', buffer[i]['text']):
                flush(buffer[:i + 1]); buffer = buffer[i + 1:]; return
        for i in range(len(buffer) - 1, 0, -1):
            if re.search(r'[,;]\s*$', buffer[i]['text']):
                flush(buffer[:i + 1]); buffer = buffer[i + 1:]; return
        mid = max(1, len(buffer) // 2)
        flush(buffer[:mid]); buffer = buffer[mid:]

    for seg in segments:
        if not seg['text'].strip():
            continue
        buffer.append(seg)
        if len(' '.join(s['text'] for s in buffer)) > max_chars:
            split_buffer()

    flush(buffer)
    return chunks


def filter_speaker_segments(segments, individual):
    name, kept = individual or 'Renan Santos', []
    for i in range(0, len(segments), SPEAKER_BLOCK):
        block = segments[i:i + SPEAKER_BLOCK]
        text  = '\n'.join(f"{j}: {s['text'].strip()}" for j, s in enumerate(block))
        try:
            res = openai_client.chat.completions.create(
                model='gpt-4.1',
                temperature=0,
                max_tokens=300,
                messages=[
                    {
                        'role': 'system',
                        'content': f'Você receberá linhas numeradas de uma transcrição de entrevista. Identifique quais linhas são falas de "{name}" (não do entrevistador nem de terceiros). Retorne APENAS um array JSON com os números das linhas de "{name}". Exemplo: [0,1,2,5,6]. Sem texto adicional.',
                    },
                    {'role': 'user', 'content': text},
                ],
            )
            indices = json.loads(res.choices[0].message.content.strip())
        except Exception as e:
            print(f'  bloco {i}–{i + len(block)}: erro, incluindo tudo. {e}')
            kept.extend(block)
            continue
        for j in indices:
            if isinstance(j, int) and j < len(block):
                kept.append(block[j])
        print(f'\r  filtrando segmentos {min(i + SPEAKER_BLOCK, len(segments))}/{len(segments)}', end='', flush=True)
    return kept


def embed_batch(texts):
    res = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in res.data]


def index_video(conn, video, segments, meta=None):
    vid_id     = video['id']
    url        = video['url']
    individual = video.get('individual')
    video_id   = extract_video_id(url)

    if not video_id:
        print(f'[{vid_id}] URL inválida, pulando.')
        return False

    print(f'[{vid_id}] Buscando metadados...')
    meta         = meta or fetch_video_metadata(video_id)
    published_at = meta['published_at']
    yt_title     = meta['title']
    channel      = meta['channel']
    title        = yt_title or video.get('title') or ''

    if published_at: print(f'[{vid_id}] Data: {published_at}')
    if yt_title:     print(f'[{vid_id}] Título: {yt_title}')
    if channel:      print(f'[{vid_id}] Canal: {channel}')

    print(f'[{vid_id}] {len(segments)} segmentos — filtrando falas de {individual or "Renan Santos"}...')
    filtered = filter_speaker_segments(segments, individual)
    print(f'\n[{vid_id}] {len(filtered)}/{len(segments)} segmentos após filtro de speaker.')

    chunks = chunk_segments(filtered)
    if not chunks:
        print(f'[{vid_id}] Nenhum chunk útil gerado.')
        return False

    print(f'[{vid_id}] {len(chunks)} chunks — gerando embeddings...')
    total = 0
    for i in range(0, len(chunks), UPSERT_BATCH):
        batch      = chunks[i:i + UPSERT_BATCH]
        embeddings = embed_batch([c['text'] for c in batch])
        records = []
        for j, (chunk, emb) in enumerate(zip(batch, embeddings)):
            start_seconds = math.floor(chunk['startOffsetMs'] / 1000)
            records.append({
                'id':     f'yt-{video_id}-c{i + j}',
                'values': emb,
                'metadata': {
                    'text':          chunk['text'],
                    'source':        'youtube',
                    'video_id':      video_id,
                    'url':           url,
                    'source_url':    f'https://www.youtube.com/watch?v={video_id}&t={start_seconds}s',
                    'title':         title,
                    'channel':       channel or '',
                    'individual':    individual or '',
                    'published_at':  published_at or '',
                    'chunk':         i + j,
                    'start_seconds': start_seconds,
                },
            })
        pinecone_index.upsert(vectors=records, namespace='entrevistas')
        total += len(records)
        print(f'\r  chunks {total}/{len(chunks)}', end='', flush=True)

    print()
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE videos
            SET indexed = true, indexed_at = NOW(),
                published_at = %s,
                title   = COALESCE(%s, title),
                channel = COALESCE(%s, channel)
            WHERE id = %s
            """,
            (published_at, title or None, channel, vid_id),
        )
    conn.commit()
    print(f'[{vid_id}] Indexado: {total} vetores.\n')
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    conn = psycopg2.connect(DATABASE_URL)

    # Fase 1: vídeos pendentes de curadoria — busca transcrição uma única vez,
    # cura e, se aprovado, já indexa com os mesmos segmentos.
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM videos WHERE curated IS NULL ORDER BY created_at")
        pending = cur.fetchall()

    if pending:
        print(f'{len(pending)} vídeo(s) para curar.\n')
        for video in pending:
            vid_id   = video['id']
            video_id = extract_video_id(video['url'])
            if not video_id:
                print(f'[{vid_id}] URL invalida, pulando.')
                continue
            print(f'[{vid_id}] Buscando transcrição: {video["url"]}')
            try:
                segments, meta = fetch_transcript_data(video_id)
            except Exception as e:
                print(f'[{vid_id}] Transcrição indisponível, será tentado novamente: {e}')
                continue
            channel = meta.get('channel')
            if not channel:
                print(f'[{vid_id}] Nome do canal indisponivel, sera tentado novamente.')
                continue
            blocked_term = find_blocked_channel_term(channel)
            if blocked_term:
                reject_video(conn, vid_id, f'Canal bloqueado ({channel})')
                continue
            approved = curate(conn, video, segments)
            if approved:
                try:
                    index_video(conn, video, segments, meta)
                except Exception as e:
                    print(f'[{vid_id}] Erro ao indexar: {e}')
    else:
        print('Nenhum vídeo pendente de curadoria.')

    # Fase 2: vídeos aprovados em runs anteriores que ainda não foram indexados.
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM videos WHERE curated = true AND indexed = false ORDER BY created_at")
        leftover = cur.fetchall()

    if leftover:
        print(f'\n{len(leftover)} vídeo(s) aprovado(s) aguardando indexação.\n')
        for video in leftover:
            vid_id   = video['id']
            video_id = extract_video_id(video['url'])
            if not video_id:
                print(f'[{vid_id}] URL inválida, pulando.')
                continue
            print(f'[{vid_id}] Buscando transcrição: {video["url"]}')
            try:
                segments, meta = fetch_transcript_data(video_id)
            except Exception as e:
                print(f'[{vid_id}] Erro ao buscar transcrição: {e}')
                continue
            try:
                index_video(conn, video, segments, meta)
            except Exception as e:
                print(f'[{vid_id}] Erro ao indexar: {e}')

    conn.close()
    print('Concluído.')


if __name__ == '__main__':
    main()
