import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, PageHeader, Tabs, Tag } from '../components/ui';
import { Core, Phase2 } from '../lib/shared';
import { href } from '../lib/router';
import { OneLine } from '../components/OneLine';
import type { Approval, Proposal } from '../data/types';

type Tab = 'waiting' | 'done';

export function Review({ params }: { params: URLSearchParams }) {
  const { snapshot: d, waiting, approvals, progress, started } = useApp();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('waiting');
  const [selected, setSelected] = useState(params.get('id') || '');
  const current = waiting.find((p) => p.id === selected) || waiting[0];
  const skipped = d.proposals.filter((p) => progress.dismissed?.[p.id] && !started(p.id));

  return (
    <>
      <PageHeader title={t.review.title} subtitle={t.review.subtitle} />
      <OneLine onAdded={(id) => { setTab('waiting'); setSelected(id); }} />
      <Tabs label={t.review.title} value={tab} onChange={setTab} items={[['waiting', t.review.waiting, waiting.length], ['done', t.review.done, approvals.length + skipped.length]]} />
      {tab === 'waiting' ? (
        waiting.length ? (
          <div className="flex flex-wrap gap-6">
            <ul className="min-w-0 flex-[1_1_260px] space-y-2" aria-label={t.review.waiting}>
              {waiting.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-current={p.id === current?.id} onClick={() => setSelected(p.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${p.id === current?.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-soft'}`}>
                    <span className="flex items-start justify-between gap-2 font-medium"><span>{titleOf(p, lang)}</span>{p.origin === 'ai' && <Tag tone="info">{t.ai.aiTag}</Tag>}</span>
                    <WhenLine p={p} />
                  </button>
                </li>
              ))}
            </ul>
            {current && <Detail key={current.id + current.start + current.end + current.title} p={current} />}
          </div>
        ) : <Empty action={<a href={href('week')} className="btn no-underline">{t.review.emptyAction} →</a>}>{t.review.empty}</Empty>
      ) : <History approvals={approvals} skipped={skipped} />}
    </>
  );
}

function WhenLine({ p }: { p: Proposal }) {
  const { f } = useApp();
  return <span className="block font-mono text-xs text-muted">{f.day(p.start)} · {f.hm(p.start)}–{f.hm(p.end)}</span>;
}

function Detail({ p }: { p: Proposal }) {
  const { snapshot: d, approvals, source, run, now, f, workStatus } = useApp();
  const { t, lang } = useI18n();
  const errors: string[] = Phase2.errors(p, d, now, []);
  const fingerprint: string = Phase2.fingerprint(p);
  const ready = approvals.find((a) => a.status === 'prepared' && a.fingerprints[p.id] === fingerprint);
  const related = d.assignments.filter((a) => (a.source && a.source === p.source) || p.sourceRefs?.some((r) => r.id === a.id));
  const day = f.dayKey(p.start);
  // The day as it would look with this block in it: calendar events plus the proposal, in time order.
  const sameDay = [...d.events.filter((e) => e.busy !== false && f.dayKey(e.start) === day).map((e) => ({ ...e, mine: false })), { ...p, mine: true }]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const [title, setTitle] = useState(p.title);
  const [start, setStart] = useState(f.hm(p.start));
  const [end, setEnd] = useState(f.hm(p.end));
  const dirty = title !== p.title || start !== f.hm(p.start) || end !== f.hm(p.end);

  const saveEdit = () => {
    Core.configure(d.timezone);
    return run(() => source.editProposal(p.id, { title, start: Core.zonedISO(day, start), end: end === '00:00' ? Core.zonedISO(nextDay(day), '00:00') : Core.zonedISO(day, end) }));
  };

  return (
    <article className="min-w-0 flex-[999_1_560px]" aria-labelledby="proposal-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-mono text-xs text-muted">{ready ? t.review.version(ready.reference) : p.id}</span>
          <h2 id="proposal-title" className="mt-1 text-2xl font-semibold leading-tight">{f.day(p.start)} {f.hm(p.start)}–{f.hm(p.end)} · {titleOf(p, lang)}</h2>
        </div>
        <Tag tone={errors.length ? 'danger' : 'ok'}>{errors.length ? t.review.checksFailed(errors.length) : t.review.checksPassed(t.review.checkList.length)}</Tag>
      </div>

      <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        <section className="panel p-4" aria-labelledby="src">
          <h3 id="src" className="text-sm font-semibold">1 · {t.review.sourceSays}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {related.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.course} · {a.title}</span>
                <span className="block text-muted">{a.dueAt ? t.common.due(f.when(a.dueAt, now)) : t.common.noDue} · {a.requirement === 'choice' ? t.status.optional : t.status.required} · {workStatus(a.status)}</span>
                <External url={a.source} className="text-[13px]">{t.common.source}</External>
              </li>
            ))}
            {!related.length && <li className="text-muted"><External url={p.source}>{t.common.source}</External></li>}
          </ul>
          <h4 className="mt-4 text-xs font-semibold text-muted">{t.review.calendarThatDay}</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {sameDay.map((e) => (
              <li key={e.id} className={e.mine ? '-mx-1.5 rounded-md border border-dashed border-accent bg-accent-soft px-1.5 text-accent-ink' : ''}>
                <span className="font-mono text-xs text-muted">{f.hm(e.start)}–{f.hm(e.end)}</span> {e.title}
              </li>
            ))}
            {sameDay.length === 1 && <li className="text-muted">{t.review.noEventsThatDay}</li>}
          </ul>
          <p className="mt-2 text-xs text-muted">{t.common.checkedAt(f.ago(d.calendarCoverage?.checkedAt, now))}</p>
        </section>

        <section className="rounded-[14px] border border-accent-line bg-accent-soft p-4" aria-labelledby="ai">
          <h3 id="ai" className="text-sm font-semibold text-accent">2 · {t.review.aiSuggests}</h3>
          {p.aiSentence && <p className="mt-2 text-sm">{t.ai.fromSentence(p.aiSentence)}</p>}
          <p className="mt-2 text-sm">{p.origin === 'ai' ? t.ai.aiReason : p.reason || '—'}</p>
          <h4 className="mt-4 text-xs font-semibold text-muted">{t.review.checks}</h4>
          {errors.length
            ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-danger">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            : <ul className="mt-1 space-y-0.5 text-sm">{t.review.checkList.map((c) => <li key={c}><span aria-hidden="true" className="text-ok">✓ </span>{c}</li>)}</ul>}
        </section>

        <section className="panel p-4" aria-labelledby="you">
          <h3 id="you" className="text-sm font-semibold">3 · {t.review.youDecide}</h3>
          <div className="mt-2 space-y-2.5">
            <div><label className="label" htmlFor="p-title">{t.review.titleLabel}</label><input id="p-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="flex gap-2">
              <div className="flex-1"><label className="label" htmlFor="p-start">{t.review.start}</label><input id="p-start" type="time" step={300} className="field" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="flex-1"><label className="label" htmlFor="p-end">{t.review.end}</label><input id="p-end" type="time" step={300} className="field" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            {dirty
              ? <button type="button" className="btn w-full" onClick={saveEdit}>{t.review.saveEdit}</button>
              : ready
                ? <ApproveButton approval={ready} />
                : <button type="button" className="btn btn-primary w-full" disabled={errors.length > 0} onClick={() => run(() => source.prepare([p.id]))}>{t.review.prepare}</button>}
            <button type="button" className="btn w-full" onClick={() => run(() => source.saveProgress('dismissed', p.id, true))}>{t.review.skip}</button>
            <p className="text-xs text-muted">{t.review.editNote}</p>
          </div>
        </section>
      </div>
    </article>
  );
}

export function ApproveButton({ approval }: { approval: Approval }) {
  const { source, run } = useApp();
  const { t } = useI18n();
  if (source.simulateApproval) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ok">{t.review.prepared(approval.reference)}</p>
        <button type="button" className="btn btn-primary w-full" onClick={() => run(() => source.simulateApproval!(approval), t.demo.simulated)}>{t.review.approve(approval.reference)}</button>
        <p className="text-xs text-muted">{t.review.approveDemoNote}</p>
      </div>
    );
  }
  if (approval.approval) {
    return (
      <div className="space-y-1.5 rounded-lg bg-ok-soft p-3">
        <p className="text-sm font-medium text-ok">{t.review.approvedWaiting(approval.reference)}</p>
        <p className="text-xs text-muted">{t.review.approvedNote}</p>
        <button type="button" className="btn w-full" onClick={() => run(() => source.withdraw!(approval.reference))}>{t.review.withdraw}</button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ok">{t.review.prepared(approval.reference)}</p>
      <button type="button" className="btn btn-primary w-full" onClick={() => run(() => source.approve!(approval.reference))}>{t.review.approve(approval.reference)}</button>
      <p className="text-xs text-muted">{t.review.approveServerNote}</p>
    </div>
  );
}

function History({ approvals, skipped }: { approvals: Approval[]; skipped: Proposal[] }) {
  const { source, run, f } = useApp();
  const { t } = useI18n();
  const label: Record<string, [string, 'ok' | 'warn' | 'info' | 'neutral']> = {
    executed: [t.review.executed, 'ok'], invalidated: [t.review.invalidated, 'warn'], prepared: [t.review.preparedState, 'info'],
    pending: [t.review.pendingState, 'info'], partial: [t.review.partialState, 'warn'], unverified: [t.review.unverifiedState, 'warn'], failed: [t.review.failedState, 'warn'],
  };
  if (!approvals.length && !skipped.length) return <Empty>{t.review.noHistory}</Empty>;
  return (
    <div className="space-y-6">
      {approvals.length > 0 && (
        <section aria-label={t.review.history}>
          <h2 className="mb-2 text-lg font-semibold">{t.review.history}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {approvals.map((a) => {
              const [text, tone] = a.status === 'prepared' && a.approval ? [t.review.approvedState, 'info' as const] : label[a.status] || [a.status, 'neutral'];
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><span className="font-mono text-xs text-muted">{a.reference}</span> {a.value.map((p) => p.title).join(', ')}<span className="block text-xs text-muted">{a.value.map((p) => `${f.day(p.start)} ${f.hm(p.start)}–${f.hm(p.end)}`).join(' · ')}</span></div>
                  <div className="flex items-center gap-2">{a.status === 'executed' && source.mode === 'demo' && <span className="text-xs text-muted">{t.demo.simulated}</span>}<Tag tone={tone}>{text}</Tag></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {skipped.length > 0 && (
        <section aria-label={t.review.skipped}>
          <h2 className="mb-2 text-lg font-semibold">{t.review.skipped}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {skipped.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div><a href={href('review', { id: p.id })} className="text-ink">{p.title}</a><span className="block font-mono text-xs text-muted">{f.day(p.start)} {f.hm(p.start)}–{f.hm(p.end)}</span></div>
                <button type="button" className="btn" onClick={() => run(() => source.saveProgress('dismissed', p.id, null))}>{t.review.unskip}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// AI proposals carry a Chinese title until someone edits the title.
const titleOf = (p: Proposal, lang: string) => (lang === 'zh' && p.titleZh ? p.titleZh : p.title);
const nextDay = (day: string) => new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
