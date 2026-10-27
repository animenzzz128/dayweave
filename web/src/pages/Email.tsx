import { useState, type ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href } from '../lib/router';
import { Empty, External, PageHeader, Section, Tag } from '../components/ui';
import type { Tone } from '../components/ui';
import { TodoForm } from './Coursework';
import { emailHealth } from './Today';
import type { EmailMessage, TriageCategory } from '../data/types';
import { CATEGORIES, toHandle, triaged, type Triaged } from '../lib/triage';

const CATEGORY_TONE: Record<TriageCategory, Tone> = { interview: 'danger', reply: 'danger', action: 'warn', info: 'info', promo: 'neutral' };

export function EmailPage() {
  const { snapshot: d, now, f, progress } = useApp();
  const { t } = useI18n();
  const h = emailHealth(d.email, now) as { state: string; stale?: boolean; shown?: number; unread?: number };
  const e = d.email as { request?: { windowDays?: number; limit?: number }; messages?: EmailMessage[]; checkedAt?: string } | null | undefined;
  const adopted = new Set(Object.values(progress.todo || {}).map((x) => x.origin?.messageId).filter(Boolean));
  const stateTag = { complete: ['ok', t.email.complete], partial: ['warn', t.email.partial], failed: ['danger', t.email.failed], disabled: ['neutral', t.email.disabled], unknown: ['warn', t.email.unknown] } as const;
  const [tone, text] = stateTag[h.state as keyof typeof stateTag] || stateTag.unknown;
  const messages = [...(e?.messages || [])].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  const list = triaged(messages, progress);
  const open = list.filter((x) => !x.handled);
  const handle = toHandle(list);
  const group = (c: TriageCategory | null) => open.filter((x) => x.category === c);
  const item = (x: Triaged) => <Message key={x.m.id} x={x} adopted={adopted.has(x.m.id)} />;

  return (
    <>
      <PageHeader title={t.email.title} subtitle={t.email.subtitle} />
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Tag tone={tone}>{text}</Tag>
        {h.stale && <Tag tone="warn">{t.status.stale}</Tag>}
        {e?.request && <span className="text-muted">{t.email.window(e.request.windowDays || 7, e.request.limit || 50)} · {t.common.checkedAt(f.ago(e.checkedAt, now))}</span>}
      </div>
      {!messages.length && <Empty>{h.state === 'unknown' ? t.email.unknown : t.email.empty}</Empty>}
      {!!messages.length && (
        <div className="space-y-7">
          <Section title={t.email.handle} aside={t.email.aiNote}>
            {handle.length ? <ul className="space-y-3">{handle.map(item)}</ul> : <Empty compact>{t.email.handleEmpty}</Empty>}
          </Section>
          {!!group('info').length && <Section title={t.email.info}><ul className="space-y-3">{group('info').map(item)}</ul></Section>}
          {!!group(null).length && <Section title={t.email.untriaged}><ul className="space-y-3">{group(null).map(item)}</ul></Section>}
          <Fold title={t.email.promo} items={group('promo')} render={item} />
          <Fold title={t.email.handled} items={list.filter((x) => x.handled)} render={item} />
        </div>
      )}
    </>
  );
}

function Fold({ title, items, render }: { title: string; items: Triaged[]; render: (x: Triaged) => ReactNode }) {
  if (!items.length) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-lg font-semibold">{title} <span className="text-sm font-normal text-muted">({items.length})</span></summary>
      <ul className="mt-2.5 space-y-3">{items.map(render)}</ul>
    </details>
  );
}

function Message({ x, adopted }: { x: Triaged; adopted: boolean }) {
  const { f, now, source, run, snapshot: d } = useApp();
  const { t } = useI18n();
  const [adopting, setAdopting] = useState(false);
  const { m, category, handled, overridden } = x;
  const tr = m.triage;
  const assignment = tr?.assignmentId ? d.assignments.find((a) => a.id === tr.assignmentId) : undefined;
  const save = (patch: { category?: TriageCategory | null; handled?: boolean }, done: string) => {
    const current = { ...(category && overridden ? { category } : {}), ...(handled ? { handled } : {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === false) delete current[k]; else current[k] = v; }
    const value = Object.keys(current).length ? { ...current, at: new Date().toISOString() } : null;
    return run(() => source.saveProgress('emailTriage', m.id, value), done);
  };
  const dueLocal = tr?.dueAt ? `${f.dayKey(tr.dueAt)}T${f.hm(tr.dueAt)}` : '';
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className={`block ${m.unread ? 'font-semibold' : 'font-medium'}`}>{m.subject}</span>
          <span className="text-xs text-muted">{m.from}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {category && <Tag tone={CATEGORY_TONE[category]}>{t.email.category[category]}</Tag>}
          {tr && !overridden && tr.priority === 'high' && <Tag tone="danger">{t.email.priority.high}</Tag>}
          {m.unread && <Tag tone="info">{t.email.unread}</Tag>}
          {m.hasAttachments && <Tag>{t.email.attachments(m.attachmentCount || 1)}</Tag>}
          <span className="font-mono text-xs text-muted">{f.ago(m.receivedAt, now)}</span>
        </div>
      </div>
      {tr?.summary
        ? <p className="mt-2 text-sm text-body"><span className="mr-1.5 text-xs font-medium text-muted">{overridden ? t.email.yours : t.email.ai}</span>{tr.summary}</p>
        : m.snippet && <p className="mt-2 text-sm text-body">{m.snippet}</p>}
      {tr?.action && <p className="mt-1 text-sm"><span className="text-muted">{t.email.suggested}</span> {tr.action}</p>}
      {(tr?.dueAt || assignment) && (
        <p className="mt-1 text-[13px] text-muted">
          {tr?.dueAt && <span className="mr-3">{t.email.due(f.when(tr.dueAt, now))}</span>}
          {assignment && <a href={href('coursework', { open: assignment.id })} className="underline underline-offset-2">{t.email.related(assignment.title)}</a>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={() => save({ handled: !handled }, handled ? t.email.unhandledDone : t.email.handledDone)}>{handled ? t.email.undo : t.email.markHandled}</button>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          {t.email.reclassify}
          <select className="field w-auto py-1 text-[13px]" value={category || ''} onChange={(ev) => save({ category: (ev.target.value || null) as TriageCategory | null }, t.email.reclassified)}>
            {!category && <option value="">—</option>}
            {CATEGORIES.map((c) => <option key={c} value={c}>{t.email.category[c]}</option>)}
          </select>
        </label>
        {overridden && <button type="button" className="text-[13px] text-muted underline underline-offset-2" onClick={() => save({ category: null }, t.email.reclassified)}>{t.email.useAi}</button>}
        {adopted
          ? <Tag tone="ok">{t.email.adopted}</Tag>
          : <button type="button" className="btn" aria-expanded={adopting} onClick={() => setAdopting(!adopting)}>{t.email.adopt}</button>}
        {m.link && <External url={m.link} className="text-[13px]">Gmail</External>}
      </div>
      {adopting && !adopted && (
        <div className="mt-3 max-w-xl">
          <p className="mb-2 text-xs text-muted">{tr ? t.email.adoptHintAi : t.email.adoptHint}</p>
          <TodoForm origin={{ type: 'email', messageId: m.id }} initialTitle={tr?.action || m.subject} initialDue={dueLocal} onDone={() => setAdopting(false)} />
        </div>
      )}
    </li>
  );
}
