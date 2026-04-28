import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const widgetIdRef = useRef(null);
  const turnstileResolve = useRef(null);

  useEffect(() => {
    // load Turnstile script if not present
    if (typeof window === 'undefined') return;
    if (window.turnstile) {
      // already loaded: render widget
      if (!widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token) => {
            setTurnstileToken(token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
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
        widgetIdRef.current = window.turnstile.render('#turnstile-container', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token) => {
            setTurnstileToken(token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
              turnstileResolve.current = null;
            }
          }
        });
      }
    };
    document.body.appendChild(s);
  }, []);

  async function ingest() {
    if (!text.trim()) return alert('Coloque texto para ingestão');
    setLoading(true);
    await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    setLoading(false);
    alert('Ingestão concluída');
  }

  async function uploadPdf(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    // ensure turnstile token
    if (!turnstileToken) {
      if (window.turnstile && widgetIdRef.current != null) {
        await new Promise((resolve) => { turnstileResolve.current = resolve; window.turnstile.execute(widgetIdRef.current); });
      } else {
        setLoading(false);
        return alert('Turnstile not ready');
      }
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('turnstileToken', turnstileToken);
    const res = await fetch('/api/ingest-pdf', { method: 'POST', body: fd });
    const data = await res.json();
    setLoading(false);
    alert(`PDF ingest: pages=${data.pages}, chunks=${data.chunks}`);
  }

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    // ensure turnstile token
    if (!turnstileToken) {
      if (window.turnstile && widgetIdRef.current != null) {
        await new Promise((resolve) => { turnstileResolve.current = resolve; window.turnstile.execute(widgetIdRef.current); });
      } else {
        setLoading(false);
        return alert('Turnstile not ready');
      }
    }

    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, turnstileToken })
    });
    const data = await res.json();
    setAnswer(data);
    setLoading(false);
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Livro Amarelo — Q&A Demo</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Ingest Text</h2>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={10} cols={80} />
        <div>
          <button onClick={ingest} disabled={loading}>Ingest</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Upload PDF:</label>
          <input type="file" accept="application/pdf" onChange={uploadPdf} disabled={loading} />
          <div id="turnstile-container" style={{ marginTop: 8 }} />
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Question</h2>
        <input value={q} onChange={e => setQ(e.target.value)} style={{ width: 600 }} />
        <div>
          <button onClick={ask} disabled={loading}>Ask</button>
        </div>
      </section>

      {answer && (
        <section style={{ marginTop: 20 }}>
          <h2>Answer</h2>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: 12 }}>
            {answer.text}
          </div>

          <h3>Sources</h3>
          <ul>
            {answer.sources?.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
