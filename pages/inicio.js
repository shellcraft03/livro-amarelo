import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTurnstile } from '../hooks/useTurnstile';
import ShareBar from '../components/ShareBar';

const MAX_QUESTION_LENGTH = 1000;

const SUGGESTIONS = [
  'Quais são as propostas para a saúde?',
  'O que o plano diz sobre educação?',
  'Como será tratada a segurança urbana?',
  'Quais as propostas de mobilidade urbana?',
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="6"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/>
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="6" y2="12"/>
      <line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/>
      <line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function QA() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(false);
  const router = useRouter();
  const inputRef = useRef(null);
  const answerRef = useRef(null);

  const { getFreshToken } = useTurnstile('turnstile-container-qa');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) router.replace('/');
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDark(true);
  }, []);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      localStorage.setItem('darkMode', String(next));
      return next;
    });
  }

  function handleReset() {
    setQ('');
    setAnswer(null);
    setAskedQuestion('');
    setLoading(false);
    setCopied(false);
  }

  async function ask(question) {
    const text = (question ?? q).trim().slice(0, MAX_QUESTION_LENGTH);
    if (!text || loading) return;

    setLoading(true);
    setAskedQuestion(text);
    setAnswer(null);

    const freshToken = await getFreshToken();
    if (!freshToken) {
      setLoading(false);
      sessionStorage.removeItem('turnstileToken');
      alert('Verificação expirou. Você será redirecionado.');
      router.replace('/');
      return;
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, turnstileToken: freshToken })
    });

    if (res.status === 403) {
      sessionStorage.removeItem('turnstileToken');
      alert('Verificação falhou ou expirou. Você será redirecionado.');
      router.replace('/');
      return;
    }

    const data = await res.json();
    setAnswer(data);
    setLoading(false);
    setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  }

  function useSuggestion(sug) {
    setQ(sug);
    ask(sug);
  }

  async function copyText() {
    const text = `${askedQuestion}\n\n${answer.text}`;
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
    const aLines = wrapLines(answer.text, FONT_A, CW);

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
    ctx.fillText('O LIVRO AMARELO', PAD, 60);
    ctx.fillStyle = '#888888';
    ctx.font = '400 18px Arial, sans-serif';
    ctx.fillText('O Futuro é Glorioso', PAD, 84);

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
    ctx.fillText('O Livro Amarelo', PAD, H - FOOTER_H + 44);
    ctx.fillStyle = '#666666';
    ctx.font = '400 16px Arial, sans-serif';
    const right = 'Partido Missão · Brasil 2026';
    ctx.fillText(right, W - PAD - ctx.measureText(right).width, H - FOOTER_H + 44);

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'livro-amarelo-resposta.jpg';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.92);
  }

  const sources = (answer?.sources || []).filter(src => src.score > 0.1);
  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>o Livro Amarelo — Q&A</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerInner}>
            <a href="/" style={s.headerLogo}>
              <img src="/cover.png" alt="" style={s.headerThumb} />
              <div>
                <div style={s.headerTitle}>O Livro Amarelo</div>
                <div style={s.headerSub}>O Futuro é Glorioso</div>
              </div>
            </a>
            <nav style={s.nav}>
              <button onClick={toggleDark} style={s.darkToggle} title={dark ? 'Modo claro' : 'Modo escuro'}>
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
              <a
                href="/inicio"
                className="nav-link"
                style={s.navLinkActive}
                onClick={e => { e.preventDefault(); handleReset(); }}
              >
                Início
              </a>
              <a href="/sobre" className="nav-link" style={s.navLink}>
                Sobre
              </a>
            </nav>
          </div>
        </header>

        {/* ── Main ── */}
        <main style={s.main}>

          {/* Input card */}
          <div style={s.inputCard}>
            <label style={s.inputLabel}>Faça uma pergunta sobre os temas tratados no Livro Amarelo</label>
            <div className="input-row" style={s.inputRow}>
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ex: Quais são as propostas para a saúde?"
                maxLength={MAX_QUESTION_LENGTH}
                disabled={loading}
                style={s.input}
              />
              <button
                onClick={() => ask()}
                disabled={loading || !q.trim()}
                style={(loading || !q.trim()) ? s.btnDisabled : s.btnActive}
              >
                {loading ? '…' : 'Perguntar'}
              </button>
            </div>
          </div>

          {/* Suggestions */}
          {!answer && !loading && (
            <div style={s.suggestSection}>
              <p style={s.suggestLabel}>Sugestões</p>
              <div style={s.suggestList}>
                {SUGGESTIONS.map((sug, i) => (
                  <button key={i} onClick={() => useSuggestion(sug)} style={s.suggestBtn}>
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={s.loadingWrap}>
              <div style={s.loadingBar}>
                <span style={{ ...s.loadingDot, animationDelay: '0ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '180ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '360ms' }} />
              </div>
              <p style={s.loadingText}>Buscando no Livro Amarelo…</p>
            </div>
          )}

          {/* Answer */}
          {answer && !loading && (
            <div style={s.answerCard} ref={answerRef}>

              {/* Question recap */}
              <div style={s.qRecap}>
                <span style={s.qRecapLabel}>Pergunta</span>
                <p style={s.qRecapText}>"{askedQuestion}"</p>
              </div>

              <div style={s.answerDivider} />

              {/* Answer */}
              <div style={s.answerHeader}>
                <span style={s.answerTag}>Resposta</span>
              </div>
              <div style={s.answerText}>{answer.text}</div>

              {/* Share actions */}
              <div style={s.shareRow}>
                <button onClick={copyText} style={s.shareBtn}>
                  {copied ? '✓ Copiado!' : 'Copiar texto'}
                </button>
                <button onClick={downloadImage} style={s.shareBtn}>
                  Baixar imagem
                </button>
              </div>

            </div>
          )}

          {/* Welcome */}
          {!answer && !loading && (
            <div style={s.welcome}>
              <p style={s.welcomeText}>
                Explore o Livro Amarelo e suas propostas para o Brasil.
              </p>
            </div>
          )}

          <div style={s.shareWrap}>
            <ShareBar />
          </div>

        </main>

        <div id="turnstile-container-qa" style={{ display: 'none' }} />
      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg    = dark ? '#111111' : '#F2F2F2';
  const headerBg  = dark ? '#1A1A1A' : '#FFFFFF';
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

    nav: {
      display: 'flex',
      gap: '20px',
      alignItems: 'center',
    },
    darkToggle: {
      background: dark ? '#2A2A2A' : '#F0F0F0',
      border: 'none',
      cursor: 'pointer',
      color: dark ? '#FCBF22' : '#888888',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      padding: 0,
      flexShrink: 0,
    },
    navLink: {
      color: textMuted,
      textDecoration: 'none',
      fontSize: '0.9rem',
      fontWeight: 500,
    },
    navLinkActive: {
      color: text1,
      textDecoration: 'underline',
      textDecorationColor: '#FCBF22',
      textDecorationThickness: '2px',
      textUnderlineOffset: '4px',
      fontSize: '0.9rem',
      fontWeight: 700,
    },

    header: {
      background: headerBg,
      borderBottom: '3px solid #FCBF22',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
    headerInner: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      textDecoration: 'none',
    },
    headerThumb: {
      width: '36px',
      height: '36px',
      objectFit: 'cover',
      borderRadius: '4px',
      background: '#FCBF22',
    },
    headerTitle: {
      color: text1,
      fontSize: '1rem',
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },
    headerSub: {
      color: textMuted,
      fontSize: '0.68rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginTop: '1px',
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
    inputRow: {},
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

    suggestSection: {
      marginBottom: '28px',
    },
    suggestLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '10px',
    },
    suggestList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
    },
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

    loadingWrap: {
      background: cardBg,
      borderRadius: '12px',
      padding: '48px 24px',
      border: `2px solid ${cardBdr}`,
      textAlign: 'center',
      animation: 'fadeIn 0.3s ease',
    },
    loadingBar: {
      display: 'flex',
      justifyContent: 'center',
      gap: '8px',
      marginBottom: '16px',
    },
    loadingDot: {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: '#FCBF22',
      border: '2px solid #000000',
      display: 'inline-block',
      animation: 'pulse 1.2s ease-in-out infinite',
    },
    loadingText: {
      color: textMuted,
      fontSize: '0.9rem',
      fontWeight: 500,
    },

    answerCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '28px',
      border: `2px solid ${cardBdr}`,
      animation: 'fadeIn 0.4s ease',
    },
    qRecap: {
      marginBottom: '20px',
    },
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
    qRecapText: {
      color: text2,
      fontSize: '0.95rem',
      fontStyle: 'italic',
      lineHeight: 1.5,
    },
    answerDivider: {
      height: '2px',
      background: '#FCBF22',
      marginBottom: '20px',
    },
    answerHeader: {
      marginBottom: '14px',
    },
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
    answerText: {
      color: text2,
      lineHeight: 1.8,
      whiteSpace: 'pre-wrap',
      fontSize: '0.95rem',
    },
    sourcesWrap: {
      marginTop: '24px',
      paddingTop: '20px',
      borderTop: `2px solid ${divider}`,
    },
    sourcesLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '10px',
    },
    sourcesList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
    },
    sourceBadge: {
      padding: '4px 12px',
      background: '#FCBF22',
      border: '2px solid #000000',
      borderRadius: '20px',
      fontSize: '0.75rem',
      color: '#000000',
      fontWeight: 700,
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
    shareWrap: {
      marginTop: '32px',
      paddingTop: '24px',
      borderTop: `2px solid ${divider}`,
    },
    welcome: {
      textAlign: 'center',
      padding: '48px 24px 0',
    },
    welcomeImg: {
      width: '200px',
      maxWidth: '60%',
      display: 'block',
      margin: '0 auto 20px',
      opacity: 0.6,
    },
    welcomeText: {
      fontSize: '0.95rem',
      color: textMuted,
      lineHeight: 1.6,
    },
  };
}
