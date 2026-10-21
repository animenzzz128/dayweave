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
