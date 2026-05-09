import os
import re
import sys
import json
import math
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

DATABASE_URL      = os.environ["DATABASE_URL"]
OPENAI_API_KEY    = os.environ["OPENAI_API_KEY"]
PINECONE_API_KEY  = os.environ["PINECONE_API_KEY"]
PINECONE_INDEX    = os.environ.get("PINECONE_INDEX_ENTREVISTAS") or os.environ["PINECONE_INDEX"]
WEBSHARE_USERNAME = os.environ["WEBSHARE_PROXY_USERNAME"]
WEBSHARE_PASSWORD = os.environ["WEBSHARE_PROXY_PASSWORD"]

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
    )
)

openai_client = OpenAI(api_key=OPENAI_API_KEY)
pc            = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(PINECONE_INDEX)


def chunk_segments(segments, max_chars=CHUNK_SIZE):
    chunks = []
    buffer = []

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
                flush(buffer[:i + 1])
                buffer = buffer[i + 1:]
                return
        for i in range(len(buffer) - 1, 0, -1):
            if re.search(r'[,;]\s*$', buffer[i]['text']):
                flush(buffer[:i + 1])
                buffer = buffer[i + 1:]
                return
        mid = max(1, len(buffer) // 2)
        flush(buffer[:mid])
        buffer = buffer[mid:]

    for seg in segments:
        word = seg['text'].strip()
        if not word:
            continue
        buffer.append(seg)
        if len(' '.join(s['text'] for s in buffer)) > max_chars:
            split_buffer()

    flush(buffer)
    return chunks


def extract_video_id(url):
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


def fetch_video_metadata(video_id):
    try:
        headers = {'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0'}
        res  = requests.get(f'https://www.youtube.com/watch?v={video_id}', headers=headers, proxies=PROXIES, timeout=15)
        html = res.text

        m_date       = re.search(r'"publishDate"\s*:\s*"([^"]+)"', html) or re.search(r'"uploadDate"\s*:\s*"([^"]+)"', html)
        published_at = m_date.group(1).split('T')[0] if m_date else None

        m_title = re.search(r'"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"', html)
        title   = m_title.group(1) if m_title else None

        m_channel = re.search(r'"ownerChannelName"\s*:\s*"([^"]+)"', html)
        channel   = m_channel.group(1) if m_channel else None

        return {'published_at': published_at, 'title': title, 'channel': channel}
    except Exception:
        return {'published_at': None, 'title': None, 'channel': None}


def fetch_transcript(video_id):
    try:
        snippets = ytt_api.fetch(video_id, languages=['pt'])
    except Exception:
        snippets = ytt_api.fetch(video_id)
    return [{'text': s.text, 'offset_ms': int(s.start * 1000)} for s in snippets]


def embed_batch(texts):
    res = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in res.data]


def filter_speaker_segments(segments, individual):
    name = individual or 'Renan Santos'
    kept = []

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
            raw = res.choices[0].message.content.strip()
        except Exception as e:
            print(f'  bloco {i}–{i + len(block)}: erro na classificação, incluindo tudo. {e}')
            kept.extend(block)
            continue

        try:
            indices = json.loads(raw)
        except json.JSONDecodeError:
            print(f'  bloco {i}–{i + len(block)}: resposta inválida ("{raw}"), incluindo tudo.')
            kept.extend(block)
            continue

        for j in indices:
            if isinstance(j, int) and j < len(block):
                kept.append(block[j])

        print(f'\r  filtrando segmentos {min(i + SPEAKER_BLOCK, len(segments))}/{len(segments)}', end='', flush=True)

    return kept


def index_video(video):
    vid_id     = video['id']
    url        = video['url']
    individual = video.get('individual')
    video_id   = extract_video_id(url)

    if not video_id:
        print(f'[{vid_id}] URL inválida, pulando: {url}')
        return False

    print(f'[{vid_id}] Buscando metadados e transcrição: {url}')
    meta         = fetch_video_metadata(video_id)
    published_at = meta['published_at']
    yt_title     = meta['title']
    channel      = meta['channel']
    title        = yt_title or video.get('title') or ''

    if published_at: print(f'[{vid_id}] Data de publicação: {published_at}')
    if yt_title:     print(f'[{vid_id}] Título do YouTube: {yt_title}')
    if channel:      print(f'[{vid_id}] Canal: {channel}')

    try:
        all_segments = fetch_transcript(video_id)
    except Exception as e:
        print(f'[{vid_id}] Erro ao buscar transcrição: {e}')
        return False

    print(f'[{vid_id}] {len(all_segments)} segmentos — filtrando falas de {individual or "Renan Santos"}...')
    segments = filter_speaker_segments(all_segments, individual)
    print(f'\n[{vid_id}] {len(segments)}/{len(all_segments)} segmentos após filtro de speaker.')

    chunks = chunk_segments(segments)

    if not chunks:
        print(f'[{vid_id}] Nenhum chunk útil gerado.')
        return False

    print(f'[{vid_id}] {len(chunks)} chunks — gerando embeddings...')

    total = 0
    for i in range(0, len(chunks), UPSERT_BATCH):
        batch      = chunks[i:i + UPSERT_BATCH]
        embeddings = embed_batch([c['text'] for c in batch])

        records = []
        for j, (chunk, embedding) in enumerate(zip(batch, embeddings)):
            start_seconds = math.floor(chunk['startOffsetMs'] / 1000)
            records.append({
                'id':     f'yt-{video_id}-c{i + j}',
                'values': embedding,
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
    print(f'[{vid_id}] Upsert de {total} vetores concluído.')
    return {'published_at': published_at, 'title': title, 'channel': channel}


def main():
    conn = psycopg2.connect(DATABASE_URL)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM videos WHERE curated = true AND indexed = false ORDER BY created_at")
        videos = cur.fetchall()

    if not videos:
        print('Nenhum vídeo pendente de indexação.')
        conn.close()
        sys.exit(0)

    print(f'{len(videos)} vídeo(s) para indexar.\n')

    for video in videos:
        try:
            result = index_video(video)
            if result is not False:
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
                        (result['published_at'], result['title'], result['channel'], video['id']),
                    )
                conn.commit()
                print(f"[{video['id']}] Marcado como indexado.\n")
        except Exception as e:
            print(f"[{video['id']}] Erro ao indexar {video['url']}: {e}")

    conn.close()
    print('Concluído.')


if __name__ == '__main__':
    main()
