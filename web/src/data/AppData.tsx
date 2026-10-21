import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Core } from '../lib/shared';
import { makeFormat, type Format } from '../lib/format';
import { useI18n } from '../i18n/I18n';
import { ApiSource } from './api';
import { DemoSource } from './demo';
import type { Assignment, DataSource, Loaded, Proposal } from './types';

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

  if (error && !data) return <Failure message={error} onRetry={reload} />;
  if (!value) return <div className="p-10 text-muted" role="status">{t.common.loading}</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl p-10" role="alert">
      <h1 className="text-xl font-semibold">{t.common.error}</h1>
      <p className="mt-2 text-muted">{message}</p>
      <button type="button" className="btn mt-4" onClick={onRetry}>{t.common.retry}</button>
    </div>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
