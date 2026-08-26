import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

// Keep in sync with the inline script in index.html (which sets the initial
// class synchronously, before this module loads, to avoid a light-mode flash).
function getInitial(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('sehati-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getInitial);

  useEffect(() => {
    apply(mode);
    window.localStorage.setItem('sehati-theme', mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  return { mode, toggle, setMode };
}
