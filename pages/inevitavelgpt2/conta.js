import Head from 'next/head';
import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useSessionGate } from '../../hooks/useSessionGate';

function statusLabel(status) {
  return {
    approved: 'Permitido',
    blocked: 'Nao permitido',
    pending: 'Pendente',
  }[status] || 'Pendente';
}

function formatReais(cents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

function statusText(status) {
  return {
    published: 'Sucesso',
    suggested: 'Sugestao gerada',
    skipped: 'Ignorado',
    failed: 'Falhou',
  }[status] || status || 'Pendente';
}

function formatBalanceDelta(cents) {
  if (cents === null || cents === undefined) return '';
  const value = Number(cents) || 0;
  if (value === 0) return 'Saldo inalterado';
  const prefix = value > 0 ? '+' : '-';
  return `${prefix}${formatReais(Math.abs(value))}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function BotXTwitterAccount() {
  const [dark, toggleDark] = useDarkMode();
  const [state, setState] = useState({ loading: true, user: null, error: null });
  const [runsState, setRunsState] = useState({ loading: true, runs: [], error: null });
  const [balanceState, setBalanceState] = useState({ loading: true, events: [], error: null });
  useSessionGate();

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/inevitavelgpt2/me');
      if (res.status === 401) {
        window.location.assign('/inevitavelgpt2');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setState({ loading: false, user: null, error: data.error || 'Erro ao carregar conta.' });
        return;
      }
      setState({ loading: false, user: data.user, settings: data.settings || {}, error: null });

      const runsRes = await fetch('/api/inevitavelgpt2/runs');
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        setRunsState({ loading: false, runs: runsData.runs || [], error: null });
      } else {
        setRunsState({ loading: false, runs: [], error: 'Nao foi possivel carregar o log.' });
      }

      const balanceRes = await fetch('/api/inevitavelgpt2/balance-events');
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        setBalanceState({ loading: false, events: balanceData.events || [], error: null });
      } else {
        setBalanceState({ loading: false, events: [], error: 'Nao foi possivel carregar as movimentacoes.' });
      }
    }
    load();
  }, []);

  async function logout() {
    await fetch('/api/inevitavelgpt2/logout', { method: 'POST' });
    window.location.assign('/inevitavelgpt2');
  }

  const user = state.user;
  const approved = user?.access_status === 'approved';
  const tweetCostCents = Number(state.settings?.tweet_cost_cents || 0);
  const creditBalanceCents = Number(user?.credit_balance_cents ?? 0);
  const displayName = user?.x_name || user?.x_username || '';
  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Conta - Bot X/Twitter</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="inevitavelgpt2" dark={dark} toggleDark={toggleDark} />
        <main style={s.main}>
          <header style={s.header}>
            <h1 style={s.title}>Bot X/Twitter</h1>
            <button onClick={logout} style={s.secondaryButton}>Sair</button>
          </header>

          {state.loading && <section style={s.card}>Carregando...</section>}
          {state.error && <section style={s.card}>{state.error}</section>}

          {user && (
            <>
              <section style={s.card}>
                <div style={s.accountRow}>
                  <div>
                    <strong style={s.name}>{displayName}</strong>
                    <div style={s.muted}>@{user.x_username}</div>
                  </div>
                </div>

                <div style={s.grid}>
                  <div style={s.metric}>
                    <span style={s.metricLabel}>Status</span>
                    <strong>{statusLabel(user.access_status)}</strong>
                  </div>
                  <div style={s.metric}>
                    <span style={s.metricLabel}>Creditos</span>
                    <strong>{formatReais(creditBalanceCents)}</strong>
                  </div>
                  <div style={s.metric}>
                    <span style={s.metricLabel}>Custo por resposta</span>
                    <strong>{formatReais(tweetCostCents)}</strong>
                  </div>
                </div>

                {!approved && (
                  <p style={s.notice}>
                    Sua conta ja esta conectada. A liberacao e manual; quando permitida, o bot passara
                    a monitorar sua conta X.
                  </p>
                )}

                {approved && creditBalanceCents < tweetCostCents && (
                  <p style={s.notice}>
                    Sua conta esta permitida, mas nao ha saldo suficiente para novas respostas.
                  </p>
                )}
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>Como funciona</h2>
                <p style={s.bodyText}>
                  O bot monitora seus tweets com os termos "livro amarelo" ou "renan santos" e responde
                  pela sua propria conta X. Cada resposta publicada consome {formatReais(tweetCostCents)} do saldo disponivel.
                </p>
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>Permissao da X/Twitter</h2>
                <p style={s.bodyText}>
                  Se voce revogar o aplicativo nas configuracoes da X/Twitter, basta reconectar a conta
                  para liberar novamente o acesso. A reconexao atualiza os tokens da mesma conta, sem
                  criar um novo cadastro.
                </p>
                <div style={s.actions}>
                  <a href="/api/inevitavelgpt2/oauth/start" style={s.buttonLink}>
                    Reconectar conta X
                  </a>
                  <a
                    href="https://x.com/settings/connected_apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={s.secondaryLink}
                  >
                    Revogar na X/Twitter
                  </a>
                </div>
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>Log dos ultimos 10 tweets</h2>
                {runsState.loading && <p style={s.bodyText}>Carregando ultimas respostas...</p>}
                {runsState.error && <p style={s.bodyText}>{runsState.error}</p>}
                {!runsState.loading && !runsState.error && runsState.runs.length === 0 && (
                  <p style={s.bodyText}>Ainda nao ha tweets processados.</p>
                )}
                {!runsState.loading && runsState.runs.length > 0 && (
                  <div style={s.logList}>
                    {runsState.runs.map(run => (
                      <div key={run.id} style={s.logItem}>
                        <div style={s.logHeader}>
                          <span style={run.status === 'published' ? s.statusOk : run.status === 'failed' ? s.statusError : s.statusMuted}>
                            {statusText(run.status)}
                          </span>
                          <span style={s.logDate}>{formatDate(run.created_at)}</span>
                        </div>
                        <p style={s.logText}>
                          Tweet capturado{run.source_type ? ` (${run.source_type})` : ''}
                          {run.captured_tweet_created_at ? ` em ${formatDate(run.captured_tweet_created_at)}` : ''}
                        </p>
                        {run.balance_delta_cents !== null && run.balance_delta_cents !== undefined && (
                          <p style={s.logDelta}>{formatBalanceDelta(run.balance_delta_cents)}</p>
                        )}
                        {run.api_result && <p style={s.logMeta}>{run.api_result}</p>}
                        {run.error_message && <p style={s.logError}>{run.error_message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>Movimentacoes de saldo</h2>
                {balanceState.loading && <p style={s.bodyText}>Carregando movimentacoes...</p>}
                {balanceState.error && <p style={s.bodyText}>{balanceState.error}</p>}
                {!balanceState.loading && !balanceState.error && balanceState.events.length === 0 && (
                  <p style={s.bodyText}>Ainda nao ha movimentacoes de saldo.</p>
                )}
                {!balanceState.loading && balanceState.events.length > 0 && (
                  <div style={s.logList}>
                    {balanceState.events.map(event => (
                      <div key={event.id} style={s.logItem}>
                        <div style={s.logHeader}>
                          <span style={event.delta_cents > 0 ? s.statusOk : event.delta_cents < 0 ? s.statusError : s.statusMuted}>
                            {event.delta_cents > 0 ? 'Credito' : event.delta_cents < 0 ? 'Debito' : 'Saldo inalterado'}
                          </span>
                          <span style={s.logDate}>{formatDate(event.created_at)}</span>
                        </div>
                        <p style={s.logDelta}>{formatBalanceDelta(event.delta_cents)}</p>
                        {event.note && <p style={s.logText}>{event.note}</p>}
                        <p style={s.logMeta}>{event.source === 'bot' ? 'Automacao' : 'Admin'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg = dark ? '#111111' : '#F2F2F2';
  const cardBg = dark ? '#1A1A1A' : '#FFFFFF';
  const border = dark ? '#333333' : '#000000';
  const softBorder = dark ? '#444444' : '#DDDDDD';
  const text1 = dark ? '#EEEEEE' : '#000000';
  const text2 = dark ? '#CCCCCC' : '#333333';
  const muted = dark ? '#888888' : '#666666';

  return {
    page: {
      minHeight: '100vh',
      background: pageBg,
      color: text1,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    main: {
      width: '100%',
      maxWidth: '800px',
      margin: '0 auto',
      padding: '32px 24px 80px',
    },
    header: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 20,
    },
    title: {
      fontSize: 'clamp(2rem, 5vw, 3rem)',
      lineHeight: 1,
      letterSpacing: 0,
    },
    card: {
      background: cardBg,
      border: `2px solid ${border}`,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    },
    accountRow: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 18,
    },
    name: {
      display: 'block',
      fontSize: 18,
    },
    muted: {
      color: muted,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
    },
    metric: {
      border: `1px solid ${softBorder}`,
      borderRadius: 8,
      padding: 12,
    },
    metricLabel: {
      display: 'block',
      color: muted,
      fontSize: 12,
      fontWeight: 800,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    notice: {
      background: dark ? '#201C12' : '#FFF7E0',
      border: '2px solid #FCBF22',
      borderRadius: 8,
      color: text2,
      padding: 12,
      marginTop: 16,
      lineHeight: 1.5,
      fontWeight: 600,
    },
    sectionTitle: {
      fontSize: 22,
      marginBottom: 12,
      color: text1,
    },
    bodyText: {
      color: text2,
      lineHeight: 1.7,
      marginBottom: 10,
    },
    actions: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 14,
    },
    buttonLink: {
      display: 'inline-flex',
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: 8,
      padding: '0 14px',
      fontWeight: 900,
      textDecoration: 'none',
    },
    secondaryLink: {
      display: 'inline-flex',
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      background: cardBg,
      color: text1,
      border: `2px solid ${border}`,
      borderRadius: 8,
      padding: '0 14px',
      fontWeight: 900,
      textDecoration: 'none',
    },
    logList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    logItem: {
      border: `1px solid ${softBorder}`,
      borderRadius: 8,
      padding: 12,
    },
    logHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 8,
    },
    logDate: {
      color: muted,
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    },
    logText: {
      color: text2,
      fontSize: 14,
      lineHeight: 1.5,
      margin: 0,
    },
    logError: {
      color: '#CC0000',
      fontSize: 13,
      fontWeight: 700,
      lineHeight: 1.4,
      marginTop: 8,
    },
    logDelta: {
      color: muted,
      fontSize: 13,
      fontWeight: 800,
      lineHeight: 1.4,
      marginTop: 8,
    },
    logMeta: {
      color: muted,
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.4,
      marginTop: 6,
      textTransform: 'uppercase',
    },
    statusOk: {
      color: '#147A26',
      fontSize: 12,
      fontWeight: 900,
      textTransform: 'uppercase',
    },
    statusError: {
      color: '#CC0000',
      fontSize: 12,
      fontWeight: 900,
      textTransform: 'uppercase',
    },
    statusMuted: {
      color: muted,
      fontSize: 12,
      fontWeight: 900,
      textTransform: 'uppercase',
    },
    secondaryButton: {
      minHeight: 40,
      background: cardBg,
      color: text1,
      border: `2px solid ${border}`,
      borderRadius: 8,
      padding: '0 14px',
      fontWeight: 900,
    },
  };
}
