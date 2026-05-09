#!/usr/bin/env python3
"""Fetch YouTube transcript via yt-dlp and print JSON to stdout.

Output: [{text, offset, duration}] where offset and duration are in milliseconds.
"""
import sys, json, os, tempfile, subprocess, re

def fetch(url):
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    if not m:
        raise ValueError(f'Invalid YouTube URL: {url}')
    vid = m.group(1)

    with tempfile.TemporaryDirectory() as tmpdir:
        tpl = os.path.join(tmpdir, '%(id)s')
        for lang in ('pt', 'en', ''):
            cmd = [
                'yt-dlp', '--skip-download',
                '--write-auto-subs', '--sub-format', 'json3',
                '--output', tpl,
            ]
            if lang:
                cmd += ['--sub-lang', lang]
            cmd.append(url)
            subprocess.run(cmd, capture_output=True)

            for fname in os.listdir(tmpdir):
                if fname.startswith(vid) and fname.endswith('.json3'):
                    with open(os.path.join(tmpdir, fname), encoding='utf-8') as f:
                        data = json.load(f)
                    segs = []
                    for ev in data.get('events', []):
                        if 'segs' not in ev:
                            continue
                        text = ''.join(s.get('utf8', '') for s in ev['segs']).strip()
                        if not text or text == '\n':
                            continue
                        segs.append({
                            'text':     text,
                            'offset':   ev.get('tStartMs', 0),
                            'duration': ev.get('dDurationMs', 0),
                        })
                    print(json.dumps(segs))
                    return

        raise RuntimeError(f'No transcript found for {url}')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: fetch_transcript.py <youtube-url>', file=sys.stderr)
        sys.exit(1)
    fetch(sys.argv[1])
