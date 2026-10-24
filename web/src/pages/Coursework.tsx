import { useState, type FormEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, PageHeader, Tabs, Tag } from '../components/ui';
import { Core } from '../lib/shared';
import { Breakdown } from '../components/Breakdown';
import type { Assignment, Todo } from '../data/types';

type Tab = 'required' | 'choice' | 'verify' | 'past' | 'done' | 'todos';

export function Coursework({ params }: { params: URLSearchParams }) {
  const { snapshot: d, classify, isDone, isPast, progress } = useApp();
  const { t } = useI18n();
  const groups: Record<Exclude<Tab, 'todos'>, Assignment[]> = { required: [], choice: [], verify: [], past: [], done: [] };
  for (const a of d.assignments) {
    const k = classify(a);
    if (isDone(a)) groups.done.push(a);
    else if (isPast(a)) groups.past.push(a);
    else if (k === 'verify') groups.verify.push(a);
    else if (a.requirement === 'choice') groups.choice.push(a);
    else groups.required.push(a);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => (Date.parse(a.dueAt || '') || Infinity) - (Date.parse(b.dueAt || '') || Infinity));
  // Finished and past work reads newest first.
  groups.done.reverse(); groups.past.reverse();
  const openId = params.get('open') || '';
  const inferred = (Object.keys(groups) as (keyof typeof groups)[]).find((k) => groups[k].some((a) => a.id === openId));
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || inferred || 'required');
  const todos = Object.values(progress.todo || {});

  return (
    <>
      <PageHeader title={t.coursework.title} subtitle={t.coursework.subtitle} />
      <Tabs label={t.coursework.title} value={tab} onChange={setTab} items={[
        ['required', t.coursework.tabs.required, groups.required.length],
        ['choice', t.coursework.tabs.choice, groups.choice.length],
        ['verify', t.coursework.tabs.verify, groups.verify.length],
        ['past', t.coursework.tabs.past, groups.past.length],
        ['done', t.coursework.tabs.done, groups.done.length],
        ['todos', t.coursework.tabs.todos, todos.filter((x) => x.status !== 'done').length],
      ]} />
      {tab === 'todos'
        ? <Todos todos={todos} />
        : groups[tab].length
          ? <div className="space-y-3">{tab === 'past' && <p className="text-sm text-muted">{t.coursework.pastHint}</p>}{groups[tab].map((a) => <AssignmentCard key={a.id} a={a} initiallyOpen={a.id === openId} />)}</div>
          : <Empty>{t.coursework.empty}</Empty>}
    </>
  );
}

function AssignmentCard({ a, initiallyOpen }: { a: Assignment; initiallyOpen: boolean }) {
  const { progress, source, run, f, now, classify, snapshot: d, workStatus, verifyReason, mark, isPast } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(initiallyOpen);
  // Ticks show at once; the saved value replaces them after the round trip, or they revert if saving fails.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const checked = (key: string) => (key in pending ? pending[key] : !!progress.checks?.[key]);
  const toggle = async (key: string, value: boolean) => {
    setPending((p) => ({ ...p, [key]: value }));
    await run(() => source.saveProgress('checks', key, value));
    setPending(({ [key]: _, ...rest }) => rest);
  };
  const k = classify(a);
  const m = mark(a), past = isPast(a);
  const setMark = (status: 'done' | 'skipped' | null) => run(() => source.saveProgress('archive', a.id, status && { status, at: new Date().toISOString() }), status === 'done' ? t.coursework.markedDone : status ? t.coursework.markedSkipped : t.coursework.unmarked);
  const list = a.checklist || [];
  const done = list.filter((_, i) => checked(`${a.id}:${i}`)).length;
  const failedSource = d.sources.find((s) => s.id === a.sourceId && ['failed', 'unavailable'].includes(s.status));
  const actual = progress.actual?.[a.id];
  const tone = k === 'overdue' ? 'danger' : k === 'soon' ? 'warn' : k === 'verify' ? 'warn' : k === 'submitted' ? 'ok' : 'neutral';

  return (
    <article className="panel overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-soft">
        <div className="min-w-0">
          <div className="font-medium">{a.title}</div>
          <div className="text-xs text-muted">{a.course}{a.estimateMinutes ? ` · ${t.common.est(f.duration(a.estimateMinutes))}` : ''}{list.length ? ` · ${t.coursework.progress(done, list.length)}` : ''}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.requirement === 'choice' && <Tag tone="info">{t.status.optional}</Tag>}
          <Tag tone={past ? 'warn' : tone}>{m ? t.coursework.mark[m] : past ? t.coursework.pastTag : k === 'verify' ? t.status.verify : k === 'submitted' ? workStatus(a.status) : k === 'overdue' ? t.status.overdue : f.when(a.dueAt, now)}</Tag>
          <span aria-hidden="true" className="text-muted">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-line px-4 py-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          <dl className="space-y-3 text-sm">
            {failedSource && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{t.today.failedSource(failedSource.name)}</p>}
            {k === 'verify' && !failedSource && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{verifyReason(a)}</p>}
            {a.archivedFromSource && <p className="text-[13px] text-warn">{t.coursework.archivedNote}</p>}
            <Field label={t.common.due('').trim() || 'Due'} value={a.dueAt ? `${f.day(a.dueAt)} ${f.time(a.dueAt)}` : t.common.noDue} />
            {a.description && <Field label={t.coursework.requirements} value={a.description} />}
            {a.materials && <Field label={t.coursework.materials} value={a.materials} />}
            {a.aiPolicy && <Field label={t.coursework.aiPolicy} value={a.aiPolicy} />}
            {a.evidence && <Field label={t.coursework.evidence} value={a.evidence} />}
            <External url={a.source} className="text-[13px]">{t.coursework.openSource}</External>
            {/* A local mark: it never changes the source, and the next refresh keeps it. Submitted work at the source needs none. */}
            {!['submitted', 'graded', 'excused'].includes(a.status) && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {m
                  ? <><span className="text-[13px] text-muted">{t.coursework.markedNote(t.coursework.mark[m])}</span><button type="button" className="btn" onClick={() => setMark(null)}>{t.coursework.unmark}</button></>
                  : <><button type="button" className="btn btn-primary" onClick={() => setMark('done')}>{t.coursework.markDone}</button><button type="button" className="btn" onClick={() => setMark('skipped')}>{t.coursework.markSkipped}</button></>}
              </div>
            )}
          </dl>
          <div className="space-y-4">
            <Breakdown a={a} />
            {list.length > 0 && (
              <fieldset>
                <legend className="label">{t.coursework.checklist}</legend>
                <ul className="space-y-1.5">
                  {list.map((item, i) => {
                    const key = `${a.id}:${i}`, id = `chk-${key}`;
                    return (
                      <li key={key} className="flex items-start gap-2.5">
                        <input id={id} type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={checked(key)} onChange={(e) => toggle(key, e.target.checked)} />
                        <label htmlFor={id} className="text-sm">{item}</label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            <div>
              <label className="label" htmlFor={`act-${a.id}`}>{t.coursework.actual}</label>
              <input id={`act-${a.id}`} type="number" min={0} step={5} className="field max-w-40" defaultValue={actual ?? ''} key={String(actual)}
                onBlur={(e) => { const v = e.target.value.trim(); const n = v === '' ? null : Number(v); if (n !== (actual ?? null)) run(() => source.saveProgress('actual', a.id, n)); }} />
              <p className="mt-1 text-xs text-muted">{t.coursework.actualHint}</p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="label">{label}</dt><dd>{value}</dd></div>;
}

function Todos({ todos }: { todos: Todo[] }) {
  const { source, run, f, now } = useApp();
  const { t } = useI18n();
  const sorted = [...todos].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (Date.parse(a.dueAt || '') || Infinity) - (Date.parse(b.dueAt || '') || Infinity));
  return (
    <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
      <div>
        <p className="mb-3 text-sm text-muted">{t.coursework.todosHint}</p>
        {sorted.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {sorted.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className={`font-medium ${x.status === 'done' ? 'text-muted line-through' : ''}`}>{x.title}</div>
                  <div className="text-xs text-muted">{x.dueAt ? f.when(x.dueAt, now) : t.coursework.todoNoDue} · {f.duration(x.durationMinutes)}{x.origin?.type === 'email' && x.origin.subject ? ` · ${t.coursework.todoFromEmail(x.origin.subject)}` : ''}</div>
                </div>
                <button type="button" className="btn" onClick={() => run(() => source.completeTodo(x.id, x.status !== 'done'))}>{x.status === 'done' ? t.coursework.todoReopen : t.coursework.todoDone}</button>
              </li>
            ))}
          </ul>
        ) : <Empty>{t.coursework.empty}</Empty>}
      </div>
      <TodoForm />
    </div>
  );
}

export function TodoForm({ origin, initialTitle = '', initialDue = '', onDone }: { origin?: { type: 'email'; messageId: string }; initialTitle?: string; initialDue?: string; onDone?: () => void }) {
  const { source, run, snapshot: d } = useApp();
  const { t } = useI18n();
  const [title, setTitle] = useState(initialTitle);
  const [due, setDue] = useState(initialDue);
  const [minutes, setMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    Core.configure(d.timezone);
    const [date, time] = due.split('T');
    const dueAt = due ? Core.zonedISO(date, time) : null;
    const ok = await run(() => source.saveTodo({ title, dueAt, durationMinutes: Number(minutes), notes, ...(origin ? { origin } : {}) }), t.coursework.todoSave);
    if (ok) { setTitle(''); setDue(''); setNotes(''); onDone?.(); }
  };
  return (
    <form onSubmit={submit} className="panel space-y-3 p-4" aria-label={t.coursework.todoAdd}>
      <h2 className="font-semibold">{t.coursework.todoAdd}</h2>
      <div><label className="label" htmlFor="todo-title">{t.coursework.todoTitle}</label><input id="todo-title" className="field" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1"><label className="label" htmlFor="todo-due">{t.coursework.todoDue}</label><input id="todo-due" type="datetime-local" className="field" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="w-36"><label className="label" htmlFor="todo-min">{t.coursework.todoDuration}</label><input id="todo-min" type="number" min={5} max={600} step={5} required className="field" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
      </div>
      <div><label className="label" htmlFor="todo-notes">{t.coursework.todoNotes}</label><textarea id="todo-notes" className="field min-h-20" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button type="submit" className="btn btn-primary">{t.coursework.todoSave}</button>
    </form>
  );
}
