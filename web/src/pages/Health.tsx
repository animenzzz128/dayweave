import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Dot, External, PageHeader, Section, Tag, sourceTone } from '../components/ui';
import { Effort } from '../lib/shared';
import type { HistoryPage, Run, Trends, TrendWeek } from '../data/types';

export function Health() {
  const { snapshot: d, f, now, source, run } = useApp();
  const { t } = useI18n();
  const cov = d.calendarCoverage;
  return (
    <>
      <PageHeader title={t.health.title} subtitle={t.health.subtitle} />
      <div className="grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="space-y-8">
          <Section title={t.health.sources} aside={t.health.generated(f.ago(d.generatedAt, now))}>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {d.sources.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium"><Dot tone={sourceTone(s.status)} /><External url={s.source} className="text-ink">{s.name}</External></span>
                    <Tag tone={sourceTone(s.status)}>{t.status[s.status as 'ok'] ?? s.status}</Tag>
                  </div>
                  <p className="mt-1 text-xs text-muted">{t.health.lastGood(f.ago(s.lastSuccess, now))}{s.lastAttempt ? ` · ${t.health.lastAttempt(f.ago(s.lastAttempt, now))}` : ''}</p>
                  {s.note && <p className="mt-1 text-[13px]">{s.note}</p>}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t.health.coverage}>
            <div className="panel p-4 text-sm">
              <Tag tone={cov?.complete ? 'ok' : 'warn'}>{cov?.complete ? t.health.complete : t.health.incomplete}</Tag>
              {cov?.start && cov.end && <p className="mt-2">{f.day(cov.start)} – {f.day(new Date(Date.parse(cov.end) - 1).toISOString())} · {t.common.checkedAt(f.ago(cov.checkedAt, now))}</p>}
              {cov?.note && <p className="mt-1 text-muted">{cov.note}</p>}
            </div>
          </Section>
          <WeeklyTrends />
          {source.history && <History />}
        </div>
        <div className="space-y-8">
          <Calibration />
          <Section title={t.health.principles}>
            <ol className="list-decimal space-y-2 pl-5 text-sm">{t.health.principleList.map((x) => <li key={x}>{x}</li>)}</ol>
          </Section>
          {source.backups && <Backups />}
          {source.runs && <Runs />}
          {source.mode === 'demo' && (
            <Section title={t.health.demoData}>
              <div className="panel space-y-3 p-4 text-sm">
                <p>{t.health.demoDataNote}</p>
                {d.coverageNote && <p className="text-muted">{d.coverageNote}</p>}
                {source.reset && <button type="button" className="btn" onClick={() => run(() => source.reset!(), t.demo.resetDone)}>{t.demo.reset}</button>}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

// Server only. Restore asks first: it replaces the database (after saving the current one) and invalidates prepared approvals.
function Backups() {
  const { source, run } = useApp();
  const { t } = useI18n();
  const [list, setList] = useState<string[] | null>(null);
  const [all, setAll] = useState(false);
  const refresh = () => source.backups!().then(setList, () => setList([]));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list && (all ? list : list.slice(0, 7));
  return (
    <Section title={t.health.backups}>
      <div className="panel space-y-3 p-4 text-sm">
        <p className="text-muted">{t.health.backupsNote}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={async () => { let name = ''; await run(async () => { name = await source.backup!(); }); if (name) await refresh(); }}>{t.health.backupNow}</button>
          <a className="btn no-underline" href="/api/export">{t.health.exportData}</a>
        </div>
        {shown && (shown.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {shown.map((name) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono text-[12px] break-all">{name}</span>
                <button type="button" className="btn" onClick={() => { if (window.confirm(t.health.restoreConfirm(name))) run(() => source.restore!(name), t.health.restored(name)).then(refresh); }}>{t.health.restore}</button>
              </li>
            ))}
          </ul>
        ) : <p>{t.health.noBackups}</p>)}
        {list && !all && list.length > 7 && <button type="button" className="text-[13px] underline underline-offset-2" onClick={() => setAll(true)}>{t.health.showAll(list.length)}</button>}
      </div>
    </Section>
  );
}

interface Sample { id: string; estimateMinutes: number; actualMinutes: number; confirmedAt: string; state: string; ratio: number | null }

// Descriptive effort calibration from explicitly confirmed samples (src/effort.cjs). Nothing is adjusted from it.
function Calibration() {
  const { snapshot: d, progress, source, run, f } = useApp();
  const { t } = useI18n();
  const s = Effort.summary(progress.effortCalibration || {}, progress.actual || {}, d.assignments) as { threshold: number; count: number; sufficient: boolean; ratio: number | null; samples: Sample[]; excluded: Record<string, number> };
  const ratio = (r: number) => `${r.toFixed(2)}×`;
  const excluded = Object.entries(s.excluded).filter(([, n]) => n).map(([k, n]) => `${n} ${t.health.excludedKinds[k] ?? k}`);
  const title = (id: string) => { const a = d.assignments.find((x) => x.id === id); return a && !a.archivedFromSource ? a.title : `${a?.title || id} (${t.health.removedSource})`; };
  return (
    <Section title={t.health.calibration}>
      <div className="panel space-y-3 p-4 text-sm">
        <p className="text-muted">{t.health.calibrationNote}</p>
        <p className="font-medium">{s.sufficient && s.ratio !== null ? t.health.calibrationResult(ratio(s.ratio), s.count) : t.health.insufficient(s.count, s.threshold)}</p>
        <p className="text-xs text-muted">{t.health.excluded}: {excluded.join(' · ') || t.health.excludedNone}</p>
        {s.samples.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {s.samples.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <Tag tone={x.state === 'confirmed' ? 'ok' : 'warn'}>{x.state === 'confirmed' && x.ratio !== null ? ratio(x.ratio) : x.state === 'invalidated' ? t.health.needsReconfirm : t.health.malformed}</Tag>{' '}
                  {title(x.id)} · {t.health.sampleLine(x.actualMinutes, x.estimateMinutes)}{Number.isFinite(Date.parse(x.confirmedAt)) ? ` · ${f.day(x.confirmedAt)}` : ''}
                </span>
                {source.clearEffort && <button type="button" className="btn" onClick={() => run(() => source.clearEffort!(x.id), t.coursework.effortCleared)}>{t.coursework.clearEffort}</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">{t.health.calibrationFoot}</p>
      </div>
    </Section>
  );
}

// Server only: two dated weeks from retained snapshots (src/trends.cjs). Missing evidence is never shown as zero.
function WeeklyTrends() {
  const { source } = useApp();
  const { t } = useI18n();
  const [week, setWeek] = useState<string | undefined>();
  const [data, setData] = useState<Trends | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (source.trends) source.trends(week).then((x) => { setData(x); setError(''); }, (e: Error) => setError(e.message)); }, [source, week]);
  if (!source.trends) return <Section title={t.health.trends}><p className="panel p-4 text-sm text-muted">{t.health.trendsDemo}</p></Section>;
  if (error) return <Section title={t.health.trends}><p className="panel p-4 text-sm text-warn">{error}</p></Section>;
  if (!data) return null;
  if (!data.available) return <Section title={t.health.trends}><p className="panel p-4 text-sm text-warn">{data.reason}</p></Section>;
  const [prev, sel] = data.weeks, c = data.comparison, keys = Object.keys(t.health.metrics);
  const cell = (w: TrendWeek, k: string) => !w.observations ? '—' : w.latest?.noFresh ? t.health.noFresh : String(w.latest?.counts[k] ?? '—');
  return (
    <Section title={t.health.trends}>
      <div className="panel space-y-3 p-4 text-sm">
        <p className="text-muted">{t.health.trendsNote(data.timezone)} {t.health.retention(data.retention.days)}</p>
        <div className="flex flex-wrap gap-2">
          {data.nav.earlier && <button type="button" className="btn" onClick={() => setWeek(data.nav.earlier!)}>{t.health.earlier}</button>}
          {data.nav.later && <button type="button" className="btn" onClick={() => setWeek(data.nav.later!)}>{t.health.later}</button>}
          {!data.defaultWeek && <button type="button" className="btn" onClick={() => setWeek(undefined)}>{t.health.latestWeek}</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-line"><th className="py-1.5 pr-2 font-medium" />
              {[prev, sel].map((w, i) => <th key={w.start} className="px-2 py-1.5 font-medium">{i ? t.health.selectedWeek : t.health.previousWeek}<span className="block font-normal text-muted">{w.start} – {w.end}{w.current ? ` · ${t.health.inProgress}` : ''}</span></th>)}
              {c.comparable && <th className="px-2 py-1.5 font-medium">{t.health.comparison}</th>}</tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k} className="border-b border-line last:border-0"><th className="py-1.5 pr-2 font-normal">{t.health.metrics[k]}</th><td className="px-2 font-mono">{cell(prev, k)}</td><td className="px-2 font-mono">{cell(sel, k)}</td>
                {c.comparable && c.changes && <td className="px-2 font-mono">{c.changes[k] > 0 ? '+' : ''}{c.changes[k]}</td>}</tr>
            ))}</tbody>
          </table>
        </div>
        {[prev, sel].map((w) => {
          const failed = w.sources.filter((s) => s.failed);
          const notes = [!w.observations ? t.health.noObservations : t.health.observations(w.observations, w.imports), failed.length ? t.health.failedIn(failed.map((s) => s.name).join(', ')) : '', w.retentionLimited ? t.health.limited : ''].filter(Boolean);
          return <p key={w.start} className="text-xs text-muted"><span className="font-mono">{w.start}</span> · {notes.join(' · ')}</p>;
        })}
        {c.comparable ? <p className="text-xs text-muted">{t.health.comparable}</p> : (
          <div className="rounded-lg bg-warn-soft p-3 text-[13px] text-warn"><p>{t.health.notComparable}</p><ul className="mt-1 list-disc pl-5">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
        )}
      </div>
    </Section>
  );
}

const STATUSES = ['imported', 'career', 'checks', 'actual', 'confirmed', 'cleared', 'invalidated', 'prepared', 'approved', 'withdrawn', 'executed', 'failed', 'connected', 'disconnected', 'restored'];

// Server only: the audit log, 20 rows a page, filtered by text, status and date (store.history).
function History() {
  const { source, f } = useApp();
  const { t } = useI18n();
  const [filter, setFilter] = useState({ q: '', status: '', from: '', to: '', page: 1 });
  const [data, setData] = useState<HistoryPage | null>(null);
  useEffect(() => { source.history!(filter).then(setData, () => setData({ page: 1, total: 0, items: [] })); }, [source, filter]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setFilter({ q: v.q || '', status: v.status || '', from: v.from || '', to: v.to || '', page: 1 });
  };
  return (
    <Section title={t.health.history}>
      <div className="panel space-y-3 p-4 text-sm">
        <p className="text-muted">{t.health.historyNote}</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          <label className="min-w-0 flex-1"><span className="label">{t.health.search}</span><input name="q" className="field" defaultValue={filter.q} /></label>
          <label><span className="label">{t.health.from}</span><input name="from" type="date" className="field" defaultValue={filter.from} /></label>
          <label><span className="label">{t.health.to}</span><input name="to" type="date" className="field" defaultValue={filter.to} /></label>
          <label><span className="label">{t.health.statusCol}</span><select name="status" className="field" defaultValue={filter.status}><option value="">{t.health.allStatuses}</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <button type="submit" className="btn">{t.health.filter}</button>
        </form>
        {data && (data.items.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {data.items.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <details>
                  <summary className="cursor-pointer"><span className="font-mono text-[12px] text-muted">{f.day(r.at)} {f.time(r.at)}</span> · {r.kind} · <Tag tone={r.status === 'failed' ? 'warn' : 'neutral'}>{r.status}</Tag> <span className="break-all">{r.label}</span></summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-soft p-2 text-[11px]">{JSON.stringify(r.value, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : <p>{t.health.noHistory}</p>)}
        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{t.health.page(data.page, data.total)}</span>
            {data.page > 1 && <button type="button" className="btn" onClick={() => setFilter({ ...filter, page: data.page - 1 })}>{t.health.previous}</button>}
            {data.page * 20 < data.total && <button type="button" className="btn" onClick={() => setFilter({ ...filter, page: data.page + 1 })}>{t.health.next}</button>}
          </div>
        )}
      </div>
    </Section>
  );
}

// Server only: the last 30 measured runs (store.runs), shown as recorded.
function Runs() {
  const { source, f } = useApp();
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => { source.runs!().then(setRuns, () => setRuns([])); }, [source]);
  if (!runs) return null;
  return (
    <Section title={t.health.runs}>
      <div className="panel space-y-3 p-4 text-sm">
        <p className="text-muted">{t.health.runsNote}</p>
        {runs.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {runs.map((r, i) => (
              <li key={i} className="px-3 py-2">
                <details>
                  <summary className="cursor-pointer">{typeof r.startedAt === 'string' ? `${f.day(r.startedAt)} ${f.time(r.startedAt)}` : '—'} · {String(r.model ?? '—')} · {String(r.status ?? '—')}</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-soft p-2 text-[11px]">{JSON.stringify(r, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : <p>{t.health.noRuns}</p>}
      </div>
    </Section>
  );
}
