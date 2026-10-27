import { useMemo } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Planner } from '../lib/shared';
import { href } from '../lib/router';

interface Risk { kind: string; id: string; title: string; dueAt: string; review?: string; needed: number; planned: number; missing: number }

/** Required work due within the week whose planned minutes fall short before its deadline (src/planner.cjs risks). */
export function DeadlineRisks() {
  const { snapshot: d, now, progress, planSettings, f } = useApp();
  const { t } = useI18n();
  const list = useMemo(() => {
    try {
      return Planner.risks({ snapshot: d, now, days: 7, todos: progress.todo || {}, archive: progress.archive || {}, dismissed: progress.dismissed || {}, settings: planSettings, emailTriage: progress.emailTriage || {} }) as Risk[];
    } catch { return [] as Risk[]; }
  }, [d, now, progress, planSettings]);
  if (!list.length) return null;
  return (
    <section role="alert" className="rounded-[14px] border border-danger-line bg-danger-soft p-4 text-sm">
      <p className="font-semibold text-danger">{t.plan.risksTitle(list.length)}</p>
      <ul className="mt-1.5 space-y-1">
        {list.map((r) => (
          <li key={r.kind + r.id + (r.review ?? '')}>
            <a className="text-ink" href={href('plan', { date: f.dayKey(new Date(Date.parse(r.dueAt) - 1)) })}>{r.review ? t.plan.riskReview(r.title) : r.title}</a>
            <span className="text-muted"> · {t.plan.riskLine(r.missing, r.needed, f.day(r.dueAt))}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted">{t.plan.risksNote}</p>
    </section>
  );
}
