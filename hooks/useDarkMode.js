import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDark(true);
  }, []);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      localStorage.setItem('darkMode', String(next));
      return next;
    });
  }

  return [dark, toggleDark];
}
