import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { DayTimeline, dayStartHour } from '../components/DayTimeline';
import { PageHeader } from '../components/ui';
import { Core, Demo } from '../lib/shared';
import { href } from '../lib/router';
import type { PlanResult } from '../data/types';

export function Week({ params }: { params: URLSearchParams }) {
  const { snapshot: d, f, now, source, run, progress, planSettings } = useApp();
  const { t } = useI18n();
  const today = f.dayKey(now);
  const days = Array.from({ length: 7 }, (_, i) => Demo.addDays(today, i) as string);
  const [date, setDate] = useState(params.get('date') || Demo.addDays(today, 1));
  const [result, setResult] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const cov = d.calendarCoverage;
  const noon = (day: string) => Date.parse(Core.zonedISO(day, '12:00'));
  // One first hour for all seven columns so their hours line up.
  const startHour = Math.min(...days.map((day) => dayStartHour(d, progress.dismissed, day, planSettings.dayStart)));

  const generate = async () => {
    setBusy(true);
    let r: PlanResult | null = null;
    await run(async () => { r = await source.generatePlan(date); });
    setResult(r);
    setBusy(false);
  };

  return (
    <>
      <PageHeader title={t.week.title} subtitle={t.week.subtitle} />
      <p className="mb-4 text-xs text-muted">{cov?.complete && cov.start && cov.end ? t.week.coverage(f.day(cov.start), f.day(new Date(Date.parse(cov.end) - 1).toISOString())) : t.week.coverageIncomplete}</p>
      <div className="mb-8 overflow-x-auto pb-2">
        <div className="grid min-w-[880px] grid-cols-7 gap-2">
          {days.map((day) => (
            <div key={day}>
              <div className={`mb-1.5 text-center text-sm ${day === today ? 'font-semibold text-accent' : 'text-muted'}`}>{f.day(new Date(noon(day)).toISOString())}</div>
              <DayTimeline date={day} scale={0.42} compact startHour={startHour} />
            </div>
          ))}
        </div>
      </div>

      <section aria-labelledby="gen" className="panel p-5">
        <h2 id="gen" className="text-lg font-semibold">{t.week.generate}</h2>
        <p className="mt-1 text-sm text-muted">{t.week.rules}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="plan-date">{t.week.generateFor}</label>
            <select id="plan-date" className="field min-w-48" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((day) => <option key={day} value={day}>{f.long(noon(day))}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={generate}>{busy ? t.week.generating : t.week.generate}</button>
        </div>
        {result && <PlanSummary r={result} />}
      </section>
    </>
  );
}

function PlanSummary({ r }: { r: PlanResult }) {
  const { f } = useApp();
  const { t } = useI18n();
  return (
    <div className="mt-5 grid gap-5 border-t border-line pt-5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]" role="status">
      <div>
        <h3 className="font-semibold">{t.week.result(r.blocks.length)}</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {r.blocks.map((b) => <li key={b.id}><span className="font-mono text-xs text-muted">{f.hm(b.start)}–{f.hm(b.end)}</span> {b.title}</li>)}
        </ul>
        {r.usable && <p className="mt-2 text-xs text-muted">{t.week.usage(r.usable.allocated, r.usable.budget, r.usable.minutes)}</p>}
        {r.blocks.length > 0 && <a href={href('review')} className="btn mt-3 no-underline">{t.week.toReview} →</a>}
      </div>
      <div className="space-y-4 text-sm">
        {r.gaps.length > 0 && <div><h3 className="font-semibold text-danger">{t.week.gaps}</h3><ul className="mt-1 list-disc pl-5">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
        {r.unscheduled.length > 0 && <div><h3 className="font-semibold">{t.week.unscheduled}</h3><ul className="mt-1 list-disc pl-5 text-muted">{r.unscheduled.map((u, i) => <li key={i}><span className="text-ink">{u.title}</span>: {u.reason}</li>)}</ul></div>}
        <details><summary className="cursor-pointer font-semibold">{t.week.assumptions}</summary><ul className="mt-1 list-disc pl-5 text-muted">{r.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
      </div>
    </div>
  );
}
