import type { ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href, ROUTES, type Route } from '../lib/router';

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { source, waiting, run, notice, dismissNotice } = useApp();
  const demo = source.mode === 'demo';
  return (
    <div className="min-h-screen bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b px-4 py-2 text-[13px] ${demo ? 'border-[#f3e2bf] bg-warn-soft text-warn' : 'border-accent-line bg-accent-soft text-accent-ink'}`}>
        <span>{demo ? t.demo.banner : t.local.banner}</span>
        {demo && source.reset && (
          <button type="button" className="min-h-8 rounded-lg border border-[#e6cf9f] bg-white px-3 text-warn" onClick={() => run(() => source.reset!(), t.demo.resetDone)}>{t.demo.reset}</button>
        )}
      </div>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <a href={href('today')} className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink no-underline">
              <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2558D9" /><path d="M7 12c4 0 4 10 9 10s5-10 9-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
              {t.brand}
            </a>
            <nav aria-label="Main" className="-mx-1 flex max-w-full gap-0.5 overflow-x-auto">
              {ROUTES.map((r) => (
                <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm no-underline ${r === route ? 'bg-[#f1f4fa] font-medium text-ink' : 'text-[#4b5563] hover:bg-soft hover:text-ink'}`}>
                  {t.nav[r]}{r === 'review' && waiting.length > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 font-mono text-[11px] text-white">{waiting.length}</span>}
                </a>
              ))}
            </nav>
          </div>
          <div role="group" aria-label={t.lang.label} className="flex rounded-lg border border-line p-0.5">
            {(['en', 'zh'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`min-h-8 rounded-md px-2.5 text-[13px] ${lang === l ? 'bg-ink text-white' : 'text-[#4b5563] hover:bg-soft'}`}>{t.lang[l]}</button>
            ))}
          </div>
        </div>
      </header>
      {notice && (
        <div className="mx-auto max-w-[1360px] px-4 pt-4 sm:px-8"><div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.kind === 'error' ? 'border-[#f6d3c4] bg-danger-soft text-danger' : 'border-[#bbf7d0] bg-ok-soft text-ok'}`}>
          <span className="whitespace-pre-line">{notice.text}</span>
          <button type="button" className="shrink-0 underline" onClick={dismissNotice}>{t.common.close}</button>
        </div></div>
      )}
      <main id="main" className="mx-auto max-w-[1360px] px-4 pb-16 pt-7 sm:px-8">{children}</main>
    </div>
  );
}
