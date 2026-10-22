import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import type { BreakdownChoice } from '../components/Breakdown';
import type { CaseStudyText } from './caseStudyContent';

// The newest model evaluation result (evals/luna-ai/results/<date>.json), written by scripts/ai-eval.mjs. Numbers on the page come
// only from this file, so they cannot drift from what was actually run.
const files = import.meta.glob('../../../evals/luna-ai/results/*.json', { eager: true, import: 'default' }) as Record<string, Result>;
const latest = Object.keys(files).sort().at(-1);
const result: Result | null = latest ? files[latest] : null;

interface Run { pass: boolean; errors: string[]; firstErrors?: string[] }
interface Result {
  model: string; servedModels: string[]; runAt: string; runsPerCase: number;
  firstSummary?: { overall: Tally };
  summary: { overall: Tally; byTask: Record<'brief' | 'breakdown' | 'propose', Tally>; cases: number; casesPassingEveryRun: number; usage: { costUSD: number } };
  cases: { id: string; task: string; why: string; runs: Run[] }[];
}
interface Tally { passed: number; total: number }

export function AiEvals({ c }: { c: CaseStudyText['ai'] }) {
  const { progress, f } = useApp();
  const { t } = useI18n();
  const choices = Object.values((progress.aiBreakdown || {}) as Record<string, BreakdownChoice>);
  const count = (s: BreakdownChoice['status']) => choices.filter((x) => x.status === s).length;
  const fixed = result ? result.cases.flatMap((x) => x.runs.map((r, i) => ({ id: x.id, run: i + 1, r })).filter((y) => y.r.pass && y.r.firstErrors?.length)) : [];
  const failures = result ? result.cases.flatMap((x) => x.runs.map((r, i) => ({ id: x.id, run: i + 1, error: r.errors[0] })).filter((_, i) => !x.runs[i].pass)) : [];
  const pct = (x: Tally) => (x.total ? Math.round((100 * x.passed) / x.total) : 0);

  return (
    <>
      {c.body.map((p) => <p key={p}>{p}</p>)}
      <ul className="grid gap-3 sm:grid-cols-3">
        {c.features.map(([h, body]) => <li key={h} className="panel p-4"><h3 className="font-semibold text-ink">{h}</h3><p className="mt-1.5 text-sm text-muted">{body}</p></li>)}
      </ul>

      <h3 className="pt-2 font-semibold text-ink">{c.resultsTitle}</h3>
      <p>{c.resultsIntro}</p>
      {result ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-soft text-xs text-muted"><tr>{c.head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {(['brief', 'breakdown', 'propose'] as const).map((k) => {
                  const x = result.summary.byTask[k];
                  return <tr key={k}><th scope="row" className="px-4 py-3 font-medium text-ink">{c.tasks[k][0]}</th><td className="whitespace-nowrap px-4 py-3 font-mono">{x.passed}/{x.total} · {pct(x)}%</td><td className="px-4 py-3 text-muted">{c.tasks[k][1]}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {result.firstSummary && <p className="text-sm">{c.rescored(`${result.firstSummary.overall.passed}/${result.firstSummary.overall.total}`, `${result.summary.overall.passed}/${result.summary.overall.total}`)}</p>}
          <p className="text-sm text-muted">{c.meta(result.servedModels.join(', ') || result.model, f.day(result.runAt), result.runsPerCase, result.summary.usage.costUSD)}</p>
          <h4 className="font-semibold text-ink">{c.failuresTitle}</h4>
          {failures.length
            ? <><p className="text-sm text-muted">{c.failuresNote}</p><ul className="space-y-1 text-sm">{failures.map((x) => <li key={x.id + x.run}><span className="font-mono text-xs text-muted">{x.id} #{x.run}</span> {x.error}</li>)}</ul></>
            : <p className="text-sm text-muted">{c.noFailures}</p>}
          {fixed.length > 0 && <><h4 className="font-semibold text-ink">{c.scorerFixed}</h4><ul className="space-y-1 text-sm">{fixed.map((x) => <li key={x.id + x.run}><span className="font-mono text-xs text-muted">{x.id} #{x.run}</span> <s className="text-muted">{x.r.firstErrors![0]}</s></li>)}</ul></>}
          {c.lessons.map((p) => <p key={p}>{p}</p>)}
        </>
      ) : <p className="text-sm text-muted">{c.pending}</p>}
      <p className="text-sm text-muted">{c.limits}</p>

      <div className="rounded-xl border border-accent-line bg-accent-soft p-4">
        <h3 className="text-sm font-semibold text-accent">{c.visitorTitle}</h3>
        <p className="mt-1.5 text-sm">{choices.length
          ? c.visitor(count('accepted'), count('edited'), count('dismissed'), choices.reduce((n, x) => n + (x.edits || 0), 0))
          : c.visitorEmpty}</p>
        {!choices.length && <a href="#/coursework" className="mt-2 inline-block text-[13px]">{t.nav.coursework} →</a>}
      </div>
    </>
  );
}
