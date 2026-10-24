import { useEffect, useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Dot, External, PageHeader, Section, Tag, sourceTone } from '../components/ui';

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
        </div>
        <div className="space-y-8">
          <Section title={t.health.principles}>
            <ol className="list-decimal space-y-2 pl-5 text-sm">{t.health.principleList.map((x) => <li key={x}>{x}</li>)}</ol>
          </Section>
          {source.backups && <Backups />}
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
