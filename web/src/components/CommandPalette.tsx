import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href, NAV, type Route } from '../lib/router';
import { THEMES, useTheme } from '../lib/theme';

interface Command { id: string; group: string; label: string; hint?: string; keywords?: string; run: () => void }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

/** Cmd/Ctrl+K: jump to any page, assignment, todo or proposal, or run a demo command, without the mouse. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang, setLang } = useI18n();
  const { setPref } = useTheme();
  const { snapshot: d, progress, source, run, waiting, outage, f, now } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      restore.current = document.activeElement as HTMLElement | null;
      setQuery(''); setActive(0);
    } else restore.current?.focus?.();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (h: string) => () => { window.location.hash = h; };
    const p = t.palette;
    const list: Command[] = [
      ...NAV.map((r: Route) => ({ id: 'page-' + r, group: p.pages, label: t.nav[r], keywords: r, run: go(href(r)) })),
      { id: 'page-case-study', group: p.pages, label: t.nav['case-study'], keywords: 'case study about how built portfolio', run: go(href('case-study')) },
      ...d.assignments.filter((a) => !a.archivedFromSource).map((a) => ({
        id: 'work-' + a.id, group: p.work, label: a.title, hint: `${a.course}${a.dueAt ? ' · ' + f.when(a.dueAt, now) : ''}`, keywords: a.course, run: go(href('coursework', { open: a.id })),
      })),
      ...Object.values(progress.todo || {}).filter((x) => x.status !== 'done').map((x) => ({
        id: 'todo-' + x.id, group: p.work, label: x.title, hint: p.todo, keywords: 'todo', run: go(href('coursework', { tab: 'todos' })),
      })),
      ...waiting.map((x) => ({
        id: 'proposal-' + x.id, group: p.proposals, label: x.title, hint: `${f.day(x.start)} ${f.hm(x.start)}–${f.hm(x.end)}`, keywords: 'proposal review approve', run: go(href('review', { id: x.id })),
      })),
      ...THEMES.map((th) => ({ id: 'theme-' + th, group: p.actions, label: `${t.theme.label}: ${t.theme[th]}`, keywords: `theme mode 主题 ${{ system: 'auto os 系统', light: 'light 浅色', dark: 'dark night 深色' }[th]}`, run: () => setPref(th) })),
      { id: 'lang', group: p.actions, label: lang === 'en' ? '切换到中文' : 'Switch to English', keywords: 'language 语言 english chinese', run: () => setLang(lang === 'en' ? 'zh' : 'en') },
      { id: 'plan', group: p.actions, label: t.week.generate, keywords: 'plan generate schedule 规划', run: go(href('week')) },
    ];
    if (source.setOutage) list.push({ id: 'outage', group: p.actions, label: outage ? t.demo.outageOff : t.demo.outageOn, keywords: 'outage failure fail 故障', run: () => { run(() => source.setOutage!(!outage), outage ? t.demo.outageEnded : t.demo.outageStarted); } });
    if (source.reset) list.push({ id: 'reset', group: p.actions, label: t.demo.reset, keywords: 'reset demo 重置', run: () => { run(() => source.reset!(), t.demo.resetDone); } });
    return list;
  }, [t, lang, setLang, setPref, d, progress, waiting, source, run, outage, f, now]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return commands.filter((c) => c.group !== t.palette.work || c.id.startsWith('todo-')).slice(0, 40);
    return commands.filter((c) => {
      const text = `${c.label} ${c.hint || ''} ${c.keywords || ''} ${c.group}`.toLowerCase();
      return words.every((w) => text.includes(w));
    }).slice(0, 40);
  }, [commands, query, t]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, listId]);

  if (!open) return null;

  const choose = (c: Command | undefined) => { if (!c) return; onOpenChange(false); c.run(); };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (results.length ? (i + 1) % results.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, results.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); }
    else if (e.key === 'Tab') e.preventDefault();
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] animate-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}>
      <div role="dialog" aria-modal="true" aria-label={t.palette.label} className="animate-rise w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-raised shadow-2xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-muted"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
          <input ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.palette.placeholder}
            role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={results.length ? `${listId}-${active}` : undefined} aria-label={t.palette.label}
            className="min-h-13 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
          <kbd className="shrink-0 rounded border border-line px-1.5 font-mono text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label={t.palette.label} className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.map((c, i) => {
            const heading = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {heading && <div role="presentation" className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</div>}
                <div id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => choose(c)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm ${i === active ? 'bg-selected text-ink' : 'text-body'}`}>
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 font-mono text-xs text-muted">{c.hint}</span>}
                </div>
              </li>
            );
          })}
          {!results.length && <li role="presentation" className="px-3 py-8 text-center text-sm text-muted">{t.palette.empty}</li>}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted" aria-hidden="true">
          <span><kbd className="font-mono">↑↓</kbd> {t.palette.move}</span><span><kbd className="font-mono">Enter</kbd> {t.palette.choose}</span><span><kbd className="font-mono">Esc</kbd> {t.common.close}</span>
        </div>
      </div>
    </div>
  );
}
