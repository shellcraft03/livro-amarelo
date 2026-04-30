import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTurnstile } from '../hooks/useTurnstile';

export default function Entry() {
  const router = useRouter();
  const [pendingToken, setPendingToken] = useState(null);

  useTurnstile('turnstile-container', {
    onToken: (token) => {
      setPendingToken(token);
    }
  });

  function execute() {
    if (!pendingToken) return;
    sessionStorage.setItem('turnstileToken', pendingToken);
    router.push('/qa');
  }

  return (
    <>
      <Head>
        <title>o Livro Amarelo — O Futuro é Glorioso</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo. Faça perguntas em linguagem natural e receba respostas baseadas no documento." />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:url" content="https://livroamarelo.com" />
        <meta property="og:title" content="o Livro Amarelo — O Futuro é Glorioso" />
        <meta property="og:description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo." />
        <meta property="og:image" content="https://livroamarelo.com/cover.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="o Livro Amarelo — O Futuro é Glorioso" />
        <meta name="twitter:description" content="Explore as propostas do Livro Amarelo — um projeto de país para transformar o Brasil na quinta maior economia do mundo." />
        <meta name="twitter:image" content="https://livroamarelo.com/cover.png" />
      </Head>

      <div className="split-page" style={s.page}>

        {/* Left panel — cover image */}
        <div className="split-left" style={s.left}>
          <img
            src="/cover.png"
            alt="o Livro Amarelo"
            style={s.illustration}
          />
        </div>

        {/* Right panel — verification */}
        <div className="split-right" style={s.right}>
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
              Seus dados não são armazenados.
            </p>
          </div>
        </div>

      </div>
    </>
  );
}

const s = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  /* ── Left yellow panel ── */
  left: {
    background: '#ECCB00',
  },
  illustration: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  /* ── Right white panel ── */
  right: {
    background: '#FFFFFF',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
  },
  cardEyebrow: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#FCBF22',
    background: '#000000',
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: 'clamp(2rem, 4vw, 3rem)',
    fontWeight: 900,
    color: '#000000',
    letterSpacing: '-0.03em',
    lineHeight: 1.05,
    marginBottom: '16px',
  },
  cardDesc: {
    color: '#666666',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    marginBottom: '28px',
  },
  divider: {
    height: '2px',
    background: '#F2F2F2',
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
    background: '#F2F2F2',
    color: '#999999',
    border: '2px solid #F2F2F2',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 800,
    cursor: 'not-allowed',
    letterSpacing: '-0.01em',
  },
  cardNote: {
    color: '#999999',
    fontSize: '0.75rem',
    textAlign: 'center',
    marginTop: '14px',
  },
};
