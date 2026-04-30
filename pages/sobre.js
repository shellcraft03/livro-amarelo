import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ShareBar from '../components/ShareBar';

export default function Sobre() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) router.replace('/');
  }, [router]);

  return (
    <>
      <Head>
        <title>Sobre — o Livro Amarelo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>

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
              <a href="/inicio" className="nav-link" style={s.navLink}>
                Início
              </a>
              <a href="/sobre" className="nav-link" style={s.navLinkActive}>
                Sobre
              </a>
            </nav>
          </div>
        </header>

        <main style={s.main}>

          <div style={s.card}>
            <p style={s.desc}>
              O <strong>Livro Amarelo</strong> é um projeto de país com horizonte de várias décadas,
              com o objetivo de transformar o Brasil na quinta maior economia do mundo. Um plano
              concreto, baseado em propostas objetivas e estruturadas, para guiar o desenvolvimento
              nacional de forma sustentável e consistente.
            </p>
            <p style={s.desc}>
              Esta aplicação permite explorar o conteúdo do Livro Amarelo por meio de perguntas em
              linguagem natural. O sistema indexa o documento, gera embeddings semânticos e usa um
              modelo de linguagem para responder com base exclusivamente no conteúdo — citando as
              páginas como fonte.
            </p>
          </div>

          <div style={s.linksCard}>
            <h2 style={s.linksTitle}>Links</h2>
            <div style={s.linksList}>
              <a
                href="https://lp.livroamarelo.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={s.linkBtnYellow}
              >
                Adquirir o Livro Amarelo
              </a>
              <a
                href="https://github.com/EliasBarbosa0/livro-amarelo"
                target="_blank"
                rel="noopener noreferrer"
                style={s.linkBtn}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                GitHub
              </a>
              <a
                href="https://x.com/Inevitavel_Bot"
                target="_blank"
                rel="noopener noreferrer"
                style={s.linkBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X (Twitter)
              </a>
            </div>
          </div>

          <div style={s.disclaimer}>
            Este projeto foi desenvolvido por um apoiador independente do Livro Amarelo.
            Não possui qualquer ligação formal com o Movimento Brasil Livre ou com a Missão.
          </div>

          <ShareBar />

        </main>
      </div>
    </>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#F2F2F2',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  header: {
    background: '#000000',
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
    color: '#FCBF22',
    fontSize: '1rem',
    fontWeight: 900,
    letterSpacing: '-0.03em',
  },
  headerSub: {
    color: '#666666',
    fontSize: '0.68rem',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginTop: '1px',
  },

  nav: {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  },
  navLink: {
    color: '#999999',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  navLinkActive: {
    color: '#FCBF22',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: 700,
  },

  main: {
    maxWidth: '800px',
    width: '100%',
    margin: '0 auto',
    padding: '40px 24px 80px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },

  card: {
    background: '#FFFFFF',
    borderRadius: '12px',
    padding: '32px',
    border: '2px solid #000000',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 900,
    color: '#000000',
    letterSpacing: '-0.03em',
  },
  desc: {
    fontSize: '0.95rem',
    color: '#333333',
    lineHeight: 1.8,
  },

  linksCard: {
    background: '#FFFFFF',
    borderRadius: '12px',
    padding: '28px 32px',
    border: '2px solid #000000',
  },
  linksTitle: {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '16px',
  },
  linksList: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  linkBtnYellow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: '#FCBF22',
    color: '#000000',
    border: '2px solid #000000',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 700,
    textDecoration: 'none',
  },
  linkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: '#000000',
    color: '#FCBF22',
    border: '2px solid #000000',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 700,
    textDecoration: 'none',
  },
  disclaimer: {
    fontSize: '0.8rem',
    color: '#999999',
    textAlign: 'center',
    lineHeight: 1.6,
    padding: '0 8px',
  },
};
