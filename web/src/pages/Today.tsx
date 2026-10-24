import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { DayTimeline } from '../components/DayTimeline';
import { Brief } from '../components/Brief';
import { Dot, Empty, Tag, sourceTone, type Tone } from '../components/ui';
import { Core, Demo, Email, Phase3, Workload } from '../lib/shared';
import { href } from '../lib/router';
import { toHandle, triaged } from '../lib/triage';
import type { Assignment, Role } from '../data/types';

export function emailHealth(email: unknown, now: Date) {
  try { return Email.health(email == null ? null : Email.normalize(email), now); } catch { return { state: 'failed' }; }
}

export function Today() {
  const { snapshot: d, progress, f, now, source, run, classify, waiting, mark, isPast } = useApp();
  const { t } = useI18n();
  const today = f.dayKey(now);
  const tomorrow: string = Demo.addDays(today, 1);
  const proposalsOn = (day: string) => waiting.filter((p) => f.dayKey(p.start) === day).length;
  // Open on the first of today/tomorrow that has proposals waiting, so the approve-before-write idea is visible at once.
  const [shown, setShown] = useState(proposalsOn(today) || !proposalsOn(tomorrow) ? today : tomorrow);
  const mode: string = Workload.mode(progress.preferences?.workloadMode);
  // Work you marked done or not needed, and work more than a few days past due, stays in Coursework, not on Today.
  const focus = Workload.focus(d.assignments.filter((a) => !mark(a) && !isPast(a)), d.sources, now, mode);
  const due72 = d.assignments.filter((a) => !a.archivedFromSource && !isPast(a) && a.requirement === 'required' && ['soon', 'overdue'].includes(classify(a)))
    .sort((a, b) => Date.parse(a.dueAt || '') - Date.parse(b.dueAt || ''));
  const failing = Workload.health(d, now).sources as typeof d.sources;
  const inbox = emailHealth(d.email, now);
  const handleCount = toHandle(triaged(d.email?.messages || [], progress)).length;

  const openWork = d.assignments.filter((a) => !a.archivedFromSource && !mark(a) && !isPast(a) && !['submitted', 'graded', 'excused'].includes(a.status));
  const overdue = due72.filter((a) => classify(a) === 'overdue').length;
  const attention = failing.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="day" className="text-[28px] font-semibold leading-tight">{f.long(now)}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{t.today.calendarRead(f.ago(d.calendarCoverage?.checkedAt, now))}</p>
        </div>
        <a href={href('health')} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] no-underline ${attention ? 'border-danger-line bg-danger-soft text-danger' : 'border-ok-line bg-ok-soft text-ok'}`}>
          <Dot tone={attention ? 'danger' : 'ok'} />{attention ? t.today.sourcesAttention(attention) : t.today.sourcesOk(d.sources.length)}
        </a>
      </header>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Kpi href={href('coursework')} label={mode === 'reduced' ? t.today.urgent : t.today.due72} value={mode === 'reduced' ? focus.urgent.length : due72.length} tone={overdue ? 'danger' : due72.length ? 'warn' : 'ok'} note={overdue ? t.today.kpiOverdue(overdue) : t.today.kpiOpen(openWork.length)} />
        <Kpi href={href('coursework', { tab: 'verify' })} label={t.today.verification} value={focus.verification.length} tone={focus.verification.length ? 'warn' : 'ok'} note={t.today.kpiVerifyNote} />
        <Kpi href={href('review')} label={t.today.kpiProposals} value={waiting.length} tone={waiting.length ? 'info' : 'neutral'} note={t.today.kpiProposalsNote} />
        <Kpi href={href('email')} label={t.today.kpiEmail} value={handleCount} tone={handleCount ? 'info' : 'neutral'} note={'shown' in inbox ? t.today.kpiUnread(inbox.unread as number) : t.email.disabled} />
      </div>

      <div className="flex flex-wrap gap-6">
        <section aria-labelledby="day" className="panel min-w-0 flex-[1_1_340px] p-4 max-md:order-2">
          <div role="group" aria-label={t.today.showDay} className="mb-3 inline-flex rounded-lg border border-line p-0.5">
            {([[today, t.today.todayTab], [tomorrow, t.today.tomorrowTab]] as const).map(([day, label]) => (
              <button key={day} type="button" aria-pressed={shown === day} onClick={() => setShown(day)}
                className={`min-h-8 rounded-md px-3 text-[13px] ${shown === day ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>
                {label}{proposalsOn(day) > 0 && <span className={`ml-1.5 font-mono text-[11px] ${shown === day ? 'text-on-ink/80' : 'text-accent'}`}>{proposalsOn(day)}</span>}
              </button>
            ))}
          </div>
          <DayTimeline date={shown} scale={0.6} />
        </section>

        <div className="min-w-0 flex-[999_1_520px] space-y-6">
          <section aria-labelledby="brief" className="rounded-[14px] border border-accent-line bg-accent-soft px-5 py-4">
            <h2 id="brief" className="text-sm font-semibold text-accent">{t.today.brief}</h2>
            <Brief />
          </section>

          <section aria-labelledby="mode">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h2 id="mode" className="text-lg font-semibold">{t.today.nextUp}</h2>
              <div className="flex items-center gap-3">
                <div role="group" aria-label={t.today.mode} title={t.today.modeHint[mode as 'standard' | 'reduced']} className="flex rounded-lg border border-line p-0.5">
                  {(['standard', 'reduced'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => run(() => source.setWorkloadMode(m))}
                      className={`min-h-7 rounded-md px-2.5 text-xs ${mode === m ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>{t.today[m]}</button>
                  ))}
                </div>
                <a href={href('coursework')} className="text-xs">{t.today.viewAll} →</a>
              </div>
            </div>
            <WorkList items={(mode === 'reduced' ? [...focus.urgent, ...focus.upcoming] : due72).slice(0, 5)} empty={t.today.due72Empty} />
          </section>

          <WeekLoad work={openWork} />

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <CareerCard />
            <section aria-labelledby="src" className="panel p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 id="src" className="font-semibold">{t.today.sources}</h2>
                <a href={href('health')} className="text-xs">{t.nav.health} →</a>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label={t.today.sources}>
                {d.sources.map((s) => (
                  <li key={s.id} title={`${s.name} · ${t.status[s.status as 'ok'] ?? s.status} · ${f.ago(s.lastSuccess, now)}`}
                    className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-sub">
                    <Dot tone={sourceTone(s.status)} /><span className="max-w-32 truncate">{s.name}</span>
                  </li>
                ))}
              </ul>
              {failing.map((s) => <p key={s.id} className="mt-2 text-xs text-danger">{t.today.failedShort(s.name)}</p>)}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ href: to, label, value, note, tone }: { href: string; label: string; value: number; note: string; tone: Tone }) {
  const bar = { ok: 'bg-ok-dot', warn: 'bg-warn-dot', danger: 'bg-danger-dot', info: 'bg-accent', neutral: 'bg-neutral-dot' }[tone];
  return (
    <a href={to} className="panel group relative block overflow-hidden px-4 py-3.5 text-ink no-underline transition-colors hover:bg-soft">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="mt-0.5 block font-mono text-[32px] font-semibold leading-none tracking-tight">{value}</span>
      <span className={`mt-1.5 block text-xs ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}>{note}</span>
    </a>
  );
}

/** Open work due on each of the next seven days: one bar per day, height by count, estimated time in the tooltip. */
function WeekLoad({ work }: { work: Assignment[] }) {
  const { f, now } = useApp();
  const { t } = useI18n();
  const today = f.dayKey(now);
  const days = Array.from({ length: 7 }, (_, i) => Demo.addDays(today, i) as string).map((day) => {
    const items = work.filter((a) => a.dueAt && f.dayKey(a.dueAt) === day);
    return { day, items, minutes: items.reduce((m, a) => m + (a.estimateMinutes || 0), 0) };
  });
  const max = Math.max(1, ...days.map((x) => x.items.length));
  const total = days.reduce((n, x) => n + x.items.length, 0);
  const H = 96;
  return (
    <section aria-labelledby="load" className="panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="load" className="font-semibold">{t.today.load7}</h2>
        <span className="text-xs text-muted">{t.today.load7Total(total)}</span>
      </div>
      <ol className="grid grid-cols-7 gap-2" aria-label={t.today.load7}>
        {days.map(({ day, items, minutes }) => {
          const h = items.length ? Math.max(8, Math.round((items.length / max) * H)) : 2;
          const label = f.day(Core.zonedISO(day, '12:00'));
          const tip = `${label}: ${t.today.loadTip(items.length, minutes ? f.duration(minutes) : '')}${items.length ? '\n' + items.map((a) => `· ${a.course} ${a.title}`).join('\n') : ''}`;
          return (
            <li key={day} className="flex flex-col items-center gap-1" title={tip} aria-label={tip}>
              <span className="h-4 font-mono text-[11px] leading-4 text-sub">{items.length || ''}</span>
              <div className="flex w-full items-end justify-center" style={{ height: H }}>
                <div className={`w-full max-w-9 rounded-t ${items.length ? (day === today ? 'bg-accent' : 'bg-accent/55') : 'bg-line'}`} style={{ height: h }} />
              </div>
              <span className={`text-[11px] ${day === today ? 'font-semibold text-accent' : 'text-muted'}`}>{day === today ? t.today.todayTab : f.weekday(Core.zonedISO(day, '12:00'))}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Career on Home: the pipeline in numbers and the two roles you would look at first. */
function CareerCard() {
  const { snapshot: d, progress } = useApp();
  const { t } = useI18n();
  const c = d.career;
  const status = (x: { id: string }) => progress.career?.[x.id]?.status;
  const roles: Role[] = c?.enabled ? Phase3.feedbackOrder(c.roles || [], status) : [];
  const saved = [...(c?.roles || []), ...(c?.candidates || [])].filter((x) => status(x) === 'saved').length;
  return (
    <section aria-labelledby="career-home" className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="career-home" className="font-semibold">{t.nav.career}</h2>
        <a href={href('career')} className="text-xs">{t.today.viewAll} →</a>
      </div>
      {!c?.enabled
        ? <p className="text-sm text-muted">{t.career.disabled}</p>
        : <>
            <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
              {([[t.career.roles, c.roles?.length || 0], [t.career.people, c.candidates?.length || 0], [t.today.careerSaved, saved]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-soft px-2 py-1.5"><dd className="font-mono text-lg font-semibold leading-tight">{v}</dd><dt className="text-[11px] text-muted">{k}</dt></div>
              ))}
            </dl>
            <ul className="space-y-1.5">
              {roles.filter((r) => status(r) !== 'dismissed').slice(0, 2).map((r) => {
                const gaps: string[] = Phase3.eligibility(r, c.profile || {});
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{r.title}<span className="text-muted"> · {r.market}</span></span>
                    <Dot tone={gaps.length ? 'warn' : 'ok'} />
                  </li>
                );
              })}
            </ul>
          </>}
    </section>
  );
}

export function WorkList({ items, empty }: { items: Assignment[]; empty?: string }) {
  const { f, now, classify } = useApp();
  const { t } = useI18n();
  if (!items.length) return <Empty compact>{empty ?? t.common.none}</Empty>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {items.map((a) => {
        const k = classify(a);
        return (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <a href={href('coursework', { open: a.id })} className="font-medium text-ink">{a.title}</a>
              <div className="text-xs text-muted">{a.course}{a.estimateMinutes ? ` · ${t.common.est(f.duration(a.estimateMinutes))}` : ''}</div>
            </div>
            <div className="flex items-center gap-2">
              {a.requirement === 'choice' && <Tag tone="info">{t.status.optional}</Tag>}
              <Tag tone={k === 'overdue' ? 'danger' : k === 'soon' ? 'warn' : 'neutral'}>{k === 'overdue' ? t.status.overdue : f.when(a.dueAt, now)}</Tag>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
