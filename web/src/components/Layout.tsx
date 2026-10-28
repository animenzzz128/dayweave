import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { DESKTOP_NAV, href, MORE, TABS, type Route } from '../lib/router';
import { THEMES, useTheme, type ThemePref } from '../lib/theme';
import { ErrorBoundary, ErrorState } from './ui';
import { CommandPalette, shortcutLabel } from './CommandPalette';

const THEME_ICONS: Record<ThemePref, ReactNode> = {
  system: <><rect x="2.5" y="3.5" width="11" height="7.5" rx="1.5" /><path d="M6 13.5h4" /></>,
  light: <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>,
  dark: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />,
};

// 20px line icons for the phone tab bar, drawn on the same 16-unit grid as the theme icons.
const TAB_ICONS: Record<(typeof TABS)[number] | 'more', ReactNode> = {
  today: <><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" /></>,
  plan: <><path d="M3 2.5v11" /><rect x="5.5" y="3" width="8" height="3" rx="1" /><rect x="5.5" y="8.5" width="5" height="3" rx="1" /></>,
  review: <><rect x="2" y="2" width="12" height="12" rx="2.5" /><path d="m5.2 8.2 2 2 3.6-4" /></>,
  coursework: <><path d="M2.5 3.5c2-1 4-1 5.5 0v10c-1.5-1-3.5-1-5.5 0Z" /><path d="M13.5 3.5c-2-1-4-1-5.5 0v10c1.5-1 3.5-1 5.5 0Z" /></>,
  more: <><circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none" /></>,
};

const Icon = ({ size = 16, children }: { size?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Open/closed state for a menu that closes on Escape, an outside press or a page change. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const nav = () => setOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', down);
    window.addEventListener('hashchange', nav);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down); window.removeEventListener('hashchange', nav); };
  }, [open]);
  return { open, setOpen, ref };
}

function ThemeLang() {
  const { t, lang, setLang } = useI18n();
  const { pref, setPref } = useTheme();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t.theme.label} className="flex rounded-lg border border-line p-0.5">
        {THEMES.map((p) => (
          <button key={p} type="button" aria-pressed={pref === p} aria-label={t.theme[p]} title={t.theme[p]} onClick={() => setPref(p)}
            className={`grid min-h-10 min-w-10 place-items-center rounded-md transition-colors ${pref === p ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>
            <Icon>{THEME_ICONS[p]}</Icon>
          </button>
        ))}
      </div>
      <div role="group" aria-label={t.lang.label} className="flex rounded-lg border border-line p-0.5">
        {(['en', 'zh'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
            className={`min-h-10 rounded-md px-3 text-[13px] transition-colors ${lang === l ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>{t.lang[l]}</button>
        ))}
      </div>
    </div>
  );
}

function SignOut({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  // A plain form post: the server checks its Origin, clears the session cookie and shows the signed-out page.
  return <form method="post" action="/auth/logout"><button type="submit" className={`min-h-10 rounded-lg border border-accent-line bg-raised px-3 text-[13px] text-accent-ink transition-colors hover:bg-accent-soft ${className}`}>{t.local.signOut}</button></form>;
}

/** Demo or private-instance strip. Phones see one short line; the explanation and demo controls open on request. */
function Banner({ route }: { route: Route }) {
  const { t } = useI18n();
  const { source, run, outage } = useApp();
  const [open, setOpen] = useState(false);
  const demo = source.mode === 'demo';
  const long = demo ? t.demo.banner : source.hosted ? t.local.hosted : t.local.banner;
  const short = demo ? t.shell.demo : source.hosted ? t.shell.hosted : t.shell.local;
  const control = 'min-h-10 rounded-lg border border-warn-edge bg-raised px-3 text-warn transition-colors hover:bg-warn-soft sm:min-h-8';
  const actions = demo && (<>
    {route !== 'case-study' && <a href={href('case-study')} className="font-medium text-warn underline underline-offset-2 hover:text-ink">{t.demo.about} →</a>}
    {source.setOutage && (
      <button type="button" aria-pressed={!!outage} className={control}
        onClick={() => run(() => source.setOutage!(!outage), outage ? t.demo.outageEnded : t.demo.outageStarted)}>{outage ? t.demo.outageOff : t.demo.outageOn}</button>
    )}
    {source.reset && <button type="button" className={control} onClick={() => run(() => source.reset!(), t.demo.resetDone)}>{t.demo.reset}</button>}
  </>);
  return (
    <div className={`border-b text-[13px] ${demo ? 'border-warn-line bg-warn-soft text-warn' : 'border-accent-line bg-accent-soft text-accent-ink'}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 sm:hidden">
        <span className="flex items-center gap-2 font-medium"><span aria-hidden="true" className={`size-1.5 rounded-full ${demo ? 'bg-warn-dot' : 'bg-accent'}`} />{short}</span>
        {(demo || source.hosted) && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-8 px-1 underline underline-offset-2">{open ? t.shell.hide : t.shell.details}</button>}
      </div>
      <div className={`${open ? 'flex' : 'hidden'} flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 sm:flex sm:justify-center sm:py-2`}>
        <span className="w-full sm:w-auto">{long}</span>
        {source.hosted && <span className="max-sm:hidden"><SignOut /></span>}
        {actions}
      </div>
    </div>
  );
}

const navLink = (active: boolean) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm no-underline transition-colors ${active ? 'bg-selected font-medium text-ink' : 'text-sub hover:bg-soft hover:text-ink'}`;
const menuLink = (active: boolean) => `flex min-h-11 items-center rounded-lg px-3 text-[15px] no-underline transition-colors ${active ? 'bg-selected font-medium text-ink' : 'text-body hover:bg-soft hover:text-ink'}`;

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useI18n();
  const { source, waiting, notice, dismissNotice } = useApp();
  const [palette, setPalette] = useState(false);
  const more = useMenu();
  const settings = useMenu();
  const sheet = useMenu();
  const inMore = (MORE as readonly Route[]).includes(route);
  const badge = waiting.length > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 font-mono text-[11px] text-on-accent">{waiting.length}</span>;
  return (
    <div className="min-h-screen bg-surface">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <Banner route={route} />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 px-4 py-2 sm:px-8 sm:py-3">
          <div className="flex min-w-0 items-center gap-x-6">
            <a href={href('today')} className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-ink no-underline">
              <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2558D9" /><path d="M7 12c4 0 4 10 9 10s5-10 9-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
              {t.brand}
            </a>
            <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 max-sm:hidden">
              <div className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1">
                {DESKTOP_NAV.map((r) => (
                  <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined} className={navLink(r === route)}>{t.nav[r]}{r === 'review' && badge}</a>
                ))}
              </div>
              <div ref={more.ref} className="relative">
                <button type="button" aria-expanded={more.open} aria-haspopup="true" onClick={() => more.setOpen(!more.open)} className={`${navLink(inMore)} flex items-center gap-1`}>
                  {inMore ? t.nav[route] : t.shell.more}
                  <Icon size={12}><path d="m4 6 4 4 4-4" /></Icon>
                </button>
                {more.open && (
                  <div className="animate-fade absolute left-0 top-full z-40 mt-1 w-52 rounded-xl border border-line bg-raised p-1.5 shadow-lg">
                    {MORE.map((r) => <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined} className={menuLink(r === route)}>{t.nav[r]}</a>)}
                  </div>
                )}
              </div>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog" aria-label={t.palette.open}
              className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-line px-2.5 text-[13px] text-muted transition-colors hover:bg-soft hover:text-ink">
              <Icon><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></Icon>
              <span className="max-lg:hidden">{t.palette.open}</span>
              <kbd className="whitespace-nowrap rounded border border-line px-1 font-mono text-[11px] max-lg:hidden">{shortcutLabel}</kbd>
            </button>
            <div ref={settings.ref} className="relative max-sm:hidden">
              <button type="button" aria-expanded={settings.open} aria-haspopup="true" aria-label={t.shell.settings} title={t.shell.settings} onClick={() => settings.setOpen(!settings.open)}
                className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-line text-sub transition-colors hover:bg-soft hover:text-ink">
                <Icon><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></Icon>
              </button>
              {settings.open && (
                <div className="animate-fade absolute right-0 top-full z-40 mt-1 grid w-max gap-3 rounded-xl border border-line bg-raised p-3 shadow-lg">
                  <ThemeLang />
                  {source.hosted && <SignOut className="w-full" />}
                </div>
              )}
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
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1360px] px-4 pb-28 pt-5 outline-none sm:px-8 sm:pb-16 sm:pt-7">
        <ErrorBoundary key={route} fallback={(e, reset) => <ErrorState title={t.common.pageError} message={e.message} hint={t.common.errorHint} onRetry={reset} retry={t.common.retry} />}>
          <div className="animate-rise">{children}</div>
        </ErrorBoundary>
      </main>
      <div ref={sheet.ref} className="sm:hidden">
        {sheet.open && (
          <>
            <div aria-hidden="true" className="animate-fade fixed inset-0 z-30 bg-black/30" onClick={() => sheet.setOpen(false)} />
            <div role="dialog" aria-modal="true" aria-label={t.shell.menu}
              className="animate-rise fixed inset-x-0 bottom-0 z-40 grid gap-4 rounded-t-2xl border-t border-line bg-raised px-4 pt-3 shadow-2xl"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}>
              <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-line" />
              <nav aria-label={t.shell.pages} className="grid gap-0.5">
                {(['week', ...MORE] as Route[]).map((r) => <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined} className={menuLink(r === route)}>{t.nav[r]}</a>)}
              </nav>
              <div className="grid gap-3 border-t border-line pt-4">
                <ThemeLang />
                {source.hosted && <SignOut className="w-full" />}
              </div>
            </div>
          </>
        )}
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="grid grid-cols-5">
            {TABS.map((r) => (
              <a key={r} href={href(r)} aria-current={r === route ? 'page' : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] no-underline ${r === route ? 'font-medium text-accent' : 'text-muted'}`}>
                <Icon size={20}>{TAB_ICONS[r]}</Icon>
                {t.nav[r]}
                {r === 'review' && waiting.length > 0 && <span className="absolute left-1/2 top-1.5 ml-1.5 min-w-4 rounded-full bg-accent px-1 text-center font-mono text-[10px] leading-4 text-on-accent">{waiting.length}</span>}
              </a>
            ))}
            <button type="button" aria-expanded={sheet.open} aria-haspopup="dialog" onClick={() => sheet.setOpen(!sheet.open)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] ${sheet.open || inMore || route === 'week' ? 'font-medium text-accent' : 'text-muted'}`}>
              <Icon size={20}>{TAB_ICONS.more}</Icon>
              {t.shell.more}
            </button>
          </div>
        </nav>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
