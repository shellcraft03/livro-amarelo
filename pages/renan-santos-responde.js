import { useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useDarkMode } from '../hooks/useDarkMode';
import { useSessionGate } from '../hooks/useSessionGate';
import Header from '../components/Header';

const MAX_QUESTION_LENGTH = 1000;

const SUGGESTIONS = [
  'O que Renan Santos pensa sobre educação?',
  'Qual a posição dele sobre segurança pública?',
  'O que ele disse sobre economia?',
  'Como pretende lidar com a saúde no Brasil?',
];

function YouTubeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}


function parseAnswerSegments(text, sources) {
  const citationList = [];
  const citationIndex = {};
  const parts = [];
  const TIME  = '[\\d:]+(?:-[\\d:]+)?';
  const ENTRY = `\\d+,\\s*${TIME}`;
  const regex = new RegExp(`\\[(${ENTRY}(?:;\\s*${ENTRY})*)\\]`, 'g');
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    for (const entry of match[1].split(';').map(e => e.trim())) {
      const m = entry.match(/^(\d+),\s*([\d:]+)/);
      if (!m) continue;
      const src    = sources.find(s => s.id === Number(m[1]));
      const key    = src?.channel || src?.title || String(Number(m[1]));
      const citKey = `${key}:${m[2]}`;
      if (!citationIndex[citKey]) {
        citationList.push({ src, timestamp: m[2], href: src?.source_url || null });
        citationIndex[citKey] = citationList.length;
      }
      parts.push({ type: 'badge', n: citationIndex[citKey] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) });
  return { parts, citations: citationList };
}

function stripAnswerReferences(text) {
  const TIME  = '[\\d:]+(?:-[\\d:]+)?';
  const ENTRY = `\\d+,\\s*${TIME}`;
  const regex = new RegExp(`\\s*\\[${ENTRY}(?:;\\s*${ENTRY})*\\]`, 'g');
  return String(text || '')
    .replace(regex, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function RenanSantosResponde() {
  const [dark, toggleDark] = useDarkMode();
  const [q, setQ]               = useState('');
  const [answer, setAnswer]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(null);
  const router   = useRouter();
  useSessionGate();
  const inputRef = useRef(null);
  const answerRef = useRef(null);

  function handleReset() {
    setQ('');
    setAnswer(null);
    setAskedQuestion('');
    setLoading(false);
    setStreaming(false);
    setCopied(false);
    setRateLimitError(null);
  }

  async function ask(question) {
    const text = (question ?? q).trim().slice(0, MAX_QUESTION_LENGTH);
    if (!text || loading || streaming) return;

    setLoading(true);
    setAskedQuestion(text);
    setAnswer(null);
    setStreaming(false);
    setRateLimitError(null);
    setCopied(false);

    const res = await fetch('/api/chat-entrevistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text }),
    });

    if (res.status === 403) {
      setLoading(false);
      sessionStorage.removeItem('turnstileToken');
      alert('Verificação falhou. Você será redirecionado.');
      router.replace('/');
      return;
    }

    if (res.status === 429) {
      const data = await res.json();
      if (data.error === 'Daily limit reached') {
        setRateLimitError('Limite diário de perguntas atingido. Volte amanhã.');
      } else {
        const secs = parseInt(res.headers.get('X-RateLimit-Reset') || '0', 10);
        const time = secs < 60 ? `${secs} segundos` : `${Math.ceil(secs / 60)} minutos`;
        setRateLimitError(`Muitas perguntas em pouco tempo. Tente novamente em ${time}.`);
      }
      setLoading(false);
      return;
    }

    if (!res.ok) {
      setLoading(false);
      setAnswer({ text: 'Erro ao processar a pergunta. Tente novamente.', sources: [] });
      return;
    }

    setLoading(false);
    setStreaming(true);
    setAnswer({ text: '', sources: null });
    setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop();
        for (const msg of messages) {
          if (!msg.startsWith('data: ')) continue;
          let parsed;
          try { parsed = JSON.parse(msg.slice(6).trim()); } catch { continue; }
          if (parsed.token) setAnswer(prev => ({ ...prev, text: prev.text + parsed.token }));
          if (parsed.done)  { setAnswer(prev => ({ ...prev, sources: parsed.sources || [] })); setStreaming(false); }
          if (parsed.error) { setAnswer(prev => ({ ...prev, text: prev.text || 'Erro ao gerar resposta.' })); setStreaming(false); }
        }
      }
    } catch (e) {
      console.error('stream error:', e);
    } finally {
      setStreaming(false);
    }
  }

  const isProcessing = loading || streaming;

  async function copyText() {
    const text = `${askedQuestion}\n\n${stripAnswerReferences(answer?.text)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadImage() {
    const W = 1080;
    const PAD = 72;
    const CW = W - PAD * 2;
    const HEADER_H = 100;
    const FOOTER_H = 72;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = 4000;
    const ctx = canvas.getContext('2d');

    function wrapLines(text, font, maxW) {
      ctx.font = font;
      const lines = [];
      for (const para of text.split('\n')) {
        if (!para.trim()) { lines.push(null); continue; }
        const words = para.split(' ');
        let cur = '';
        for (const word of words) {
          const test = cur ? cur + ' ' + word : word;
          if (ctx.measureText(test).width > maxW && cur) {
            lines.push(cur);
            cur = word;
          } else {
            cur = test;
          }
        }
        if (cur) lines.push(cur);
      }
      return lines;
    }

    const FONT_Q = 'italic 500 30px Arial, sans-serif';
    const FONT_A = '400 28px Arial, sans-serif';
    const LH_Q = 44, LH_A = 42, LH_BLANK = 18;

    const qLines = wrapLines(`"${askedQuestion}"`, FONT_Q, CW);
    const aLines = wrapLines(stripAnswerReferences(answer?.text), FONT_A, CW);

    const qH = qLines.reduce((sum, l) => sum + (l === null ? LH_BLANK : LH_Q), 0);
    const aH = aLines.reduce((sum, l) => sum + (l === null ? LH_BLANK : LH_A), 0);

    const H = HEADER_H + 56 + 30 + 14 + qH + 44 + 4 + 44 + 30 + 14 + aH + 56 + FOOTER_H;
    canvas.height = H;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.fillStyle = '#FCBF22';
    ctx.font = '900 36px Arial, sans-serif';
    ctx.fillText('RENAN RESPONDE', PAD, 60);
    ctx.fillStyle = '#888888';
    ctx.font = '400 18px Arial, sans-serif';
    ctx.fillText('Entrevistas indexadas', PAD, 84);

    let y = HEADER_H + 56;

    ctx.font = '700 15px Arial, sans-serif';
    const plW = ctx.measureText('PERGUNTA').width + 20;
    ctx.fillStyle = '#000000';
    ctx.fillRect(PAD, y, plW, 28);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('PERGUNTA', PAD + 10, y + 19);
    y += 28 + 14;

    ctx.font = FONT_Q;
    ctx.fillStyle = '#333333';
    for (const line of qLines) {
      if (line === null) { y += LH_BLANK; continue; }
      ctx.fillText(line, PAD, y + LH_Q - 10);
      y += LH_Q;
    }
    y += 28;

    ctx.fillStyle = '#FCBF22';
    ctx.fillRect(PAD, y, CW, 4);
    y += 4 + 36;

    ctx.font = '700 15px Arial, sans-serif';
    const rlW = ctx.measureText('RESPOSTA').width + 20;
    ctx.fillStyle = '#FCBF22';
    ctx.fillRect(PAD, y, rlW, 28);
    ctx.fillStyle = '#000000';
    ctx.fillText('RESPOSTA', PAD + 10, y + 19);
    y += 28 + 14;

    ctx.font = FONT_A;
    ctx.fillStyle = '#111111';
    for (const line of aLines) {
      if (line === null) { y += LH_BLANK; continue; }
      ctx.fillText(line, PAD, y + LH_A - 8);
      y += LH_A;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
    ctx.fillStyle = '#FCBF22';
    ctx.font = '700 18px Arial, sans-serif';
    ctx.fillText('Inevitável GPT', PAD, H - FOOTER_H + 44);
    ctx.fillStyle = '#666666';
    ctx.font = '400 16px Arial, sans-serif';
    const right = 'Renan Responde';
    ctx.fillText(right, W - PAD - ctx.measureText(right).width, H - FOOTER_H + 44);

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'renan-responde-resposta.jpg';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.92);
  }

  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Renan Responde — InevitávelGPT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="renan-santos-responde" dark={dark} toggleDark={toggleDark} onCurrentPageClick={handleReset} />

        <main style={s.main}>

          <div style={s.inputCard}>
            <label style={s.inputLabel}>O que Renan Santos respondeu sobre…</label>
            <div className="input-row">
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder="Ex: O que ele disse sobre educação?"
                maxLength={MAX_QUESTION_LENGTH}
                disabled={isProcessing}
                style={s.input}
              />
              <button onClick={() => ask()} disabled={isProcessing || !q.trim()} style={(isProcessing || !q.trim()) ? s.btnDisabled : s.btnActive}>
                {loading ? '…' : 'Perguntar'}
              </button>
            </div>
          </div>

          <div style={s.disclaimer}>
            <span style={s.disclaimerAlert}>Atenção</span> Respostas geradas por IA com base nas entrevistas indexadas — podem conter imprecisões. Consulte sempre as fontes citadas.
          </div>

          {!answer && !isProcessing && (
            <div style={s.suggestSection}>
              <p style={s.suggestLabel}>Sugestões</p>
              <div style={s.suggestList}>
                {SUGGESTIONS.map((sug, i) => (
                  <button key={i} onClick={() => { setQ(sug); ask(sug); }} style={s.suggestBtn}>{sug}</button>
                ))}
              </div>
            </div>
          )}

          {rateLimitError && (
            <div style={s.rateLimitBanner}>
              <span style={s.rateLimitLabel}>Limite atingido</span>
              <p style={s.rateLimitText}>{rateLimitError}</p>
            </div>
          )}

          {loading && (
            <div style={s.loadingWrap}>
              <div style={s.loadingBar}>
                <span style={{ ...s.loadingDot, animationDelay: '0ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '180ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '360ms' }} />
              </div>
              <p style={s.loadingText}>Buscando nas entrevistas…</p>
            </div>
          )}

          {answer && (
            <div style={s.answerCard} ref={answerRef}>
              <div style={s.qRecap}>
                <span style={s.qRecapLabel}>Pergunta</span>
                <p style={s.qRecapText}>"{askedQuestion}"</p>
              </div>
              <div style={s.answerDivider} />
              <div style={s.answerHeader}>
                <span style={s.answerTag}>Resposta</span>
              </div>
              <div style={s.answerText}>
                {streaming || !answer.sources
                  ? <>{answer.text}{streaming && <span className="cursor-blink">▌</span>}</>
                  : (() => {
                      const { parts, citations } = parseAnswerSegments(answer.text, answer.sources);
                      return (
                        <>
                          <div>
                            {parts.map((part, i) =>
                              part.type === 'badge'
                                ? <span key={i} style={s.citeBadge}>[{part.n}]</span>
                                : <span key={i}>{part.content}</span>
                            )}
                          </div>
                          {citations.length > 0 && (
                            <div style={s.citationList}>
                              {citations.map((c, i) => (
                                <a key={i} href={c.href || undefined} target="_blank" rel="noopener noreferrer"
                                   style={c.href ? s.citationItem : s.citationItemNoLink}>
                                  <span style={s.citationNum}>[{i + 1}]</span>
                                  <span style={s.citationLabel}>
                                    {[c.src?.channel || c.src?.title || 'Entrevista',
                                      c.src?.published_at ? formatDate(c.src.published_at) : null
                                    ].filter(Boolean).join(' · ')}
                                  </span>
                                  <span style={s.citationTime}>{c.timestamp}</span>
                                  {c.href && <span style={{ color: '#FF0000', display: 'flex' }}><YouTubeIcon /></span>}
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()
                }
              </div>
              <div style={s.shareRow}>
                <button onClick={copyText} disabled={streaming} style={streaming ? s.shareBtnDisabled : s.shareBtn}>
                  {copied ? '✓ Copiado!' : 'Copiar texto'}
                </button>
                <button onClick={downloadImage} disabled={streaming} style={streaming ? s.shareBtnDisabled : s.shareBtn}>
                  Baixar imagem
                </button>
              </div>
            </div>
          )}

          <div style={s.entrevistasLink}>
            <a href="/entrevistas" style={s.entrevistasBtn}>
              Ver entrevistas indexadas
            </a>
          </div>

        </main>

      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg    = dark ? '#111111' : '#F2F2F2';
  const cardBg    = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr   = dark ? '#333333' : '#000000';
  const text1     = dark ? '#EEEEEE' : '#000000';
  const text2     = dark ? '#CCCCCC' : '#333333';
  const textMuted = dark ? '#888888' : '#666666';
  const textDim   = dark ? '#555555' : '#999999';
  const inputBg   = dark ? '#0D0D0D' : '#FFFFFF';
  const inputBdr  = dark ? '#444444' : '#000000';
  const divider   = dark ? '#2A2A2A' : '#EEEEEE';

  return {
    page: {
      minHeight: '100vh',
      background: pageBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    main: {
      maxWidth: '800px',
      width: '100%',
      margin: '0 auto',
      padding: '32px 24px 80px',
      flex: 1,
    },
    inputCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '20px',
      border: `2px solid ${cardBdr}`,
    },
    inputLabel: {
      display: 'block',
      fontSize: '0.8rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: '12px',
    },
    input: {
      flex: 1,
      padding: '12px 16px',
      border: `2px solid ${inputBdr}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      outline: 'none',
      color: text1,
      background: inputBg,
    },
    btnActive: {
      padding: '12px 22px',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      fontSize: '0.95rem',
      fontWeight: 800,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    btnDisabled: {
      padding: '12px 22px',
      background: dark ? '#2A2A2A' : '#F2F2F2',
      color: textDim,
      border: `2px solid ${dark ? '#2A2A2A' : '#F2F2F2'}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      fontWeight: 800,
      cursor: 'not-allowed',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    disclaimer: {
      fontSize: '0.78rem',
      color: textMuted,
      textAlign: 'center',
      padding: '10px 16px',
      marginBottom: '20px',
      borderRadius: '8px',
      background: dark ? '#161616' : '#F8F8F8',
      border: `1px solid ${dark ? '#2A2A2A' : '#E8E8E8'}`,
      lineHeight: 1.5,
    },
    disclaimerAlert: {
      color: '#CC0000',
      fontWeight: 700,
      marginRight: '4px',
    },
    suggestSection: { marginBottom: '28px' },
    suggestLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '10px',
    },
    suggestList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    suggestBtn: {
      padding: '8px 14px',
      background: cardBg,
      border: `2px solid ${dark ? '#444444' : '#000000'}`,
      borderRadius: '20px',
      fontSize: '0.85rem',
      color: text1,
      cursor: 'pointer',
      fontWeight: 600,
    },
    rateLimitBanner: {
      background: cardBg,
      border: `2px solid ${cardBdr}`,
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '20px',
    },
    rateLimitLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: '#000000',
      background: '#FCBF22',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '4px',
      marginBottom: '8px',
    },
    rateLimitText: { color: text2, fontSize: '0.9rem', fontWeight: 600, margin: 0 },
    loadingWrap: {
      background: cardBg,
      borderRadius: '12px',
      padding: '48px 24px',
      border: `2px solid ${cardBdr}`,
      textAlign: 'center',
      marginBottom: '20px',
    },
    loadingBar: { display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' },
    loadingDot: {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: '#FCBF22',
      border: '2px solid #000000',
      display: 'inline-block',
      animation: 'pulse 1.2s ease-in-out infinite',
    },
    loadingText: { color: textMuted, fontSize: '0.9rem', fontWeight: 500, margin: 0 },
    answerCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '28px',
      border: `2px solid ${cardBdr}`,
      marginBottom: '20px',
      animation: 'fadeIn 0.4s ease',
    },
    qRecap: { marginBottom: '20px' },
    qRecapLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: '#FFFFFF',
      background: '#000000',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '4px',
      marginBottom: '8px',
    },
    qRecapText: { color: text2, fontSize: '0.95rem', fontStyle: 'italic', lineHeight: 1.5 },
    answerDivider: { height: '2px', background: '#FCBF22', marginBottom: '20px' },
    answerHeader: { marginBottom: '14px' },
    answerTag: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: '#000000',
      background: '#FCBF22',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '4px',
    },
    answerText: { color: text2, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontSize: '0.95rem' },
    citeBadge: {
      display: 'inline-block',
      fontSize: '0.72rem',
      fontWeight: 700,
      color: '#FCBF22',
      verticalAlign: 'super',
      lineHeight: 1,
      margin: '0 1px',
      cursor: 'default',
    },
    citationList: {
      marginTop: '20px',
      paddingTop: '16px',
      borderTop: `1px solid ${divider}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    citationItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      textDecoration: 'none',
      padding: '8px 12px',
      borderRadius: '8px',
      background: dark ? '#222222' : '#F8F8F8',
      border: `1px solid ${dark ? '#333333' : '#EEEEEE'}`,
    },
    citationItemNoLink: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '8px',
      background: dark ? '#222222' : '#F8F8F8',
      border: `1px solid ${dark ? '#333333' : '#EEEEEE'}`,
    },
    citationNum: {
      fontSize: '0.75rem',
      fontWeight: 800,
      color: '#FCBF22',
      flexShrink: 0,
    },
    citationLabel: {
      fontSize: '0.82rem',
      fontWeight: 600,
      color: text1,
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    citationTime: {
      fontSize: '0.78rem',
      fontWeight: 600,
      color: '#FF0000',
      flexShrink: 0,
    },
    shareRow: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: '20px',
      paddingTop: '16px',
      borderTop: `2px solid ${divider}`,
    },
    shareBtn: {
      padding: '8px 16px',
      background: '#FCBF22',
      border: '2px solid #000000',
      borderRadius: '8px',
      color: '#000000',
      fontSize: '0.85rem',
      cursor: 'pointer',
      fontWeight: 700,
    },
    shareBtnDisabled: {
      padding: '8px 16px',
      background: dark ? '#2A2A2A' : '#F2F2F2',
      border: `2px solid ${dark ? '#2A2A2A' : '#F2F2F2'}`,
      borderRadius: '8px',
      color: textDim,
      fontSize: '0.85rem',
      cursor: 'not-allowed',
      fontWeight: 700,
    },
    entrevistasLink: {
      marginTop: '32px',
      textAlign: 'center',
    },
    entrevistasBtn: {
      display: 'inline-block',
      padding: '10px 20px',
      border: `2px solid ${dark ? '#444444' : '#000000'}`,
      borderRadius: '20px',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: textMuted,
      textDecoration: 'none',
      background: 'none',
    },
  };
}
