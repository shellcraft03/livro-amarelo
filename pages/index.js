import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTurnstile } from '../hooks/useTurnstile';
import { useDarkMode } from '../hooks/useDarkMode';
import ShareBar from '../components/ShareBar';

const FASICULOS = [
  '/fasciculo1.png',
  '/fasciculo2.png',
  '/fasciculo3.png',
  '/fasciculo4.png',
  '/fasciculo5.png',
  '/fasciculo6.png',
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"    x2="12"    y2="6"/>
      <line x1="12" y1="18"   x2="12"    y2="22"/>
      <line x1="4.22" y1="4.22"  x2="7.05"  y2="7.05"/>
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
      <line x1="2"  y1="12"   x2="6"     y2="12"/>
      <line x1="18" y1="12"   x2="22"    y2="12"/>
      <line x1="4.22" y1="19.78" x2="7.05"  y2="16.95"/>
      <line x1="16.95" y1="7.05"  x2="19.78" y2="4.22"/>
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

export default function Entry() {
  const router = useRouter();
  const [pendingToken, setPendingToken] = useState(null);
  const [dark, toggleDark] = useDarkMode();
  const [fasiculo, setFasiculo] = useState(null);

  useEffect(() => {
    setFasiculo(FASICULOS[Math.floor(Math.random() * FASICULOS.length)]);
  }, []);

  useTurnstile('turnstile-container', {
    onToken: (token) => {
      setPendingToken(token);
    }
  });

  function execute() {
    if (!pendingToken) return;
    sessionStorage.setItem('turnstileToken', pendingToken);
    router.push('/inicio');
  }

  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>o Livro Amarelo — O Futuro é Glorioso</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo. Faça perguntas em linguagem natural e receba respostas baseadas no documento." />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:url" content="https://www.inevitavelgpt.com" />
        <meta property="og:title" content="o Livro Amarelo — O Futuro é Glorioso" />
        <meta property="og:description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo." />
        <meta property="og:image" content="https://www.inevitavelgpt.com/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="o Livro Amarelo — O Futuro é Glorioso" />
        <meta name="twitter:description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo." />
        <meta name="twitter:image" content="https://www.inevitavelgpt.com/og.png" />
      </Head>

      <div className="split-page" style={s.page}>

        <div className="split-left" style={s.left}>
          {fasiculo && <img src={fasiculo} alt="o Livro Amarelo" style={s.illustration} />}
        </div>

        <div className="split-right" style={s.right}>

          <button onClick={toggleDark} style={s.darkToggle} title={dark ? 'Modo claro' : 'Modo escuro'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Verificação<br />necessária</h2>
            <p style={s.cardDesc}>
              Confirme que você é humano para explorar as propostas do Livro Amarelo.
            </p>

            <div style={s.divider} />

            <div id="turnstile-container" style={s.turnstileWrap} />

            <button
              onClick={execute}
              disabled={!pendingToken}
              style={pendingToken ? s.btnActive : s.btnDisabled}
            >
              {pendingToken ? 'Entrar →' : 'Resolva o CAPTCHA acima'}
            </button>

            <p style={s.cardNote}>
              Apenas dados básicos e anônimos são coletados para manter a segurança e o funcionamento do site.{' '}
              <a href="/privacidade" style={s.cardNoteLink}>Política de privacidade</a>
            </p>

            <div style={s.shareDivider} />
            <ShareBar />
          </div>
        </div>

      </div>
    </>
  );
}

function getStyles(dark) {
  const rightBg   = dark ? '#111111' : '#FFFFFF';
  const text1     = dark ? '#EEEEEE' : '#000000';
  const textMuted = dark ? '#AAAAAA' : '#666666';
  const textDim   = dark ? '#555555' : '#999999';
  const divClr    = dark ? '#2A2A2A' : '#F2F2F2';

  return {
    page: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    left: {
      background: '#EFD501',
      padding: 0,
      overflow: 'hidden',
    },
    illustration: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    right: {
      background: rightBg,
      position: 'relative',
    },
    darkToggle: {
      position: 'absolute',
      top: '20px',
      right: '20px',
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
    },
    card: {
      width: '100%',
      maxWidth: '380px',
    },
    cardTitle: {
      fontSize: 'clamp(2rem, 4vw, 3rem)',
      fontWeight: 900,
      color: text1,
      letterSpacing: '-0.03em',
      lineHeight: 1.05,
      marginBottom: '16px',
    },
    cardDesc: {
      color: textMuted,
      fontSize: '0.95rem',
      lineHeight: 1.6,
      marginBottom: '28px',
    },
    divider: {
      height: '2px',
      background: divClr,
      marginBottom: '28px',
    },
    turnstileWrap: {
      display: 'flex',
      justifyContent: 'flex-start',
      marginBottom: '20px',
      minHeight: '65px',
    },
    btnActive: {
      width: '100%',
      padding: '16px 24px',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      fontSize: '1rem',
      fontWeight: 800,
      cursor: 'pointer',
      letterSpacing: '-0.01em',
      transition: 'transform 0.1s',
    },
    btnDisabled: {
      width: '100%',
      padding: '16px 24px',
      background: dark ? '#2A2A2A' : '#F2F2F2',
      color: textDim,
      border: `2px solid ${dark ? '#2A2A2A' : '#F2F2F2'}`,
      borderRadius: '8px',
      fontSize: '1rem',
      fontWeight: 800,
      cursor: 'not-allowed',
      letterSpacing: '-0.01em',
    },
    cardNote: {
      color: textDim,
      fontSize: '0.75rem',
      textAlign: 'center',
      marginTop: '14px',
    },
    cardNoteLink: {
      color: dark ? '#FCBF22' : '#000000',
      fontWeight: 600,
      textDecoration: 'underline',
    },
    shareDivider: {
      height: '1px',
      background: divClr,
      margin: '20px 0 4px',
    },
  };
}
