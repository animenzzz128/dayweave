import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Lang, type Messages } from './messages';

const KEY = 'dayweave.lang';

interface I18n { lang: Lang; t: Messages; setLang: (l: Lang) => void; locale: string }
const Ctx = createContext<I18n | null>(null);

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* storage unavailable */ }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; }, [lang]);
  const value = useMemo<I18n>(() => ({
    lang,
    t: messages[lang],
    locale: lang === 'zh' ? 'zh-CN' : 'en-US',
    setLang: (l) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* not persisted */ } },
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
