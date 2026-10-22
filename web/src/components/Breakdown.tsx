import { useMemo, useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { AI } from '../lib/shared';
import { lookup, stepEdits, type Pack, type Step } from '../data/ai';
import { Tag } from './ui';
import type { Assignment } from '../data/types';

interface Kept { text: string; minutes: number }
/** What the student did with the suggestion, kept in this browser (progress kind "aiBreakdown"). */
export interface BreakdownChoice { status: 'accepted' | 'edited' | 'dismissed'; steps: Kept[]; original: number; edits: number; at: string }

/** The AI's suggested steps for one assignment. It is only a suggestion: accept it, edit it first, or ignore it. */
export function Breakdown({ a }: { a: Assignment }) {
  const { snapshot: d, now, f, progress, source, run } = useApp();
  const { t, lang } = useI18n();
  const day = f.dayKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pack = useMemo(() => AI.breakdownPack(a, d, now) as Pack, [a, d, day]);
  const result = lookup<{ steps: Step[] }>(pack, a.id);
  const choice = progress.aiBreakdown?.[a.id] as BreakdownChoice | undefined;
  const [editing, setEditing] = useState<Kept[] | null>(null);
  if (source.mode !== 'demo' || !AI.breakable(a)) return null;
  if (result.used !== 'ai') {
    if (result.reason === 'missing') return null;
    return <p className="text-xs text-muted">{t.ai.withheld[result.reason as 'evidence-changed' | 'invalid'] ?? t.ai.withheld.invalid}</p>;
  }
  const suggested: Kept[] = result.output.steps.map((s) => ({ text: s[lang], minutes: s.minutes }));
  const total = (list: Kept[]) => list.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const save = (status: BreakdownChoice['status'], steps: Kept[]) => run(() => source.saveProgress('aiBreakdown', a.id, {
    status, steps, original: suggested.length, edits: status === 'dismissed' ? 0 : stepEdits(suggested, steps), at: new Date().toISOString(),
  } satisfies BreakdownChoice));

  if (choice?.status === 'dismissed') return (
    <p className="text-xs text-muted">{t.ai.dismissed} <button type="button" className="underline underline-offset-2" onClick={() => run(() => source.saveProgress('aiBreakdown', a.id, null))}>{t.ai.restore}</button></p>
  );

  if (choice) return (
    <section className="rounded-xl border border-line p-3.5" aria-label={t.ai.yourPlan}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.ai.yourPlan}</h3>
        <Tag tone="ok">{choice.edits ? t.ai.edited(choice.edits) : t.ai.accepted}</Tag>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">{choice.steps.map((s, i) => <li key={i}>{s.text} <span className="font-mono text-xs text-muted">{f.duration(s.minutes)}</span></li>)}</ol>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{t.ai.total(f.duration(total(choice.steps)))}</span>
        <button type="button" className="underline underline-offset-2" onClick={() => run(() => source.saveProgress('aiBreakdown', a.id, null))}>{t.ai.undo}</button>
      </div>
    </section>
  );

  return (
    <section className="rounded-xl border border-accent-line bg-accent-soft p-3.5" aria-label={t.ai.breakdown}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-accent">{t.ai.breakdown}</h3>
        <Tag tone="info">{t.ai.aiTag}</Tag>
      </div>
      <p className="mb-2.5 text-xs text-muted">{t.ai.breakdownNote(result.model)}</p>
      {editing ? (
        <div className="space-y-2">
          {editing.map((s, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><label className="label" htmlFor={`bd-${a.id}-${i}`}>{t.ai.stepLabel(i + 1)}</label>
                <input id={`bd-${a.id}-${i}`} className="field" maxLength={140} value={s.text} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></div>
              <div className="w-24"><label className="label" htmlFor={`bdm-${a.id}-${i}`}>{t.ai.minutesLabel}</label>
                <input id={`bdm-${a.id}-${i}`} type="number" min={5} max={600} step={5} className="field" value={s.minutes} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))} /></div>
              <button type="button" className="btn" aria-label={`${t.ai.removeStep} ${i + 1}`} onClick={() => setEditing(editing.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setEditing([...editing, { text: '', minutes: 30 }])}>{t.ai.addStep}</button>
            <button type="button" className="btn btn-primary" disabled={!editing.length || editing.some((s) => !s.text.trim() || !(s.minutes > 0))}
              onClick={async () => { const steps = editing.map((s) => ({ text: s.text.trim(), minutes: s.minutes })); if (await save(stepEdits(suggested, steps) ? 'edited' : 'accepted', steps)) setEditing(null); }}>{t.ai.saveEdited}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>{t.common.cancel}</button>
          </div>
        </div>
      ) : (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {result.output.steps.map((s, i) => (
              <li key={i}>
                <span>{s[lang]}</span> <span className="font-mono text-xs text-muted">{f.duration(s.minutes)}</span>
                <span className="block text-xs text-muted">“{s.quote}”</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">{t.ai.total(f.duration(total(suggested)))}{a.estimateMinutes ? ` · ${t.ai.vsEstimate(f.duration(a.estimateMinutes))}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => save('accepted', suggested)}>{t.ai.accept}</button>
            <button type="button" className="btn" onClick={() => setEditing(suggested)}>{t.ai.edit}</button>
            <button type="button" className="btn" onClick={() => save('dismissed', [])}>{t.ai.dismiss}</button>
          </div>
        </>
      )}
    </section>
  );
}
