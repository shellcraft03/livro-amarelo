import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), 'tmp', 'transcripts');

export async function loadCached(videoId) {
  try {
    const data = await readFile(join(CACHE_DIR, `${videoId}.json`), 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveCache(videoId, segments) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${videoId}.json`), JSON.stringify(segments));
}
