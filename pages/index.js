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
        <title>o Livro Amarelo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={s.page}>

        {/* Left panel — brand identity */}
        <div style={s.left}>
          <div style={s.leftInner}>
            <div style={s.brandText}>
              <span style={s.brandSmall}>o</span>
              <span style={s.brandBig}>Livro</span>
              <span style={s.brandBig}>Amarelo</span>
            </div>

            {/* Cover illustration */}
            <div style={s.illustrationWrap}>
              <img
                src="/cover.png"
                alt="Ilustração o Livro Amarelo"
                style={s.illustration}
              />
            </div>

            <p style={s.leftFooter}>
              Livro Amarelo · Partido Missão<br />
              Brasil · 2026
            </p>
          </div>
        </div>

        {/* Right panel — verification */}
        <div style={s.right}>
          <div style={s.card}>
            <div style={s.cardEyebrow}>Acesso ao sistema</div>
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
    minHeight: '100vh',
    display: 'flex',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  /* ── Left yellow panel ── */
  left: {
    flex: '1 1 55%',
    background: '#FCBF22',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
    minHeight: '100vh',
  },
  leftInner: {
    maxWidth: '480px',
    width: '100%',
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 0.9,
    marginBottom: '32px',
  },
  brandSmall: {
    fontSize: 'clamp(1.25rem, 3vw, 2rem)',
    fontWeight: 900,
    color: '#000000',
    letterSpacing: '-0.02em',
  },
  brandBig: {
    fontSize: 'clamp(3rem, 8vw, 6rem)',
    fontWeight: 900,
    color: '#000000',
    letterSpacing: '-0.04em',
    textTransform: 'uppercase',
  },
  illustrationWrap: {
    width: '100%',
    marginBottom: '40px',
  },
  illustration: {
    width: '100%',
    maxWidth: '460px',
    display: 'block',
    mixBlendMode: 'multiply',
  },
  leftFooter: {
    fontSize: '0.8rem',
    color: '#000000',
    opacity: 0.55,
    lineHeight: 1.6,
    fontWeight: 500,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
  },

  /* ── Right white panel ── */
  right: {
    flex: '1 1 45%',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
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
