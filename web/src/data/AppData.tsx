import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Core } from '../lib/shared';
import { makeFormat, type Format } from '../lib/format';
import { useI18n } from '../i18n/I18n';
import { ApiSource } from './api';
import { DemoSource } from './demo';
import type { Assignment, DataSource, Loaded, Proposal } from './types';
import { ErrorState, Skeleton } from '../components/ui';

const DONE = ['submitted', 'graded', 'excused'];
const STARTED = ['executed', 'pending', 'unverified'];
// Work still open this many days after its due date leaves Today and the main lists for Coursework → Past due.
export const PAST_DAYS = 3;

interface AppData extends Loaded {
  source: DataSource;
  now: Date;
  f: Format;
  /** Runs a change, then reloads. Errors become a visible notice instead of a silent failure. */
  run: <T>(action: () => Promise<T>, success?: string | ((value: T) => string)) => Promise<boolean>;
  reload: () => Promise<void>;
  notice: { kind: 'ok' | 'error'; text: string } | null;
  dismissNotice: () => void;
  classify: (a: Assignment) => string;
  /** Submitted, graded or excused at the source, or marked done / not needed by you (a local mark; the source is unchanged). */
  isDone: (a: Assignment) => boolean;
  /** Your local mark, if any. */
  mark: (a: Assignment) => 'done' | 'skipped' | null;
  /** Not done and due more than PAST_DAYS ago: hidden from Today and listed under Past due. Nothing is deleted. */
  isPast: (a: Assignment) => boolean;
  waiting: Proposal[];
  started: (id: string) => boolean;
  workStatus: (status: string) => string;
  verifyReason: (a: Assignment) => string;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const [source] = useState<DataSource>(() => (__DAYWEAVE_MODE__ === 'local' ? new ApiSource() : new DemoSource()));
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<AppData['notice']>(null);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    try { const d = await source.load(); setNow(new Date()); setData(d); setError(null); } catch (e) { setError((e as Error).message); }
  }, [source]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>, success?: string | ((value: T) => string)) => {
    try { const value = await action(); await reload(); const text = typeof success === 'function' ? success(value) : success; if (text) setNotice({ kind: 'ok', text }); return true; } catch (e) { setNotice({ kind: 'error', text: (e as Error).message }); return false; }
  }, [reload]);

  const value = useMemo<AppData | null>(() => {
    if (!data) return null;
    const d = data.snapshot;
    Core.configure(d.timezone);
    const failed = new Set(d.sources.filter((s) => ['failed', 'unavailable'].includes(s.status)).map((s) => s.id));
    const archive = (data.progress.archive || {}) as Record<string, unknown>;
    const mark = (a: Assignment) => { const m = archive[a.id] as { status?: string } | true | null | undefined; return !m ? null : m === true || m.status === 'done' ? 'done' as const : 'skipped' as const; };
    const isDone = (a: Assignment) => DONE.includes(a.status) || !!mark(a);
    const started = (id: string) => d.actionHistory.some((h) => h.id === id && STARTED.includes(h.status));
    return {
      ...data,
      source,
      now,
      f: makeFormat(d.timezone, locale, t),
      run,
      reload,
      notice,
      dismissNotice: () => setNotice(null),
      // A record from a failed source is kept but cannot be trusted as current, so it needs verification first.
      classify: (a) => (mark(a) ? 'submitted' : a.sourceId && failed.has(a.sourceId) && !DONE.includes(a.status) ? 'verify' : Core.classify(a, now)),
      isDone,
      mark,
      isPast: (a) => !isDone(a) && !!a.dueAt && now.getTime() - Date.parse(a.dueAt) > PAST_DAYS * 86400000,
      waiting: d.proposals.filter((p) => !started(p.id) && !data.progress.dismissed?.[p.id]),
      started,
      workStatus: (s) => t.work[s] ?? s,
      verifyReason: (a) => {
        const s = d.sources.find((x) => x.id === a.sourceId && ['failed', 'unavailable'].includes(x.status));
        if (s) return t.verifyReason.source(s.status);
        if (a.requirement === 'uncertain') return t.verifyReason.uncertain;
        if (a.status === 'unknown') return a.requirement === 'choice' ? t.verifyReason.choiceUnknown : t.verifyReason.unknown;
        return t.verifyReason.requirement;
      },
    };
  }, [data, source, now, locale, t, run, reload, notice]);

  if (error && !data) return <div className="space-y-6 p-6 sm:p-10"><ErrorState title={t.common.error} message={error} hint={t.common.errorHint} onRetry={reload} retry={t.common.retry} />{source.backups && source.restore && <EmptyRestore source={source} onRestored={reload} />}</div>;
  if (!value) return <LoadingShell label={t.common.loading} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A database without a snapshot cannot open the pages, so its backups are offered here (this was the classic UI's job). */
function EmptyRestore({ source, onRestored }: { source: DataSource; onRestored: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => { source.backups!().then(setList, () => setList([])); }, [source]);
  if (!list?.length) return null;
  return (
    <section className="panel mx-auto max-w-xl space-y-3 p-4 text-sm">
      <h2 className="font-medium">{t.health.backups}</h2>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.slice(0, 7).map((name) => (
          <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="font-mono text-[12px] break-all">{name}</span>
            <button type="button" className="btn" onClick={() => { if (window.confirm(t.health.restoreConfirm(name))) source.restore!(name).then(onRestored, (e: Error) => setFailure(e.message)); }}>{t.health.restore}</button>
          </li>
        ))}
      </ul>
      {failure && <p role="alert" className="text-danger">{failure}</p>}
    </section>
  );
}

/** Shaped like the Today page, so the layout does not jump when the data arrives. */
function LoadingShell({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-surface" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-9 border-b border-line bg-soft" />
      <div className="mx-auto flex max-w-[1360px] items-center gap-6 border-b border-line px-4 py-4 sm:px-8"><Skeleton className="h-6 w-28" /><Skeleton className="h-5 w-72 max-w-full" /></div>
      <div className="mx-auto flex max-w-[1360px] flex-wrap gap-8 px-4 pt-7 sm:px-8">
        <div className="flex-[1_1_360px] space-y-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-[480px] w-full" /></div>
        <div className="flex-[999_1_520px] space-y-4"><Skeleton className="h-36 w-full" /><div className="grid grid-cols-3 gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-40 w-full" /></div>
      </div>
    </div>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
