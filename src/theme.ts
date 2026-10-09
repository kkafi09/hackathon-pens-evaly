import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const key = 'kasirnusa-theme';

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#071224' : '#f3f7fd');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => stored() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  useEffect(() => {
    apply(theme);
  }, [theme]);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      if (!stored()) setTheme(query.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* The switch still works without storage. */
    }
    setTheme(next);
  }
  return { theme, toggle };
}
