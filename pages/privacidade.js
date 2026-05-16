import Head from 'next/head';
import { useDarkMode } from '../hooks/useDarkMode';
import Header from '../components/Header';
import ShareBar from '../components/ShareBar';

export default function Privacidade() {
  const [dark, toggleDark] = useDarkMode();
  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Privacidade — o Livro Amarelo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="privacidade" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>
          <div style={s.card}>
            <h1 style={s.title}>Política de Privacidade</h1>
            <p style={s.updated}>Atualizada em maio de 2026</p>

            <Section title="Dados coletados" s={s}>
              Esta aplicação coleta apenas dados básicos para garantir a segurança e o bom
              funcionamento do site. O Bot X/Twitter é um recurso opcional e envolve dados
              adicionais descritos na seção própria abaixo.
              <ul style={s.list}>
                <li><strong>Endereço IP</strong> — usado para controle de taxa de requisições (rate limiting), prevenindo uso abusivo. Não é armazenado de forma persistente.</li>
                <li><strong>Métricas de desempenho</strong> — tempo de carregamento e dados de performance da página, coletados pelo Vercel Speed Insights de forma agregada.</li>
                <li><strong>Dados de navegação</strong> — páginas visitadas e interações, coletados pelo Google Analytics para entender o uso geral do site.</li>
                <li><strong>Dados do dispositivo</strong> — informações técnicas do navegador coletadas pelo Cloudflare Turnstile para verificação de que o usuário é humano.</li>
              </ul>
            </Section>

            <Section title="Dados do Bot X/Twitter" s={s}>
              Caso você opte por conectar sua conta X/Twitter ao Bot, poderemos coletar e armazenar
              os dados necessários para autenticação, liberação manual, configuração, operação e
              auditoria do recurso:
              <ul style={s.list}>
                <li><strong>Identidade pública da conta X/Twitter</strong> — ID da conta, @usuário, nome exibido e imagem pública de perfil.</li>
                <li><strong>Tokens OAuth</strong> — tokens de acesso e renovação fornecidos pela X/Twitter para executar a integração autorizada. Esses tokens são armazenados criptografados.</li>
                <li><strong>Escopos e estado da conexão</strong> — permissões concedidas, data de expiração, renovação e eventual revogação da conexão.</li>
                <li><strong>Status de acesso</strong> — situação na lista de espera, aprovação manual, plano, limites, datas de aprovação ou expiração e observações administrativas.</li>
                <li><strong>Configurações do bot</strong> — ativação ou pausa, modo de operação, fonte selecionada, gatilhos, limites diários e preferências relacionadas.</li>
                <li><strong>Histórico de execução</strong> — tweets ou textos processados, respostas geradas, indicação de imagem gerada, tweet publicado, erros, horários e contadores de uso.</li>
              </ul>
              <p style={{ marginTop: '12px' }}>
                Esses dados são usados para operar o bot em nome da conta conectada, evitar respostas
                duplicadas, aplicar limites, investigar falhas e prevenir abuso. A autorização também
                pode ser revogada nas configurações da própria X/Twitter.
              </p>
            </Section>

            <Section title="O que não coletamos" s={s}>
              Fora do uso opcional do Bot X/Twitter, nenhum dado pessoal identificável como nome ou
              e-mail é solicitado. As perguntas feitas nos chats públicos <strong>não são armazenadas
              por este site</strong>, porém são enviadas à OpenAI para processamento e podem ser
              retidas nos logs desse serviço, sobre os quais não temos controle. Consulte a{' '}
              <a href="https://openai.com/pt/policies/privacy-policy/" target="_blank" rel="noopener noreferrer" style={s.link}>política de privacidade da OpenAI</a>{' '}
              para mais informações.
            </Section>

            <Section title="Terceiros" s={s}>
              Os seguintes serviços terceiros processam dados ao usar esta aplicação:
              <ul style={s.list}>
                <li><strong>Vercel</strong> — hospedagem e métricas de performance</li>
                <li><strong>Cloudflare Turnstile</strong> — verificação anti-bot</li>
                <li><strong>Google Analytics</strong> — análise de uso</li>
                <li><strong>OpenAI</strong> — processamento das perguntas via modelo de linguagem</li>
                <li><strong>X/Twitter</strong> — autenticação OAuth, leitura de dados autorizados e publicação de replies quando você usar o Bot X/Twitter</li>
              </ul>
              <p style={{ marginTop: '12px' }}>Cada serviço possui sua própria política de privacidade.</p>
            </Section>

            <Section title="Código aberto" s={s}>
              Todo o código deste site é aberto sob licença MIT.{' '}
              <a
                href="https://github.com/shellcraft03/livro-amarelo"
                target="_blank"
                rel="noopener noreferrer"
                style={s.linkBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                Ver no GitHub
              </a>
            </Section>
          </div>

          <ShareBar />
        </main>
      </div>
    </>
  );
}

function Section({ title, children, s }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function getStyles(dark) {
  const pageBg = dark ? '#111111' : '#F2F2F2';
  const cardBg = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr = dark ? '#333333' : '#000000';
  const text1 = dark ? '#EEEEEE' : '#000000';
  const textBody = dark ? '#CCCCCC' : '#333333';
  const textDim = dark ? '#888888' : '#666666';

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
      padding: '40px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
    },
    title: {
      fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
      fontWeight: 900,
      color: text1,
      letterSpacing: 0,
      lineHeight: 1.1,
      marginBottom: '4px',
    },
    updated: {
      fontSize: '0.8rem',
      color: textDim,
      marginTop: '-24px',
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    },
    sectionTitle: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    sectionBody: {
      fontSize: '0.95rem',
      color: textBody,
      lineHeight: 1.8,
    },
    list: {
      paddingLeft: '20px',
      marginTop: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    link: {
      color: dark ? '#FCBF22' : '#000000',
      textDecoration: 'underline',
      fontWeight: 600,
    },
    linkBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      color: dark ? '#FCBF22' : '#000000',
      fontSize: '0.95rem',
      fontWeight: 700,
      textDecoration: 'none',
    },
  };
}
