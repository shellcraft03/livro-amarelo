import { useEffect, useRef, useState } from 'react';

export function useTurnstile(containerId, { onToken, action, lazy = false } = {}) {
  const widgetIdRef    = useRef(null);
  const tokenResolveRef = useRef(null);
  const activatedRef   = useRef(false);
  const intervalRef    = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    ensureScriptLoaded();
    if (!lazy) activate();
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function ensureScriptLoaded() {
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return;
    const s = document.createElement('script');
    s.src    = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async  = true;
    s.defer  = true;
    document.body.appendChild(s);
  }

  function renderWidget() {
    if (widgetIdRef.current != null) return;
    widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      action,
      callback: (token) => {
        if (onToken) onToken(token);
        if (tokenResolveRef.current) {
          tokenResolveRef.current(token);
          tokenResolveRef.current = null;
          if (window.turnstile && widgetIdRef.current != null) {
            window.turnstile.reset(widgetIdRef.current);
          }
        }
      },
    });
    setReady(true);
  }

  function activate() {
    if (activatedRef.current) return;
    activatedRef.current = true;
    if (window.turnstile) {
      renderWidget();
    } else {
      intervalRef.current = setInterval(() => {
        if (window.turnstile) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          renderWidget();
        }
      }, 100);
    }
  }

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current != null) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
    activatedRef.current = false;
    tokenResolveRef.current = null;
    setReady(false);
  }

  function reset() {
    if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current != null) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }

  async function getFreshToken() {
    if (typeof window === 'undefined') return null;
    activate();
    return new Promise((resolve) => {
      function waitForWidget() {
        if (widgetIdRef.current != null && window.turnstile) {
          tokenResolveRef.current = resolve;
          window.turnstile.reset(widgetIdRef.current);
        } else {
          setTimeout(waitForWidget, 50);
        }
      }
      waitForWidget();
    });
  }

  return { ready, getFreshToken, activate, reset };
}
