import { useState, type ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href, NAV, type Route } from '../lib/router';
import { THEMES, useTheme, type ThemePref } from '../lib/theme';
import { ErrorBoundary, ErrorState } from './ui';
import { CommandPalette, shortcutLabel } from './CommandPalette';

const THEME_ICONS: Record<ThemePref, ReactNode> = {
  system: <><rect x="2.5" y="3.5" width="11" height="7.5" rx="1.5" /><path d="M6 13.5h4" /></>,
  light: <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>,
  dark: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />,
};

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { pref, setPref } = useTheme();
  const { source, waiting, run, notice, dismissNotice, outage } = useApp();
  const demo = source.mode === 'demo';
  const [palette, setPalette] = useState(false);
  return (
    <div className="min-h-screen bg-surface">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b px-4 py-2 text-[13px] ${demo ? 'border-warn-line bg-warn-soft text-warn' : 'border-accent-line bg-accent-soft text-accent-ink'}`}>
        <span>{demo ? t.demo.banner : source.hosted ? t.local.hosted : t.local.banner}</span>
        {source.hosted && <a href="/home" className="font-medium text-accent-ink underline underline-offset-2 hover:text-ink">{t.local.classic}</a>}
        {source.hosted && (
          // A plain form post: the server checks its Origin, clears the session cookie and shows the signed-out page.
          <form method="post" action="/auth/logout"><button type="submit" className="min-h-8 rounded-lg border border-accent-line bg-raised px-3 text-accent-ink transition-colors hover:bg-accent-soft">{t.local.signOut}</button></form>
        )}
        {demo && route !== 'case-study' && <a href={href('case-study')} className="font-medium text-warn underline underline-offset-2 hover:text-ink">{t.demo.about} →</a>}
        {demo && source.setOutage && (
          <button type="button" aria-pressed={!!outage} className="min-h-8 rounded-lg border border-warn-edge bg-raised px-3 text-warn transition-colors hover:bg-warn-soft"
            onClick={() => run(() => source.setOutage!(!outage), outage ? t.demo.outageEnded : t.demo.outageStarted)}>{outage ? t.demo.outageOff : t.demo.outageOn}</button>
        )}
        {demo && source.reset && (
          <button type="button" className="min-h-8 rounded-lg border border-warn-edge bg-raised px-3 text-warn transition-colors hover:bg-warn-soft" onClick={() => run(() => source.reset!(), t.demo.resetDone)}>{t.demo.reset}</button>
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
              {NAV.map((r) => (
                <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm no-underline transition-colors ${r === route ? 'bg-selected font-medium text-ink' : 'text-sub hover:bg-soft hover:text-ink'}`}>
                  {t.nav[r]}{r === 'review' && waiting.length > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 font-mono text-[11px] text-on-accent">{waiting.length}</span>}
                </a>
              ))}
              <span aria-hidden="true" className="mx-1 my-2 w-px shrink-0 bg-line" />
              <a href={href('case-study')} aria-current={route === 'case-study' ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm no-underline transition-colors ${route === 'case-study' ? 'bg-selected font-medium text-ink' : 'text-accent hover:bg-soft'}`}>{t.nav['case-study']}</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog"
              className="flex min-h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-[13px] text-muted transition-colors hover:bg-soft hover:text-ink">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
              <span className="max-sm:sr-only">{t.palette.open}</span>
              <kbd className="rounded border border-line px-1 font-mono text-[11px]">{shortcutLabel}</kbd>
            </button>
            <div role="group" aria-label={t.theme.label} className="flex rounded-lg border border-line p-0.5">
              {THEMES.map((p) => (
                <button key={p} type="button" aria-pressed={pref === p} aria-label={t.theme[p]} title={t.theme[p]} onClick={() => setPref(p)}
                  className={`grid min-h-8 min-w-8 place-items-center rounded-md transition-colors ${pref === p ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{THEME_ICONS[p]}</svg>
                </button>
              ))}
            </div>
            <div role="group" aria-label={t.lang.label} className="flex rounded-lg border border-line p-0.5">
              {(['en', 'zh'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={`min-h-8 rounded-md px-2.5 text-[13px] transition-colors ${lang === l ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>{t.lang[l]}</button>
              ))}
            </div>
          </div>
        </div>
      </header>
      {notice && (
        <div className="mx-auto max-w-[1360px] px-4 pt-4 sm:px-8"><div role={notice.kind === 'error' ? 'alert' : 'status'} className={`animate-rise flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.kind === 'error' ? 'border-danger-line bg-danger-soft text-danger' : 'border-ok-line bg-ok-soft text-ok'}`}>
          <span className="whitespace-pre-line">{notice.text}</span>
          <button type="button" className="shrink-0 underline" onClick={dismissNotice}>{t.common.close}</button>
        </div></div>
      )}
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1360px] outline-none px-4 pb-16 pt-7 sm:px-8">
        <ErrorBoundary key={route} fallback={(e, reset) => <ErrorState title={t.common.pageError} message={e.message} hint={t.common.errorHint} onRetry={reset} retry={t.common.retry} />}>
          <div className="animate-rise">{children}</div>
        </ErrorBoundary>
      </main>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
