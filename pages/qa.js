import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export default function QA() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const widgetIdRef = useRef(null);
  const turnstileResolve = useRef(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) {
      router.replace('/');
      return;
    }

    // Load Turnstile on this page so we can request a fresh token per question
    if (typeof window === 'undefined') return;
    if (window.turnstile) {
      if (!widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container-qa', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (t) => {
            if (turnstileResolve.current) {
              turnstileResolve.current(t);
              turnstileResolve.current = null;
            }
          }
        });
      }
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (window.turnstile && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container-qa', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (t) => {
            if (turnstileResolve.current) {
              turnstileResolve.current(t);
              turnstileResolve.current = null;
            }
          }
        });
      }
    };
    document.body.appendChild(s);
  }, [router]);

  async function getFreshTurnstileToken() {
    if (typeof window === 'undefined' || !window.turnstile || widgetIdRef.current == null) {
      return null;
    }
    return await new Promise((resolve) => { turnstileResolve.current = resolve; window.turnstile.execute(widgetIdRef.current); });
  }

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);

    // Request a fresh token for this question (Turnstile tokens are single-use/short-lived)
    const freshToken = await getFreshTurnstileToken();
    if (!freshToken) {
      setLoading(false);
      sessionStorage.removeItem('turnstileToken');
      alert('Não foi possível obter token de verificação. Você será redirecionado para verificar novamente.');
      router.replace('/');
      return;
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, turnstileToken: freshToken })
    });
    if (res.status === 403) {
      // token invalid/expired/secret missing — require re-verification
      sessionStorage.removeItem('turnstileToken');
      alert('Verificação falhou ou expirou. Você será redirecionado para verificar novamente.');
      router.replace('/');
      return;
    }
    const data = await res.json();
    setAnswer(data);
    setLoading(false);
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Livro Amarelo — Q&A</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Question</h2>
        <input value={q} onChange={e => setQ(e.target.value)} style={{ width: 600 }} />
        <div style={{ marginTop: 8 }}>
          <button onClick={ask} disabled={loading}>Ask</button>
        </div>
      </section>

      {answer && (
        <section style={{ marginTop: 20 }}>
          <h2>Answer</h2>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: 12 }}>
            {answer.text}
          </div>
        </section>
      )}

      {/* Hidden Turnstile widget used to execute per-request tokens */}
      <div id="turnstile-container-qa" style={{ display: 'none' }} />
    </main>
  );
}
