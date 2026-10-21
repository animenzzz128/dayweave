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

interface AppData extends Loaded {
  source: DataSource;
  now: Date;
  f: Format;
  /** Runs a change, then reloads. Errors become a visible notice instead of a silent failure. */
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  notice: { kind: 'ok' | 'error'; text: string } | null;
  dismissNotice: () => void;
  classify: (a: Assignment) => string;
  isDone: (a: Assignment) => boolean;
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

  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try { await action(); await reload(); if (success) setNotice({ kind: 'ok', text: success }); return true; } catch (e) { setNotice({ kind: 'error', text: (e as Error).message }); return false; }
  }, [reload]);

  const value = useMemo<AppData | null>(() => {
    if (!data) return null;
    const d = data.snapshot;
    Core.configure(d.timezone);
    const failed = new Set(d.sources.filter((s) => ['failed', 'unavailable'].includes(s.status)).map((s) => s.id));
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
      classify: (a) => (a.sourceId && failed.has(a.sourceId) && !DONE.includes(a.status) ? 'verify' : Core.classify(a, now)),
      isDone: (a) => DONE.includes(a.status),
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

  if (error && !data) return <div className="p-6 sm:p-10"><ErrorState title={t.common.error} message={error} hint={t.common.errorHint} onRetry={reload} retry={t.common.retry} /></div>;
  if (!value) return <LoadingShell label={t.common.loading} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
