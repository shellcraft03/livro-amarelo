import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export function useSessionGate() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch('/api/session', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          try {
            sessionStorage.removeItem('turnstileToken');
          } catch {}
          router.replace('/');
          return;
        }
        setCheckingSession(false);
      } catch {
        if (!cancelled) router.replace('/');
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return checkingSession;
}
