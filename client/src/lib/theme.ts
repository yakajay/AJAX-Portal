import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ajax-theme';

const readTheme = (): Theme => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable: fall through to the system preference
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

// Apply before React renders so the first paint is already in the right theme
export const initTheme = () => applyTheme(readTheme());

// One shared theme for the whole app: the navbar button and the command palette both read and change it,
// so each stays in step with the other (separate per-component state left the navbar icon stale).
let current: Theme = readTheme();
const listeners = new Set<() => void>();

const setTheme = (theme: Theme) => {
  if (theme === current) return;
  current = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore: the choice just won't persist
  }
  listeners.forEach((notify) => notify());
};

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

// Keep other open tabs in step
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) setTheme(e.newValue);
  });
}

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, () => current, () => current);
  const toggle = useCallback(() => setTheme(current === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
};
