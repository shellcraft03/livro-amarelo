import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTurnstile } from '../hooks/useTurnstile';
import Header from '../components/Header';

function YouTubeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const YT_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export default function Entrevistas() {
  const [dark, toggleDark] = useDarkMode();
  const [videos, setVideos]               = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [search, setSearch]               = useState('');
  const [submitUrl, setSubmitUrl]         = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [submitStatus, setSubmitStatus]   = useState(null); // { ok: bool, msg: string }
  const router = useRouter();
  const { getFreshToken } = useTurnstile('turnstile-videos', { action: 'chat' });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) { router.replace('/'); return; }
    fetch('/api/videos')
      .then(r => r.json())
      .then(data => setVideos(data.videos || []))
      .catch(() => {})
      .finally(() => setVideosLoading(false));
  }, [router]);

  const filtered = videos.filter(v => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (v.title || '').toLowerCase().includes(q) || (v.channel || '').toLowerCase().includes(q);
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const url = submitUrl.trim();
    if (!url || submitting) return;
    if (!YT_REGEX.test(url)) {
      setSubmitStatus({ ok: false, msg: 'URL inválida. Envie um link do YouTube.' });
      return;
    }
    setSubmitting(true);
    setSubmitStatus(null);
    try {
      const turnstileToken = await getFreshToken();
      if (!turnstileToken) {
        setSubmitStatus({ ok: false, msg: 'Verificação de segurança falhou. Recarregue a página.' });
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, turnstileToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitStatus({ ok: true, msg: 'Sugestão recebida! Será avaliada em breve.' });
        setSubmitUrl('');
      } else if (res.status === 409) {
        setSubmitStatus({ ok: false, msg: 'Este vídeo já foi enviado anteriormente.' });
      } else if (res.status === 429) {
        setSubmitStatus({ ok: false, msg: 'Muitas tentativas. Tente novamente mais tarde.' });
      } else {
        setSubmitStatus({ ok: false, msg: data.error || 'Erro ao enviar. Tente novamente.' });
      }
    } catch {
      setSubmitStatus({ ok: false, msg: 'Erro de conexão. Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  }

  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Entrevistas Indexadas — InevitávelGPT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="entrevistas" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>

          <div style={s.topRow}>
            <a href="/renan-santos-responde" style={s.backBtn}>
              <BackIcon /> Voltar
            </a>
            <h1 style={s.title}>Entrevistas indexadas</h1>
          </div>

          {/* Sugestão de entrevista */}
          <div style={s.submitCard}>
            <p style={s.submitLabel}>Sugerir entrevista</p>
            <form onSubmit={handleSubmit} style={s.submitRow}>
              <input
                type="url"
                value={submitUrl}
                onChange={e => { setSubmitUrl(e.target.value); setSubmitStatus(null); }}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={submitting}
                style={s.submitInput}
              />
              <button type="submit" disabled={submitting || !submitUrl.trim()} style={submitting || !submitUrl.trim() ? s.submitBtnDisabled : s.submitBtnActive}>
                {submitting ? '…' : 'Enviar'}
              </button>
            </form>
            {submitStatus && (
              <p style={submitStatus.ok ? s.submitOk : s.submitErr}>{submitStatus.msg}</p>
            )}
            <p style={s.submitInfo}>
              Links sugeridos passam por curadoria automática de um agente de IA todos os dias às 18h. Após validação, a entrevista é incluída na base.
            </p>
          </div>

          {/* Pesquisa */}
          {!videosLoading && videos.length > 0 && (
            <div style={s.searchRow}>
              <span style={s.searchIcon}><SearchIcon /></span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar por título ou canal…"
                style={s.searchInput}
              />
            </div>
          )}

          {/* Lista */}
          {videosLoading && (
            <div style={s.loadingWrap}>
              <div style={s.loadingBar}>
                <span style={{ ...s.loadingDot, animationDelay: '0ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '180ms' }} />
                <span style={{ ...s.loadingDot, animationDelay: '360ms' }} />
              </div>
            </div>
          )}

          {!videosLoading && videos.length === 0 && (
            <div style={s.empty}>
              <p style={s.emptyText}>Nenhuma entrevista indexada ainda.</p>
            </div>
          )}

          {!videosLoading && videos.length > 0 && filtered.length === 0 && (
            <div style={s.empty}>
              <p style={s.emptyText}>Nenhuma entrevista encontrada para "{search}".</p>
            </div>
          )}

          {!videosLoading && filtered.length > 0 && (
            <div style={s.videoList}>
              {filtered.map(v => (
                <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" style={s.videoCard}>
                  <div style={s.videoInfo}>
                    <span style={s.videoTitle}>{v.title || 'Entrevista sem título'}</span>
                    <span style={s.videoMeta}>
                      {[v.channel, v.published_at ? formatDate(v.published_at) : null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span style={s.ytBtn}><YouTubeIcon /> Assistir</span>
                </a>
              ))}
            </div>
          )}

        </main>
        <div id="turnstile-videos" style={{ display: 'none' }} />
      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg    = dark ? '#111111' : '#F2F2F2';
  const cardBg    = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr   = dark ? '#333333' : '#000000';
  const text1     = dark ? '#EEEEEE' : '#000000';
  const textMuted = dark ? '#888888' : '#666666';
  const inputBg   = dark ? '#0D0D0D' : '#FFFFFF';
  const inputBdr  = dark ? '#444444' : '#000000';

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
    topRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '24px',
    },
    backBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      border: `2px solid ${dark ? '#444444' : '#000000'}`,
      borderRadius: '20px',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: textMuted,
      textDecoration: 'none',
      background: 'none',
      flexShrink: 0,
    },
    title: {
      fontSize: '1.1rem',
      fontWeight: 800,
      color: text1,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    submitCard: {
      background: cardBg,
      border: `2px solid ${cardBdr}`,
      borderRadius: '12px',
      padding: '20px 24px',
      marginBottom: '16px',
    },
    submitLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: '12px',
    },
    submitRow: {
      display: 'flex',
      gap: '10px',
    },
    submitInput: {
      flex: 1,
      padding: '10px 14px',
      border: `2px solid ${inputBdr}`,
      borderRadius: '8px',
      fontSize: '0.9rem',
      outline: 'none',
      color: text1,
      background: inputBg,
      minWidth: 0,
    },
    submitBtnActive: {
      padding: '10px 20px',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      fontSize: '0.9rem',
      fontWeight: 800,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    submitBtnDisabled: {
      padding: '10px 20px',
      background: dark ? '#2A2A2A' : '#F2F2F2',
      color: dark ? '#555555' : '#999999',
      border: `2px solid ${dark ? '#2A2A2A' : '#F2F2F2'}`,
      borderRadius: '8px',
      fontSize: '0.9rem',
      fontWeight: 800,
      cursor: 'not-allowed',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    submitOk: {
      marginTop: '10px',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: '#22a06b',
    },
    submitErr: {
      marginTop: '10px',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: '#FF0000',
    },
    submitInfo: {
      marginTop: '12px',
      fontSize: '0.78rem',
      color: textMuted,
      lineHeight: 1.5,
      margin: '12px 0 0',
    },
    searchRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      background: cardBg,
      border: `2px solid ${cardBdr}`,
      borderRadius: '12px',
      padding: '10px 16px',
      marginBottom: '16px',
    },
    searchIcon: {
      color: textMuted,
      display: 'flex',
      flexShrink: 0,
    },
    searchInput: {
      flex: 1,
      border: 'none',
      outline: 'none',
      fontSize: '0.95rem',
      color: text1,
      background: 'transparent',
    },
    loadingWrap: {
      background: cardBg,
      borderRadius: '12px',
      padding: '48px 24px',
      border: `2px solid ${cardBdr}`,
      textAlign: 'center',
    },
    loadingBar: { display: 'flex', justifyContent: 'center', gap: '8px' },
    loadingDot: {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: '#FCBF22',
      border: '2px solid #000000',
      display: 'inline-block',
      animation: 'pulse 1.2s ease-in-out infinite',
    },
    empty: {
      background: cardBg,
      borderRadius: '12px',
      padding: '32px 24px',
      border: `2px solid ${cardBdr}`,
      textAlign: 'center',
    },
    emptyText: { color: textMuted, fontSize: '0.9rem', margin: 0 },
    videoList: { display: 'flex', flexDirection: 'column', gap: '10px' },
    videoCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '18px 24px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      textDecoration: 'none',
    },
    videoInfo: { display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 },
    videoTitle: {
      fontSize: '0.9rem',
      fontWeight: 700,
      color: text1,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    videoMeta: { fontSize: '0.78rem', color: textMuted },
    ytBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '7px 14px',
      background: '#FF0000',
      color: '#FFFFFF',
      borderRadius: '8px',
      fontSize: '0.82rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
  };
}
