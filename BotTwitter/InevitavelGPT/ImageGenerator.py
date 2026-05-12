import io
import os
import re
from PIL import Image, ImageDraw, ImageFont

YELLOW   = (252, 191, 34)
BLACK    = (0, 0, 0)
WHITE    = (255, 255, 255)

# Canvas constants (exact values from inicio.js)
W        = 1080
PAD      = 72
CW       = W - PAD * 2
HEADER_H = 100
FOOTER_H = 72
LH_Q     = 44
LH_A     = 42
LH_BLANK = 18

_FONT_CACHE = {}


def _load_font(size, bold=False, italic=False):
    key = (size, bold, italic)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]

    if bold and italic:
        paths = ['C:/Windows/Fonts/arialbi.ttf']
    elif bold:
        paths = ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/calibrib.ttf']
    elif italic:
        paths = ['C:/Windows/Fonts/ariali.ttf',  'C:/Windows/Fonts/calibrii.ttf']
    else:
        paths = ['C:/Windows/Fonts/arial.ttf',   'C:/Windows/Fonts/calibri.ttf']

    if bold:
        paths += [
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ]
    else:
        paths += [
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ]

    font = None
    for p in paths:
        if os.path.exists(p):
            try:
                font = ImageFont.truetype(p, size)
                break
            except Exception:
                continue

    _FONT_CACHE[key] = font or ImageFont.load_default()
    return _FONT_CACHE[key]


def _wrap_lines(draw, text, font, max_width):
    """Exact port of wrapLines() from inicio.js."""
    result = []
    for para in text.split('\n'):
        if not para.strip():
            result.append(None)
            continue
        words = para.split()
        cur = ''
        for word in words:
            test = (cur + ' ' + word).strip()
            if draw.textlength(test, font=font) > max_width and cur:
                result.append(cur)
                cur = word
            else:
                cur = test
        if cur:
            result.append(cur)
        result.append(None)
    while result and result[-1] is None:
        result.pop()
    return result or ['']


def _strip_citations(text):
    return re.sub(r'\[\d+(?:[,\s]+\d+:\d+(?::\d+)?)?\]', '', text).strip()


def generate_answer_image(question, answer, qtype):
    title    = 'O LIVRO AMARELO' if qtype == 'livro' else 'RENAN RESPONDE'
    subtitle = 'O Futuro é Glorioso' if qtype == 'livro' else 'Com Renan Santos'

    if qtype == 'entrevistas':
        answer = _strip_citations(answer)

    # Fonts — matching canvas declarations exactly
    font_title    = _load_font(36, bold=True)            # '900 36px Arial'
    font_subtitle = _load_font(18)                       # '400 18px Arial'
    font_label    = _load_font(15, bold=True)            # '700 15px Arial'
    font_q        = _load_font(30, italic=True)          # 'italic 500 30px Arial'
    font_a        = _load_font(28)                       # '400 28px Arial'
    font_footer_l = _load_font(18, bold=True)            # '700 18px Arial'
    font_footer_r = _load_font(16)                       # '400 16px Arial'

    tmp_draw = ImageDraw.Draw(Image.new('RGB', (W, 100)))
    q_lines = _wrap_lines(tmp_draw, f'"{question}"', font_q, CW)
    a_lines = _wrap_lines(tmp_draw, answer, font_a, CW)

    q_h = sum(LH_BLANK if l is None else LH_Q for l in q_lines)
    a_h = sum(LH_BLANK if l is None else LH_A for l in a_lines)

    # Exact height formula from inicio.js
    H = HEADER_H + 56 + 30 + 14 + q_h + 44 + 4 + 44 + 30 + 14 + a_h + 56 + FOOTER_H

    img  = Image.new('RGB', (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # ── Header ──────────────────────────────────────────────────────────────
    draw.rectangle([(0, 0), (W, HEADER_H)], fill=BLACK)
    draw.text((PAD, 60), title,    fill=YELLOW,          font=font_title,    anchor='ls')
    draw.text((PAD, 84), subtitle, fill=(136, 136, 136), font=font_subtitle, anchor='ls')

    # ── Content ──────────────────────────────────────────────────────────────
    y = HEADER_H + 56   # 156 — mirrors: let y = HEADER_H + 56

    # PERGUNTA label
    p_w = int(draw.textlength('PERGUNTA', font=font_label)) + 20
    draw.rectangle([(PAD, y), (PAD + p_w, y + 28)], fill=BLACK)
    draw.text((PAD + 10, y + 19), 'PERGUNTA', fill=WHITE, font=font_label, anchor='ls')
    y += 28 + 14

    # Question lines — canvas: fillText(line, PAD, y + LH_Q - 10)
    for line in q_lines:
        if line is None:
            y += LH_BLANK
            continue
        draw.text((PAD, y + LH_Q - 10), line, fill=(51, 51, 51), font=font_q, anchor='ls')
        y += LH_Q
    y += 28

    # Yellow divider — canvas: fillRect(PAD, y, CW, 4)
    draw.rectangle([(PAD, y), (PAD + CW, y + 4)], fill=YELLOW)
    y += 4 + 36

    # RESPOSTA label
    r_w = int(draw.textlength('RESPOSTA', font=font_label)) + 20
    draw.rectangle([(PAD, y), (PAD + r_w, y + 28)], fill=YELLOW)
    draw.text((PAD + 10, y + 19), 'RESPOSTA', fill=BLACK, font=font_label, anchor='ls')
    y += 28 + 14

    # Answer lines — canvas: fillText(line, PAD, y + LH_A - 8)
    for line in a_lines:
        if line is None:
            y += LH_BLANK
            continue
        draw.text((PAD, y + LH_A - 8), line, fill=(17, 17, 17), font=font_a, anchor='ls')
        y += LH_A

    # ── Footer ───────────────────────────────────────────────────────────────
    draw.rectangle([(0, H - FOOTER_H), (W, H)], fill=BLACK)
    draw.text((PAD, H - FOOTER_H + 44), 'Inevitável GPT', fill=YELLOW, font=font_footer_l, anchor='ls')
    right = 'Partido Missão · Brasil 2026'
    draw.text((W - PAD - draw.textlength(right, font=font_footer_r), H - FOOTER_H + 44),
              right, fill=(102, 102, 102), font=font_footer_r, anchor='ls')

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=92)
    buf.seek(0)
    return buf.read()
