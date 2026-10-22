import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { DayTimeline } from '../components/DayTimeline';
import { Brief } from '../components/Brief';
import { Dot, Empty, External, Section, Tag, sourceTone } from '../components/ui';
import { Demo, Email, Workload } from '../lib/shared';
import { href } from '../lib/router';
import type { Assignment, Priority } from '../data/types';

export function emailHealth(email: unknown, now: Date) {
  try { return Email.health(email == null ? null : Email.normalize(email), now); } catch { return { state: 'failed' }; }
}

export function Today() {
  const { snapshot: d, progress, f, now, source, run, classify, waiting, verifyReason } = useApp();
  const { t } = useI18n();
  const today = f.dayKey(now);
  const tomorrow: string = Demo.addDays(today, 1);
  const proposalsOn = (day: string) => waiting.filter((p) => f.dayKey(p.start) === day).length;
  // Open on the first of today/tomorrow that has proposals waiting, so the approve-before-write idea is visible at once.
  const [shown, setShown] = useState(proposalsOn(today) || !proposalsOn(tomorrow) ? today : tomorrow);
  const mode: string = Workload.mode(progress.preferences?.workloadMode);
  const focus = Workload.focus(d.assignments, d.sources, now, mode);
  const byUrl = new Map(d.assignments.map((a) => [a.source, a]));
  const due72 = d.assignments.filter((a) => !a.archivedFromSource && a.requirement === 'required' && ['soon', 'overdue'].includes(classify(a)))
    .sort((a, b) => Date.parse(a.dueAt || '') - Date.parse(b.dueAt || ''));
  const failing = d.sources.filter((s) => s.status !== 'ok');
  const inbox = emailHealth(d.email, now);

  return (
    <div className="flex flex-wrap gap-8">
      <section aria-labelledby="day" className="min-w-0 flex-[1_1_360px] max-md:order-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="day" className="text-[28px] font-semibold leading-tight">{f.long(now)}</h1>
          <span className="font-mono text-xs text-muted">{t.today.calendarRead(f.ago(d.calendarCoverage?.checkedAt, now))}</span>
        </div>
        <p className="mb-3 mt-1 text-sm text-muted">{t.today.timelineHint}</p>
        <div role="group" aria-label={t.today.showDay} className="mb-3 inline-flex rounded-lg border border-line p-0.5">
          {([[today, t.today.todayTab], [tomorrow, t.today.tomorrowTab]] as const).map(([day, label]) => (
            <button key={day} type="button" aria-pressed={shown === day} onClick={() => setShown(day)}
              className={`min-h-8 rounded-md px-3 text-[13px] ${shown === day ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>
              {label}{proposalsOn(day) > 0 && <span className={`ml-1.5 font-mono text-[11px] ${shown === day ? 'text-on-ink/80' : 'text-accent'}`}>{proposalsOn(day)}</span>}
            </button>
          ))}
        </div>
        <DayTimeline date={shown} />
      </section>

      <div className="min-w-0 flex-[999_1_520px] space-y-8">
        <section aria-labelledby="brief" className="rounded-[14px] border border-accent-line bg-accent-soft p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="brief" className="text-sm font-semibold text-accent">{t.today.brief}</h2>
            <span className="text-xs text-muted">{t.today.briefNote}</span>
          </div>
          <Brief />
          {source.mode === 'local' && <div className="mt-3 flex flex-wrap gap-1.5">
            {d.priorities.map((p, i) => <External key={i} url={p.source} className="chip">{chipLabel(p, byUrl.get(p.source), i)}</External>)}
          </div>}
        </section>

        <Section title={t.today.priorities}>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {d.priorities.slice(0, 3).map((p, i) => {
              const a = byUrl.get(p.source);
              const k = a ? classify(a) : '';
              return (
                <article key={i} className="panel flex flex-col gap-1.5 p-4">
                  <span className={`font-mono text-xs ${k === 'overdue' || k === 'soon' ? 'text-danger' : 'text-muted'}`}>{a?.dueAt ? t.common.due(f.when(a.dueAt, now)) : t.today.priority(i + 1)}</span>
                  <h3 className="text-base font-semibold">{p.title}</h3>
                  {p.detail && <p className="text-[13px] text-muted">{p.detail}</p>}
                  <External url={p.source} className="mt-auto pt-1 text-[13px]">{a ? `${a.course} · ${t.common.source}` : t.common.source}</External>
                </article>
              );
            })}
          </div>
        </Section>

        <section aria-labelledby="mode">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 id="mode" className="text-lg font-semibold">{mode === 'reduced' ? t.today.urgent : t.today.due72}</h2>
            <div role="group" aria-label={t.today.mode} className="flex rounded-lg border border-line p-0.5">
              {(['standard', 'reduced'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => run(() => source.setWorkloadMode(m))}
                  className={`min-h-8 rounded-md px-3 text-[13px] ${mode === m ? 'bg-ink text-on-ink' : 'text-sub hover:bg-soft'}`}>{t.today[m]}</button>
              ))}
            </div>
            <span className="text-xs text-muted">{t.today.modeHint[mode as 'standard' | 'reduced']}</span>
          </div>
          {mode === 'reduced'
            ? <>
                <WorkList items={focus.urgent} empty={t.today.due72Empty} />
                {focus.upcoming.length > 0 && <><h3 className="mb-2 mt-5 text-sm font-semibold">{t.today.otherRequired}</h3><WorkList items={focus.upcoming} /></>}
                {focus.selectable.length > 0 && <><h3 className="mb-2 mt-5 text-sm font-semibold">{t.today.selectable}</h3><WorkList items={focus.selectable} /></>}
              </>
            : <WorkList items={due72} empty={t.today.due72Empty} />}
        </section>

        <Section title={t.today.verification}>
          {focus.verification.length
            ? <ul className="divide-y divide-line rounded-xl border border-line">
                {focus.verification.map((a: Assignment) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0"><a href={href('coursework', { tab: 'verify', open: a.id })} className="font-medium text-ink">{a.title}</a><div className="text-xs text-muted">{a.course} · {verifyReason(a)}</div></div>
                    <Tag tone="warn">{t.status.verify}</Tag>
                  </li>
                ))}
              </ul>
            : <Empty compact>{t.today.verificationEmpty}</Empty>}
        </Section>

        <Section title={t.today.sources} aside={<a href={href('health')}>{t.nav.health} →</a>}>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
            {d.sources.map((s) => (
              <div key={s.id} className="rounded-xl border border-line px-3.5 py-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Dot tone={sourceTone(s.status)} />{s.name}</div>
                <div className="mt-1 text-xs text-muted">{t.status[s.status as 'ok'] ?? s.status} · {f.ago(s.lastSuccess, now)}</div>
              </div>
            ))}
          </div>
          {failing.filter((s) => s.status !== 'partial').map((s) => <p key={s.id} className="mt-2.5 text-[13px] text-danger">{t.today.failedSource(s.name)}</p>)}
          {'shown' in inbox && <p className="mt-2.5 text-[13px] text-muted"><a href={href('email')} className="underline underline-offset-2">{t.today.inbox}</a>: {t.today.inboxLine(inbox.shown as number, inbox.unread as number)}</p>}
        </Section>
      </div>
    </div>
  );
}

function chipLabel(p: Priority, a: Assignment | undefined, i: number) {
  if (a) return `${a.course}`;
  try {
    const first = new URL(p.source || '').pathname.split('/').filter(Boolean)[0] || '';
    return /mail/i.test(first) ? 'Gmail' : first || `#${i + 1}`;
  } catch { return `#${i + 1}`; }
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
