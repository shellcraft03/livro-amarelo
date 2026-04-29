import { useEffect, useRef, useState } from 'react';

export function useTurnstile(containerId, { onToken } = {}) {
  const widgetIdRef = useRef(null);
  const tokenResolveRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function renderWidget() {
      if (widgetIdRef.current != null) return;
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token) => {
          if (onToken) onToken(token);
          if (tokenResolveRef.current) {
            tokenResolveRef.current(token);
            tokenResolveRef.current = null;
            // Reset only when the token was explicitly requested via getFreshToken(),
            // so the widget is ready for the next call. Without this guard, the reset
            // would re-trigger the challenge on pages that use the automatic callback
            // (e.g. the verification page), causing an infinite loop.
            if (window.turnstile && widgetIdRef.current != null) {
              window.turnstile.reset(widgetIdRef.current);
            }
          }
        }
      });
      setReady(true);
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Avoid loading the script twice if another page already added it
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => { if (window.turnstile) renderWidget(); };
    document.body.appendChild(s);
  }, [containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function getFreshToken() {
    if (typeof window === 'undefined' || !window.turnstile || widgetIdRef.current == null) {
      return null;
    }
    return new Promise((resolve) => {
      tokenResolveRef.current = resolve;
      window.turnstile.reset(widgetIdRef.current);
      window.turnstile.execute(widgetIdRef.current);
    });
  }

  return { ready, getFreshToken };
}
