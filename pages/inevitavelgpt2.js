import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { useDarkMode } from '../hooks/useDarkMode';
import { useSessionGate } from '../hooks/useSessionGate';

export default function InevitavelGpt2Entry() {
  const router = useRouter();
  const [dark, toggleDark] = useDarkMode();
  const [checkingAccount, setCheckingAccount] = useState(true);
  useSessionGate();

  const oauthError = router.query.oauth_error;
  const s = getStyles(dark);

  useEffect(() => {
    if (oauthError) {
      setCheckingAccount(false);
      return;
    }

    async function checkConnectedAccount() {
      try {
        const res = await fetch('/api/inevitavelgpt2/me');
        if (res.ok) {
          router.replace('/inevitavelgpt2/conta');
          return;
        }
      } catch {
      }
      setCheckingAccount(false);
    }

    checkConnectedAccount();
  }, [oauthError, router]);

  return (
    <>
      <Head>
        <title>Bot X/Twitter</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="inevitavelgpt2" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>
          <section style={s.panel}>
            {checkingAccount ? (
              <>
                <h1 style={s.title}>Carregando conta.</h1>
                <p style={s.copy}>Verificando se sua conta X já está conectada.</p>
              </>
            ) : (
              <>
                <h1 style={s.title}>Conecte sua conta X.</h1>
                <p style={s.copy}>
                  Esta área usa a mesma verificação de sessão do site. Depois de conectar a conta X,
                  seu acesso entra em análise manual antes da automação ser liberada.
                </p>

                <a href="/api/inevitavelgpt2/oauth/start" style={s.button}>
                  Entrar com X
                </a>
              </>
            )}

            {oauthError && (
              <p style={s.error}>
                {errorMessage(oauthError)}
              </p>
            )}

            <p style={s.note}>
              O OAuth solicita acesso para ler tweets, publicar replies, enviar mídia e manter a conexão ativa.
              Voce pode revogar essa permissao a qualquer momento em{' '}
              <a
                href="https://x.com/settings/connected_apps"
                target="_blank"
                rel="noopener noreferrer"
                style={s.noteLink}
              >
                Aplicativos conectados da X/Twitter
              </a>.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}

function errorMessage(error) {
  return {
    missing_code: 'Não foi possível concluir o login: retorno da X/Twitter sem código de autorização.',
    invalid_state: 'Não foi possível concluir o login: sessão OAuth expirada ou inválida. Tente conectar novamente.',
    token_exchange_failed: 'Não foi possível concluir o login: falha ao trocar o código por tokens. Verifique Client ID, Client Secret, callback e scopes no portal da X/Twitter.',
    x_user_lookup_failed: 'Não foi possível concluir o login: falha ao buscar os dados da conta X/Twitter autorizada.',
    token_encryption_key_invalid: 'Não foi possível concluir o login: OAUTH_TOKEN_ENCRYPTION_KEY ausente ou inválida.',
    database_not_configured: 'Não foi possível concluir o login: DATABASE_URL não configurada.',
    database_schema_missing: 'Não foi possível concluir o login: tabelas do Bot X/Twitter ainda não foram criadas no banco.',
    database_failed: 'Não foi possível concluir o login: falha ao gravar os dados no banco.',
    callback_failed: 'Não foi possível concluir o login: erro inesperado no callback.',
  }[String(error)] || `Não foi possível concluir o login: ${String(error)}`;
}

function getStyles(dark) {
  const pageBg = dark ? '#111111' : '#F2F2F2';
  const cardBg = dark ? '#1A1A1A' : '#FFFFFF';
  const border = dark ? '#333333' : '#000000';
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
    panel: {
      background: cardBg,
      border: `2px solid ${border}`,
      borderRadius: '12px',
      padding: '28px',
    },
    title: {
      fontSize: 'clamp(2rem, 6vw, 3.3rem)',
      lineHeight: 1,
      letterSpacing: 0,
      marginBottom: '16px',
    },
    copy: {
      color: text2,
      fontSize: '1rem',
      lineHeight: 1.6,
      marginBottom: '24px',
    },
    button: {
      display: 'inline-flex',
      minHeight: '48px',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      padding: '0 20px',
      fontSize: '1rem',
      fontWeight: 900,
      textDecoration: 'none',
    },
    error: {
      marginTop: '16px',
      color: '#CC0000',
      fontWeight: 700,
    },
    note: {
      borderTop: `2px solid ${dark ? '#2A2A2A' : '#EEEEEE'}`,
      color: muted,
      fontSize: '0.82rem',
      lineHeight: 1.5,
      marginTop: '24px',
      paddingTop: '16px',
    },
    noteLink: {
      color: dark ? '#FCBF22' : '#000000',
      fontWeight: 800,
      textDecoration: 'underline',
    },
  };
}
