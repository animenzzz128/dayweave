import { useEffect, useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { PlanTimeline } from '../components/PlanTimeline';
import { Empty, PageHeader, Section, Tag } from '../components/ui';
import { Core, Demo, Phase2, Planner } from '../lib/shared';
import { href } from '../lib/router';
import { CALENDAR_COLORS, COLOR_IDS } from '../lib/calendarColors';
import { ApproveButton } from './Review';
import { DeadlineRisks } from '../components/DeadlineRisks';
import { dayStartHour } from '../components/DayTimeline';
import type { Approval, Habit, PlanSettings, Proposal, Unscheduled } from '../data/types';

const MIN = 60000;
// Days the morning run and the "plan the next days" button cover (src/store.cjs PLAN_DAYS).
const PLAN_DAYS = 7;
// The demo's interview email has a prep pack on the Career page (a preview; the private instance has none yet).
const PREP_EMAIL = 'msg-recruiter';
const minutes = (p: { start: string; end: string }) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / MIN);
const iso = (ms: number) => new Date(ms).toISOString();
const isoDay = (k: string) => new Date(Date.parse(k + 'T12:00:00Z')).getUTCDay() || 7;

interface Held { id: string; title: string; start: string; end: string; why: 'edited' | 'approved'; outside?: boolean }
interface Summary { usable?: { minutes: number; budget: number; allocated: number }; unscheduled?: Unscheduled[]; gaps?: string[]; held?: Held[] }
// Summaries stored before items carried a group are sorted by their reason.
const groupOf = (u: Unscheduled) => u.group ?? (/^(Already covered|Spread over|Archived locally|Selectable|Today already has|Not planned: the day has ended)|falls before the/.test(u.reason) ? 'hidden' : /^(Review starts|Starts \d+ days)/.test(u.reason) ? 'later' : 'action');

/**
 * The daily planning page (preview → adjust → approve, after Morgen; weekly goals after Reclaim; the workload warning after
 * Sunsama). Every change is an ordinary proposal edit, and only the approved Q version can be written.
 */
export function Plan({ params }: { params: URLSearchParams }) {
  const { snapshot: d, f, now, source, run, progress, approvals, started, planSettings } = useApp();
  const { t } = useI18n();
  const today = f.dayKey(now);
  const days = Array.from({ length: 7 }, (_, i) => Demo.addDays(today, i) as string);
  const [date, setDate] = useState(params.get('date') || (d.proposals.some((p) => f.dayKey(p.start) === today && p.origin === 'planner') ? today : days[1]));
  const [busy, setBusy] = useState(false);
  const noon = (day: string) => Date.parse(Core.zonedISO(day, '12:00'));

  const onDay = d.proposals.filter((p) => f.dayKey(p.start) === date).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const dismissed = (p: Proposal) => !!progress.dismissed?.[p.id];
  const live = onDay.filter((p) => !dismissed(p));
  const removed = onDay.filter((p) => dismissed(p) && !started(p.id) && p.action !== 'delete');
  // A removal (action delete) names the written block it takes off the calendar; that block no longer holds time or counts.
  const sup = Phase2.superseded(d, progress.dismissed ?? {}) as Map<string, Proposal>;
  const counts = (p: Proposal) => p.action !== 'delete' && !sup.has(p.id);
  const blocks = live.filter((p) => p.action !== 'delete');
  const versionOf = (p: Proposal) => approvals.find((a) => a.value.some((x) => x.id === p.id) && a.fingerprints[p.id] === Phase2.fingerprint(p) && ['prepared', 'executed', 'pending', 'partial', 'unverified'].includes(a.status));
  const open = live.filter((p) => !started(p.id) && !versionOf(p)?.approval);
  // Request checks cover calendar events; two Dayweave blocks moved onto each other are caught here and kept out of the version.
  const overlaps = (p: Proposal, list: Proposal[]) => counts(p) && list.some((x) => x.id !== p.id && counts(x) && Date.parse(x.start) < Date.parse(p.end) && Date.parse(p.start) < Date.parse(x.end));
  const clash = (p: Proposal) => overlaps(p, live);
  const ok = open.filter((p) => !clash(p) && !Phase2.errors(p, d, now, []).length);
  const summary = (progress.plan as Record<string, Summary> | undefined)?.[date];
  const planned = live.filter(counts).reduce((n, p) => n + minutes(p), 0);
  const usable = summary?.usable?.minutes ?? 0;
  const startHour = dayStartHour(d, progress.dismissed, date, planSettings.dayStart);
  // The day version: an exact match for the open, passing blocks of this day, if one is already prepared.
  const fp = Object.fromEntries(ok.map((p) => [p.id, Phase2.fingerprint(p)]));
  const dayVersion = approvals.find((a) => a.status === 'prepared' && JSON.stringify(a.fingerprints) === JSON.stringify(fp))
    // Once everything is approved, the approved version stays here so it can be withdrawn until the write starts.
    || (!ok.length ? approvals.find((a) => a.status === 'prepared' && a.approval && a.value.some((x) => live.some((p) => p.id === x.id))) : undefined);

  // The whole week: every open, passing block of the next PLAN_DAYS days in one version.
  const week = new Set(days.slice(0, PLAN_DAYS));
  const weekLive = d.proposals.filter((p) => week.has(f.dayKey(p.start)) && !dismissed(p));
  const weekOk = weekLive.filter((p) => !started(p.id) && !versionOf(p)?.approval && !overlaps(p, weekLive) && !Phase2.errors(p, d, now, []).length);
  const weekFp = JSON.stringify(Object.fromEntries(weekOk.map((p) => [p.id, Phase2.fingerprint(p)])));
  const weekVersion = approvals.find((a) => a.status === 'prepared' && JSON.stringify(a.fingerprints) === weekFp);
  const multiDay = new Set(weekOk.map((p) => f.dayKey(p.start))).size > 1;

  const regenerate = async () => { setBusy(true); await run(() => source.generatePlan(date), t.plan.regenerated); setBusy(false); };
  // Today and the next PLAN_DAYS - 1 days, as the morning run does (src/store.cjs generatePlans).
  const regenerateDays = async () => { setBusy(true); await run(() => source.generatePlans(today, PLAN_DAYS), (r) => t.plan.regeneratedDays(r.filter((x) => x.ready).length, PLAN_DAYS)); setBusy(false); };
  const shift = (p: Proposal, start: number, end: number) => run(() => source.editProposal(p.id, { start: iso(start), end: iso(end) }), t.plan.moved);

  return (
    <>
      <PageHeader title={t.plan.title} subtitle={t.plan.subtitle} />
      <div className="mb-5"><DeadlineRisks /></div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label={t.plan.title}>
        {days.map((day) => (
          <button key={day} type="button" role="tab" aria-selected={day === date} onClick={() => setDate(day)}
            className={`rounded-lg px-3 py-1.5 text-sm ${day === date ? 'bg-ink font-medium text-surface' : 'border border-line hover:bg-soft'}`}>{f.day(iso(noon(day)))}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-8">
        <div className="min-w-0 flex-[1_1_340px]">
          <PlanTimeline date={date} startHour={startHour} onChange={shift} />
        </div>
        <div className="min-w-0 flex-[999_1_480px] space-y-6">
          <section className="panel p-4" aria-label={t.plan.load(planned, usable)}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{summary ? t.plan.load(planned, usable) : t.plan.noSummary}</p>
                {summary && <p className={`text-xs ${usable && planned > usable * 0.8 ? 'text-warn' : 'text-muted'}`}>{usable && planned > usable * 0.8 ? t.plan.overload : t.plan.reserve}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={regenerateDays}>{busy ? t.plan.regenerating : t.plan.regenerateDays(PLAN_DAYS)}</button>
                <button type="button" className="btn" disabled={busy} onClick={regenerate}>{t.plan.regenerate}</button>
              </div>
            </div>
            {summary?.usable && usable > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft" aria-hidden="true"><div className={`h-full ${planned > usable * 0.8 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${Math.min(100, Math.round((planned / usable) * 100))}%` }} /></div>}
            {!!summary?.gaps?.length && <ul className="mt-2 list-disc pl-5 text-sm text-danger">{summary.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>}
            {!!summary?.held?.length && (
              <div className="mt-2 text-xs">
                <p className={summary.held.some((h) => h.outside) ? 'text-warn' : 'text-muted'}>{t.plan.held(summary.held.length)}</p>
                <ul className="mt-1 list-disc pl-5 text-muted">{summary.held.map((h) => <li key={h.id}>{f.hm(h.start)}–{f.hm(h.end)} {h.title} · {t.plan.heldWhy[h.why]}{h.outside && <span className="text-warn"> · {t.plan.heldOutside}</span>}</li>)}</ul>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{t.plan.autoNote}</p>
            <ColorLegend />
          </section>

          {params.get('calendar') && <p role="status" className={`rounded-lg p-3 text-sm ${params.get('calendar') === 'connected' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{params.get('calendar') === 'connected' ? t.review.calendarConnected : t.review.calendarDenied}</p>}
          <ApproveDay ok={ok} failing={open.length - ok.length} version={dayVersion} />
          {multiDay && (
            <section className="rounded-[14px] border border-line p-4">
              {weekVersion ? <ApproveButton approval={weekVersion} /> : <button type="button" className="btn w-full" onClick={() => run(() => source.prepare(weekOk.map((p) => p.id)))}>{t.plan.approveWeek(...split(weekOk))}</button>}
              <p className="mt-1.5 text-xs text-muted">{t.plan.approveWeekNote}</p>
            </section>
          )}

          <Section title={t.plan.blocks}>
            {blocks.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {blocks.map((p) => {
                  const r = sup.get(p.id);
                  return <BlockRow key={p.id + p.start + p.end} p={p} version={versionOf(p)} removal={r && { id: r.id, done: started(r.id), problem: started(r.id) ? undefined : Phase2.errors(r, d, now, [])[0] }}
                    problem={clash(p) ? t.plan.overlaps : Phase2.errors(p, d, now, [])[0]} />;
                })}
              </ul>
            ) : <Empty compact>{t.plan.none}</Empty>}
            {removed.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {removed.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span className="line-through">{f.hm(p.start)}–{f.hm(p.end)} {p.title}</span><button type="button" className="btn py-0.5 text-xs" onClick={() => run(() => source.saveProgress('dismissed', p.id, null))}>{t.plan.restore}</button></li>)}
              </ul>
            )}
          </Section>

          <Unplanned items={summary?.unscheduled ?? []} />

          <Goals date={date} />
          <Rules />
        </div>
      </div>
    </>
  );
}

/** What the last generation left out: what needs the owner first, what starts later folded away, the rest not shown. */
function Unplanned({ items }: { items: Unscheduled[] }) {
  const { f } = useApp();
  const { t } = useI18n();
  const action = items.filter((u) => groupOf(u) === 'action');
  const later = items.filter((u) => groupOf(u) === 'later').sort((a, b) => (a.startsOn ?? '').localeCompare(b.startsOn ?? ''));
  if (!action.length && !later.length) return null;
  return (
    <Section title={t.plan.unfit} aside={t.plan.unfitNote}>
      {action.length > 0 && (
        <>
          <h4 className="text-sm font-semibold">{t.plan.needsYou}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{action.map((u, i) => <li key={i}><span className="text-ink">{u.title}</span>: {u.reason}</li>)}</ul>
        </>
      )}
      {later.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t.plan.laterGroup(later.length)}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{later.map((u, i) => <li key={i}><span className="text-ink">{u.title}</span>{u.startsOn ? ` · ${t.plan.startsOn(f.day(Core.zonedISO(u.startsOn, '12:00')))}` : `: ${u.reason}`}</li>)}</ul>
        </details>
      )}
    </Section>
  );
}

/** What each colour on the calendar means; weekly goals use their own colour, set under planning rules. */
function ColorLegend() {
  const { t } = useI18n();
  const kinds = Planner.COLORS as Record<string, string>;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label={t.plan.colorLegend}>
      {(['coursework', 'review', 'interview', 'todo'] as const).map((k) => <li key={k} className="flex items-center gap-1"><span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: CALENDAR_COLORS[kinds[k]] }} />{t.plan.colorKinds[k]}</li>)}
      <li>{t.plan.colorKinds.habit}</li>
    </ul>
  );
}

function ApproveDay({ ok, failing, version }: { ok: Proposal[]; failing: number; version?: Approval }) {
  const { source, run } = useApp();
  const { t } = useI18n();
  if (!ok.length && !failing && !version) return null;
  return (
    <section className="rounded-[14px] border border-accent-line bg-accent-soft p-4">
      {ok.length || version ? (version ? <ApproveButton approval={version} /> : (
        <>
          <button type="button" className="btn btn-primary w-full" onClick={() => run(() => source.prepare(ok.map((p) => p.id)))}>{t.plan.approveDay(...split(ok))}</button>
          <p className="mt-1.5 text-xs text-muted">{t.plan.approveDayNote}</p>
        </>
      )) : <p className="text-sm">{t.plan.nothingToApprove}</p>}
      {failing > 0 && <p className="mt-2 text-xs text-warn">{t.plan.blockedDay(failing)} <a href={href('review')}>→</a></p>}
    </section>
  );
}

// New blocks and removals in a version, for the approve buttons ("N new, M removed").
const split = (list: Proposal[]) => [list.filter((p) => p.action !== 'delete').length, list.filter((p) => p.action === 'delete').length] as const;

function BlockRow({ p, version, problem, removal }: { p: Proposal; version?: Approval; problem?: string; removal?: { id: string; done: boolean; problem?: string } }) {
  const { source, run, started, f } = useApp();
  const { t } = useI18n();
  const s = Date.parse(p.start), e = Date.parse(p.end), q = 15 * MIN;
  const done = started(p.id), approved = !!version?.approval;
  const edit = (start: number, end: number) => run(() => source.editProposal(p.id, { start: iso(start), end: iso(end) }), t.plan.moved);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          {p.color && <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full align-baseline" style={{ background: CALENDAR_COLORS[p.color] }} />}
          <span className="font-mono text-xs text-muted">{f.hm(p.start)}–{f.hm(p.end)}</span> <span className="font-medium">{p.title}</span>
          {p.reason && <span className="block text-xs text-muted">{p.reason}</span>}
          {source.mode === 'demo' && p.sourceRefs?.some((r) => r.kind === 'email' && r.id === PREP_EMAIL) && <a className="text-xs" href={href('career', { tab: 'pipeline', id: 'prep' })}>{t.career.prepLink} →</a>}
          {problem && !done && <span className="block text-xs text-danger">{problem}</span>}
          {removal && !removal.done && (
            <span className="block text-xs text-warn">{removal.problem ? t.plan.removalKept(removal.problem) : t.plan.removalNote}{' '}
              <button type="button" className="btn ml-1 py-0 text-xs" onClick={() => run(() => source.saveProgress('dismissed', removal.id, true))}>{t.plan.keepWritten}</button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {p.locked && !done && <Tag tone="neutral">{t.plan.locked}</Tag>}
          {removal ? <Tag tone={removal.done ? 'neutral' : 'warn'}>{removal.done ? t.plan.removedFromCalendar : t.plan.toRemove}</Tag>
            : <Tag tone={done ? 'ok' : approved ? 'info' : 'neutral'}>{done ? t.plan.written : approved ? t.plan.approved : t.plan.draft}</Tag>}
        </div>
      </div>
      {!done && !approved && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <button type="button" className="btn py-0.5 text-xs" onClick={() => edit(s - q, e - q)}>{t.plan.earlier}</button>
          <button type="button" className="btn py-0.5 text-xs" onClick={() => edit(s + q, e + q)}>{t.plan.later}</button>
          {e - s > q && <button type="button" className="btn py-0.5 text-xs" onClick={() => edit(s, e - q)}>{t.plan.shorter}</button>}
          <button type="button" className="btn py-0.5 text-xs" onClick={() => edit(s, e + q)}>{t.plan.longer}</button>
          {p.locked && <button type="button" className="btn py-0.5 text-xs" onClick={() => run(() => source.editProposal(p.id, { locked: false }))}>{t.plan.unlock}</button>}
          <button type="button" className="btn btn-danger py-0.5 text-xs" onClick={() => run(() => source.saveProgress('dismissed', p.id, true))}>{t.plan.remove}</button>
          <a className="btn py-0.5 text-xs no-underline" href={href('review', { id: p.id })}>…</a>
        </div>
      )}
    </li>
  );
}

/** This Monday–Sunday week's sessions per goal, counted from Dayweave blocks the same way the planner counts them. */
function Goals({ date }: { date: string }) {
  const { snapshot: d, f, progress, planSettings } = useApp();
  const { t } = useI18n();
  const monday = Demo.addDays(date, 1 - isoDay(date)) as string;
  const week = new Set(Array.from({ length: 7 }, (_, i) => Demo.addDays(monday, i) as string));
  const goals = planSettings.habits.filter((h) => h.enabled);
  if (!goals.length) return null;
  const count = (h: Habit) => d.proposals.filter((p) => !progress.dismissed?.[p.id] && p.sourceRefs?.some((r) => r.kind === 'habit' && r.id === h.id) && week.has(f.dayKey(p.start))).length;
  return (
    <Section title={t.plan.goals}>
      <ul className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {goals.map((h) => {
          const n = count(h);
          return (
            <li key={h.id} className="panel p-3">
              <p className="text-sm font-medium"><span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: CALENDAR_COLORS[Planner.habitColor(h) as string] }} />{h.title}</p>
              <p className="text-xs text-muted">{t.plan.goalProgress(n, h.perWeek)} · {h.minutes} min</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden="true"><div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.round((n / h.perWeek) * 100))}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Why the server would refuse these rules (planner.planSettings, shared with it), or null when they can be saved. */
function refusal(v: PlanSettings): string | null {
  try { Planner.planSettings(v); return null; } catch (e) { return (e as Error).message; }
}

function Rules() {
  const { source, run, planSettings, planSettingsSaved, f, now } = useApp();
  const { t } = useI18n();
  const [v, setV] = useState<PlanSettings>(() => JSON.parse(JSON.stringify(planSettings)));
  const [saving, setSaving] = useState(false);
  const saved = JSON.stringify(planSettings);
  // The form follows the saved rules whenever they change (after a save, or a reload with rules saved elsewhere).
  useEffect(() => { setV(JSON.parse(saved)); }, [saved]);
  const dirty = JSON.stringify(v) !== saved;
  const problem = refusal(v);
  const hm = (x: string) => (x === '24:00' ? 1440 : Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
  // The goal problems the page explains in place, in the page's language; other refusals show the planner's own words.
  const tooMany = (h: Habit) => h.perWeek > h.days.length * (h.perDay ?? 1);
  const noWindow = (h: Habit) => h.windows.every((w) => Math.min(hm(w.end), hm(v.dayEnd)) - Math.max(hm(w.start), hm(v.dayStart)) < h.minutes);
  const explained = v.habits.some((h) => tooMany(h) || noWindow(h));
  // Saving applies at once: the next PLAN_DAYS days are planned again with the new rules (a refused save changes nothing).
  const save = async () => {
    setSaving(true);
    await run(async () => { await source.savePlanSettings(v); return source.generatePlans(f.dayKey(now), PLAN_DAYS); }, (r) => t.plan.savedAndPlanned(r.filter((x) => x.ready).length, PLAN_DAYS));
    setSaving(false);
  };
  const set = (patch: Partial<PlanSettings>) => setV({ ...v, ...patch });
  const goal = (i: number, patch: Partial<Habit>) => set({ habits: v.habits.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const time = (value: string, on: (x: string) => void, label: string, end = false) => (
    <input aria-label={label} type="time" step={300} className="field w-28 py-1" value={value === '24:00' ? '00:00' : value} onChange={(e) => on(end && e.target.value === '00:00' ? '24:00' : e.target.value)} />
  );
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer font-semibold">{t.plan.settings} {!planSettingsSaved && <Tag tone="info">{t.plan.recommended}</Tag>} {dirty && <Tag tone="warn">{t.plan.unsaved}</Tag>}</summary>
      <p className="mt-1 text-xs text-muted">{t.plan.settingsNote}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">{t.plan.maxDailyWork}<input type="number" min={60} max={720} step={15} className="field w-24 py-1" value={v.maxDailyWork ?? ''} onChange={(e) => set({ maxDailyWork: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2">{t.plan.dayStart} {time(v.dayStart, (x) => set({ dayStart: x }), t.plan.dayStart)}</label>
        <label className="flex items-center gap-2">{t.plan.dayEnd} {time(v.dayEnd, (x) => set({ dayEnd: x }), t.plan.dayEnd, true)}</label>
      </div>
      <h4 className="mt-4 text-sm font-semibold">{t.plan.breaks}</h4>
      <ul className="mt-1 space-y-1.5">
        {v.breaks.map((b, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
            {time(b.start, (x) => set({ breaks: v.breaks.map((y, j) => (j === i ? { ...y, start: x } : y)) }), t.plan.breaks)}–{time(b.end, (x) => set({ breaks: v.breaks.map((y, j) => (j === i ? { ...y, end: x } : y)) }), t.plan.breaks, true)}
            <button type="button" className="btn btn-danger py-0.5 text-xs" onClick={() => set({ breaks: v.breaks.filter((_, j) => j !== i) })}>{t.plan.delete}</button>
          </li>
        ))}
      </ul>
      {v.breaks.length < 6 && <button type="button" className="btn mt-2 py-0.5 text-xs" onClick={() => set({ breaks: [...v.breaks, { start: '15:00', end: '15:30' }] })}>{t.plan.addBreak}</button>}
      <h4 className="mt-4 text-sm font-semibold">{t.plan.goals}</h4>
      <ul className="mt-1 space-y-3">
        {v.habits.map((h, i) => (
          <li key={i} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t.plan.goalTitle} className="field w-48 py-1" value={h.title} onChange={(e) => goal(i, { title: e.target.value })} />
              <label className="flex items-center gap-1">{t.plan.minutes}<input type="number" min={15} max={240} step={5} className="field w-20 py-1" value={h.minutes} onChange={(e) => goal(i, { minutes: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-1">{t.plan.perWeek}<input type="number" min={1} max={14} className="field w-16 py-1" value={h.perWeek} onChange={(e) => goal(i, { perWeek: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-1">{t.plan.perDay}<input type="number" min={1} max={3} className="field w-14 py-1" value={h.perDay ?? 1} onChange={(e) => goal(i, { perDay: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={h.enabled} onChange={(e) => goal(i, { enabled: e.target.checked })} />{t.plan.on}</label>
              <label className="flex items-center gap-1">
                <span aria-hidden="true" className="inline-block size-3 rounded-full" style={{ background: CALENDAR_COLORS[Planner.habitColor(h) as string] }} />
                <select aria-label={t.plan.goalColor} className="field py-1" value={Planner.habitColor(h) as string} onChange={(e) => goal(i, { color: e.target.value })}>
                  {COLOR_IDS.map((c, k) => <option key={c} value={c}>{t.plan.colorNames[k]}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-danger ml-auto py-0.5 text-xs" onClick={() => set({ habits: v.habits.filter((_, j) => j !== i) })}>{t.plan.delete}</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t.plan.days}>
              {t.plan.weekdays.map((w, k) => (
                <label key={w} className={`cursor-pointer rounded-md border px-2 py-0.5 text-xs ${h.days.includes(k + 1) ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <input type="checkbox" className="sr-only" checked={h.days.includes(k + 1)} onChange={(e) => goal(i, { days: e.target.checked ? [...h.days, k + 1].sort() : h.days.filter((x) => x !== k + 1) })} />{w}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {h.windows.map((w, k) => (
                <span key={k} className="flex items-center gap-1">
                  {time(w.start, (x) => goal(i, { windows: h.windows.map((y, j) => (j === k ? { ...y, start: x } : y)) }), t.plan.windows)}–{time(w.end, (x) => goal(i, { windows: h.windows.map((y, j) => (j === k ? { ...y, end: x } : y)) }), t.plan.windows, true)}
                  {h.windows.length > 1 && <button type="button" aria-label={t.plan.delete} className="btn px-1.5 py-0 text-xs" onClick={() => goal(i, { windows: h.windows.filter((_, j) => j !== k) })}>×</button>}
                </span>
              ))}
              {h.windows.length < 3 && <button type="button" className="btn py-0.5 text-xs" onClick={() => goal(i, { windows: [...h.windows, { start: '19:00', end: '21:00' }] })}>{t.plan.addWindow}</button>}
            </div>
            {noWindow(h) && <p className="mt-1.5 text-xs text-danger">{t.plan.noWindow(h.minutes, v.dayStart, v.dayEnd)}</p>}
            {tooMany(h) && <p className="mt-1.5 text-xs text-danger">{t.plan.tooMany(h.perWeek, h.days.map((x) => t.plan.weekdays[x - 1]), h.perDay ?? 1)}</p>}
            {h.windows.some((w) => w.start < v.dayStart || (v.dayEnd !== '24:00' && (w.end === '24:00' || w.end > v.dayEnd))) && <p className="mt-1.5 text-xs text-warn">{t.plan.outsideDay}</p>}
          </li>
        ))}
      </ul>
      {v.habits.length < 12 && <button type="button" className="btn mt-2 py-0.5 text-xs" onClick={() => set({ habits: [...v.habits, { id: 'goal-' + Date.now().toString(36), title: '', minutes: 60, perWeek: 2, days: [1, 2, 3, 4, 5], windows: [{ start: '19:00', end: '21:00' }], enabled: true, perDay: 1 }] })}>{t.plan.addGoal}</button>}
      <div className="mt-4 space-y-1.5">
        {problem && <p role="alert" className="text-sm text-danger">{t.plan.cannotSave} {explained ? t.plan.fixMarked : problem}</p>}
        {dirty && !problem && <p className="text-xs text-warn">{t.plan.unsavedNote}</p>}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary" disabled={!!problem || saving || (!dirty && planSettingsSaved)} onClick={save}>{saving ? t.plan.regenerating : t.plan.saveAndPlan(PLAN_DAYS)}</button>
          {dirty && <button type="button" className="btn" disabled={saving} onClick={() => setV(JSON.parse(saved))}>{t.plan.discard}</button>}
        </div>
      </div>
    </details>
  );
}
