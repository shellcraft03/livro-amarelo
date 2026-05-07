import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useDarkMode } from '../hooks/useDarkMode';
import Header from '../components/Header';
import CustomSelect from '../components/CustomSelect';

const UF_LABELS = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

function periodLabel(p) {
  const [ano, mes] = p.split('-');
  return `${mes}/${ano}`;
}

export default function Filiados() {
  const [dark, toggleDark] = useDarkMode();
  const router = useRouter();

  const [allData, setAllData] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUF, setSelectedUF] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) router.replace('/');
  }, [router]);

  useEffect(() => {
    fetch('/api/filiados?meta=1')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(({ periodos: ps }) => {
        setPeriodos(ps);
        if (ps.length) setSelectedPeriod(`${ps[0].ano}-${String(ps[0].mes).padStart(2, '0')}`);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);
    const [ano, mes] = selectedPeriod.split('-');
    const ufParam = selectedUF ? `&uf=${selectedUF}` : '';
    fetch(`/api/filiados?ano=${ano}&mes=${Number(mes)}${ufParam}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(({ data }) => { setAllData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [selectedPeriod, selectedUF]);

  const ufs = Object.keys(UF_LABELS).sort();

  // Aggregate by partido (sum across UFs when no state filter)
  const byPartido = new Map();
  for (const row of allData) {
    const existing = byPartido.get(row.partido);
    if (existing) {
      existing.quantidade += row.quantidade;
    } else {
      byPartido.set(row.partido, { ...row });
    }
  }
  const rows = [...byPartido.values()].sort((a, b) => b.quantidade - a.quantidade);

  const totalFiliados = rows.reduce((s, r) => s + r.quantidade, 0);

  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Filiados Partidários — o Livro Amarelo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="filiados" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>

          <div style={s.card}>
            <h1 style={s.title}>Filiados Partidários no Brasil</h1>
            <p style={s.desc}>
              Número de filiados a partidos políticos por estado, com base nos dados públicos do
              Tribunal Superior Eleitoral (TSE). Atualizado automaticamente todo mês.
            </p>
          </div>

          <div style={s.filterCard}>
            <div style={s.filterRow}>
              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Estado</label>
                <CustomSelect
                  dark={dark}
                  disabled={loading}
                  value={selectedUF}
                  onChange={setSelectedUF}
                  options={[
                    { value: '', label: 'Todos os estados' },
                    ...ufs.map(uf => ({ value: uf, label: `${uf} — ${UF_LABELS[uf] ?? uf}` })),
                  ]}
                />
              </div>

              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Período</label>
                <CustomSelect
                  dark={dark}
                  disabled={loading}
                  value={selectedPeriod}
                  onChange={setSelectedPeriod}
                  options={periodos.map(p => {
                    const val = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
                    return { value: val, label: periodLabel(val) };
                  })}
                />
              </div>

              {!loading && !error && totalFiliados > 0 && (
                <div style={s.totalBadge}>
                  <span style={s.totalLabel}>Total</span>
                  <span style={s.totalValue}>{totalFiliados.toLocaleString('pt-BR')}</span>
                </div>
              )}
            </div>
          </div>

          <div style={s.tableCard}>
            {loading && <p style={s.status}>Carregando dados...</p>}
            {error && <p style={s.errorMsg}>Erro ao carregar dados: {error}</p>}

            {!loading && !error && (
              <div style={s.tableWrapper}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.thNum}>#</th>
                      <th style={s.th}>Sigla</th>
                      <th style={s.th}>Partido</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Filiados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.partido} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                        <td style={s.tdNum}>{i + 1}</td>
                        <td style={s.tdSigla}>{row.partido}</td>
                        <td style={s.td}>{row.nome_partido || '—'}</td>
                        <td style={s.tdNum}>{row.quantidade.toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                    {!rows.length && !loading && (
                      <tr>
                        <td colSpan={4} style={s.noData}>
                          Nenhum dado disponível para o período selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={s.fonte}>
            Fonte:{' '}
            <a
              href="https://dadosabertos.tse.jus.br/dataset/delegados-partidarios"
              target="_blank"
              rel="noopener noreferrer"
              style={s.fonteLink}
            >
              Tribunal Superior Eleitoral (TSE)
            </a>
          </p>

        </main>
      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg  = dark ? '#111111' : '#F2F2F2';
  const cardBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr = dark ? '#333333' : '#000000';
  const text1   = dark ? '#EEEEEE' : '#000000';
  const textDim = dark ? '#555555' : '#999999';
  const textSub = dark ? '#CCCCCC' : '#333333';
  const rowEven = dark ? '#1A1A1A' : '#FFFFFF';
  const rowOdd  = dark ? '#1F1F1F' : '#F8F8F8';

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
      padding: '40px 24px 80px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    card: {
      background: cardBg,
      borderRadius: '12px',
      padding: '32px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: 900,
      color: text1,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    desc: {
      fontSize: '0.95rem',
      color: textSub,
      lineHeight: 1.8,
      margin: 0,
    },
    filterCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '20px 24px',
      border: `2px solid ${cardBdr}`,
    },
    filterRow: {
      display: 'flex',
      gap: '16px',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
    },
    filterGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      flex: 1,
      minWidth: '160px',
    },
    filterLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    totalBadge: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      paddingBottom: '2px',
    },
    totalLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    totalValue: {
      fontSize: '1.1rem',
      fontWeight: 900,
      color: text1,
      fontVariantNumeric: 'tabular-nums',
    },
    tableCard: {
      background: cardBg,
      borderRadius: '12px',
      border: `2px solid ${cardBdr}`,
      overflow: 'hidden',
    },
    tableWrapper: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.9rem',
    },
    th: {
      padding: '12px 16px',
      textAlign: 'left',
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderBottom: `2px solid ${cardBdr}`,
      background: cardBg,
      whiteSpace: 'nowrap',
    },
    thNum: {
      padding: '12px 16px',
      textAlign: 'right',
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderBottom: `2px solid ${cardBdr}`,
      background: cardBg,
      whiteSpace: 'nowrap',
    },
    trEven: { background: rowEven },
    trOdd:  { background: rowOdd  },
    td: {
      padding: '11px 16px',
      color: textSub,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
    },
    tdNum: {
      padding: '11px 16px',
      color: textSub,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    },
    tdSigla: {
      padding: '11px 16px',
      color: text1,
      fontWeight: 700,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
      whiteSpace: 'nowrap',
    },
    noData: {
      padding: '40px 24px',
      textAlign: 'center',
      color: textDim,
      fontSize: '0.9rem',
    },
    status: {
      padding: '40px 24px',
      textAlign: 'center',
      color: textDim,
      fontSize: '0.9rem',
    },
    errorMsg: {
      padding: '40px 24px',
      textAlign: 'center',
      color: '#CC4444',
      fontSize: '0.9rem',
    },
    fonte: {
      fontSize: '0.78rem',
      color: textDim,
      textAlign: 'center',
    },
    fonteLink: {
      color: dark ? '#FCBF22' : '#000000',
      textDecoration: 'underline',
    },
  };
}
