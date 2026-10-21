import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// index.html applies the saved theme before first paint; this keeps it in sync afterwards.
const KEY = 'dayweave.theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEMES)[number];

interface Theme { pref: ThemePref; dark: boolean; setPref: (p: ThemePref) => void }
const Ctx = createContext<Theme | null>(null);
const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function initial(): ThemePref {
  try {
    const saved = localStorage.getItem(KEY);
    if ((THEMES as readonly string[]).includes(saved || '')) return saved as ThemePref;
  } catch { /* storage unavailable */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(initial);
  const [systemDark, setSystemDark] = useState(() => query().matches);
  useEffect(() => {
    const q = query();
    const on = () => setSystemDark(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const dark = pref === 'dark' || (pref === 'system' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  const value = useMemo<Theme>(() => ({
    pref,
    dark,
    setPref: (p) => { setPrefState(p); try { localStorage.setItem(KEY, p); } catch { /* not persisted */ } },
  }), [pref, dark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside provider');
  return v;
}
