import { useState, type FormEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, Section, Tag, type Tone } from '../components/ui';
import { Career, Core } from '../lib/shared';
import type { Contact, ContactInput, Job, JobInput, JobStage } from '../data/types';

// The private career tracker: the owner's own postings, applications and contacts (src/career.cjs). Moving a card records
// what the owner did on the company's site; Dayweave never applies, sends or signs in anywhere.
const STAGES = Career.STAGES as JobStage[];
const ACTIVE: JobStage[] = ['saved', 'preparing', 'applied', 'assessment', 'interview', 'offer'];
const ENDED: JobStage[] = ['rejected', 'withdrawn'];
const DAY = 86400000;

export function useToday() {
  const { snapshot: d, now } = useApp();
  Core.configure(d.timezone);
  return Core.dayKey(+now) as string;
}
const plusDays = (day: string, n: number) => new Date(Date.parse(day + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const daysUntil = (day: string, today: string) => Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / DAY);

function useCareer() {
  const { progress, source, run } = useApp();
  const { t } = useI18n();
  const jobs = (progress.careerJob || {}) as Record<string, Job>;
  const contacts = (progress.careerContact || {}) as Record<string, Contact>;
  const saveJob = (record: JobInput, done = t.tracker.saved) => run(() => source.saveCareer!('job', record), done);
  const saveContact = (record: ContactInput, done = t.tracker.saved) => run(() => source.saveCareer!('contact', record), done);
  const remove = (kind: 'job' | 'contact', id: string) => run(() => source.removeCareer!(kind, id), t.tracker.removed);
  return { jobs, contacts, saveJob, saveContact, remove };
}

export function PipelineTracker() {
  const { t } = useI18n();
  const { planSettings } = useApp();
  const { jobs, contacts } = useCareer();
  const today = useToday();
  const list = Object.values(jobs);
  const s = Career.stats(jobs, today);
  const goal = planSettings.habits.find((h) => h.id === 'job-applications')?.perWeek ?? 4;
  const actions = Career.nextActions(jobs, contacts, today) as Action[];
  const [adding, setAdding] = useState(false);
  const stats: [string, string][] = [
    [t.tracker.stats.week, t.tracker.ofGoal(s.week, goal)],
    [t.tracker.stats.reply, s.sent ? `${Math.round((s.replied / s.sent) * 100)}% · ${s.replied}/${s.sent}` : '—'],
    [t.tracker.stats.interviews, String(s.interviews)],
    [t.tracker.stats.open, String(s.open)],
  ];
  const ended = list.filter((j) => ENDED.includes(j.stage));
  return (
    <div className="min-w-0 space-y-8">
      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {stats.map(([k, v]) => <div key={k} className="panel p-3.5"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd></div>)}
      </dl>

      <NextActions actions={actions} today={today} />

      <Section title={t.tracker.pipeline} aside={<button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>{adding ? t.tracker.cancel : t.tracker.addJob}</button>}>
        {adding && <div className="mb-4"><JobForm onDone={() => setAdding(false)} /></div>}
        <p className="mb-3 text-[13px] text-muted">{t.tracker.manualNote}</p>
        {!list.length ? <Empty>{t.tracker.emptyJobs}</Empty> : (
          <div className="space-y-6">
            {ACTIVE.map((stage) => {
              const here = list.filter((j) => j.stage === stage).sort(byUrgency);
              if (!here.length) return null;
              return (
                <div key={stage}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{t.tracker.stage[stage]}<span className="font-mono text-xs text-muted">{here.length}</span></h3>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{here.map((j) => <JobCard key={j.id} job={j} today={today} />)}</div>
                </div>
              );
            })}
            {!!ended.length && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold">{t.tracker.ended} <span className="font-mono text-xs text-muted">{ended.length}</span></summary>
                <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{ended.map((j) => <JobCard key={j.id} job={j} today={today} />)}</div>
              </details>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

const byUrgency = (a: Job, b: Job) => (a.nextDate || a.deadline || '9999').localeCompare(b.nextDate || b.deadline || '9999') || a.company.localeCompare(b.company);

interface Action { kind: 'deadline' | 'next' | 'stale' | 'followup'; id: string; due?: string; days?: number; text?: string; job?: Job; contact?: Contact }

export function NextActions({ actions, today, limit }: { actions: Action[]; today: string; limit?: number }) {
  const { t } = useI18n();
  const shown = limit ? actions.slice(0, limit) : actions;
  const tone: Record<Action['kind'], Tone> = { deadline: 'danger', next: 'info', stale: 'warn', followup: 'warn' };
  return (
    <Section title={t.tracker.next}>
      {shown.length ? (
        <ul className="panel divide-y divide-line">
          {shown.map((a) => (
            <li key={a.kind + a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <Tag tone={tone[a.kind]}>{t.tracker.actionTag[a.kind]}</Tag>
              <span className="min-w-0 flex-1">{
                a.kind === 'deadline' ? t.tracker.deadlineIn(`${a.job!.company} · ${a.job!.title}`, daysUntil(a.due!, today))
                : a.kind === 'next' ? `${a.job!.company} · ${a.job!.title}: ${a.text || t.tracker.nextDue}`
                : a.kind === 'stale' ? t.tracker.stale(`${a.job!.company} · ${a.job!.title}`, a.days!)
                : t.tracker.followUp(a.contact!.name, a.contact!.company)}</span>
              {a.due && <span className="font-mono text-xs text-muted">{a.due}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">{t.tracker.nothingNext}</p>}
    </Section>
  );
}

function JobCard({ job: j, today }: { job: Job; today: string }) {
  const { t } = useI18n();
  const { saveJob, remove } = useCareer();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  if (editing) return <JobForm job={j} onDone={() => setEditing(false)} />;
  const left = j.deadline ? daysUntil(j.deadline, today) : null;
  const move = (stage: JobStage) => saveJob({ ...j, stage }, t.tracker.movedTo(t.tracker.stage[stage]));
  const addNote = async (e: FormEvent) => { e.preventDefault(); if (note.trim() && await saveJob({ ...j, event: note }, t.tracker.noteAdded)) setNote(''); };
  const last = j.timeline.at(-1);
  return (
    <article className="panel flex min-w-0 flex-col gap-2 p-3.5 text-sm">
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{j.title}</p>
        <p className="text-xs text-muted">{[j.company, j.location || t.tracker.market[j.market as keyof typeof t.tracker.market], t.tracker.track[j.track as keyof typeof t.tracker.track]].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {left !== null && j.stage !== 'rejected' && j.stage !== 'withdrawn' && !j.appliedAt && <Tag tone={left < 0 ? 'neutral' : left <= 3 ? 'danger' : left <= 7 ? 'warn' : 'neutral'}>{left < 0 ? t.tracker.closed : t.tracker.dueIn(left)}</Tag>}
        {j.appliedAt && <Tag tone="info">{t.tracker.appliedOn(j.appliedAt.slice(0, 10))}</Tag>}
        <Tag>{t.tracker.channel[j.channel as keyof typeof t.tracker.channel]}</Tag>
        {j.origin.type === 'research' && <Tag>{t.tracker.fromResearch}</Tag>}
      </div>
      {j.nextStep && <p className="text-[13px]"><span className="text-muted">{t.tracker.nextLabel}:</span> {j.nextStep}{j.nextDate ? ` · ${j.nextDate}` : ''}</p>}
      {last && last.kind !== 'added' && <p className="text-xs text-muted">{last.at.slice(0, 10)} · {last.kind === 'note' ? last.note : t.tracker.movedTo(t.tracker.stage[last.stage as JobStage])}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`stage-${j.id}`}>{t.tracker.stageLabel}</label>
        <select id={`stage-${j.id}`} className="field !min-h-9 !w-auto !py-1 text-xs" value={j.stage} onChange={(e) => move(e.target.value as JobStage)}>
          {STAGES.map((s) => <option key={s} value={s}>{t.tracker.stage[s]}</option>)}
        </select>
        {(j.stage === 'saved' || j.stage === 'preparing') && <button type="button" className="btn !min-h-9 text-xs" onClick={() => move('applied')}>{t.tracker.iApplied}</button>}
        {j.url && <External url={j.url} className="ml-auto text-[13px]">{t.tracker.posting}</External>}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-accent">{t.tracker.more}</summary>
        <div className="mt-2 space-y-2">
          {j.notes && <p className="whitespace-pre-wrap text-[13px] text-muted">{j.notes}</p>}
          <ol className="space-y-0.5 text-xs text-muted">{j.timeline.slice().reverse().map((e, i) => <li key={i}>{e.at.slice(0, 10)} · {e.kind === 'note' ? e.note : e.kind === 'added' ? t.tracker.added : t.tracker.movedTo(t.tracker.stage[e.stage as JobStage])}</li>)}</ol>
          <form onSubmit={addNote} className="flex gap-2">
            <label className="sr-only" htmlFor={`note-${j.id}`}>{t.tracker.addNote}</label>
            <input id={`note-${j.id}`} className="field !min-h-9 flex-1 text-xs" maxLength={300} placeholder={t.tracker.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn !min-h-9 text-xs">{t.tracker.addNote}</button>
          </form>
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => setEditing(true)}>{t.tracker.edit}</button>
            <ConfirmRemove onConfirm={() => remove('job', j.id)} />
          </div>
        </div>
      </details>
    </article>
  );
}

function ConfirmRemove({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [ask, setAsk] = useState(false);
  return ask
    ? <span className="flex items-center gap-2 text-xs">{t.tracker.removeAsk}<button type="button" className="btn btn-danger !min-h-9 text-xs" onClick={onConfirm}>{t.tracker.remove}</button><button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => setAsk(false)}>{t.tracker.cancel}</button></span>
    : <button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => setAsk(true)}>{t.tracker.remove}</button>;
}

function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
  const { t } = useI18n();
  const { saveJob } = useCareer();
  const [v, setV] = useState<JobInput>(job ? { ...job } : { title: '', company: '', url: '', location: '', market: 'CN', track: 'ai-pm', deadline: null, channel: 'website', notes: '', nextStep: '', nextDate: null, stage: 'saved' });
  const set = (k: keyof JobInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value || (k === 'deadline' || k === 'nextDate' ? null : '') }));
  const id = (k: string) => `job-${job?.id ?? 'new'}-${k}`;
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await saveJob(v, job ? t.tracker.saved : t.tracker.added)) onDone(); };
  const choice = (k: 'market' | 'track' | 'channel', options: Record<string, string>) => (
    <div className="min-w-0 flex-1 basis-32"><label className="label" htmlFor={id(k)}>{t.tracker.fields[k]}</label>
      <select id={id(k)} className="field" value={v[k] as string} onChange={set(k)}>{Object.entries(options).map(([x, label]) => <option key={x} value={x}>{label}</option>)}</select></div>
  );
  return (
    <form onSubmit={submit} className="panel space-y-3 p-4" aria-label={job ? t.tracker.edit : t.tracker.addJob}>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 basis-56"><label className="label" htmlFor={id('title')}>{t.tracker.fields.title}</label><input id={id('title')} className="field" required maxLength={200} value={v.title} onChange={set('title')} /></div>
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor={id('company')}>{t.tracker.fields.company}</label><input id={id('company')} className="field" required maxLength={120} value={v.company} onChange={set('company')} /></div>
      </div>
      <div><label className="label" htmlFor={id('url')}>{t.tracker.fields.url}</label><input id={id('url')} type="url" className="field" maxLength={1000} placeholder="https://" value={v.url} onChange={set('url')} /></div>
      <div className="flex flex-wrap gap-3">
        {choice('market', t.tracker.market)}
        <div className="min-w-0 flex-1 basis-32"><label className="label" htmlFor={id('location')}>{t.tracker.fields.location}</label><input id={id('location')} className="field" maxLength={120} value={v.location} onChange={set('location')} /></div>
        {choice('track', t.tracker.track)}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 basis-36"><label className="label" htmlFor={id('deadline')}>{t.tracker.fields.deadline}</label><input id={id('deadline')} type="date" className="field" value={v.deadline ?? ''} onChange={set('deadline')} /></div>
        {choice('channel', t.tracker.channel)}
        <div className="min-w-0 flex-1 basis-32"><label className="label" htmlFor={id('stage')}>{t.tracker.stageLabel}</label>
          <select id={id('stage')} className="field" value={v.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s} value={s}>{t.tracker.stage[s]}</option>)}</select></div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-[2] basis-56"><label className="label" htmlFor={id('next')}>{t.tracker.fields.nextStep}</label><input id={id('next')} className="field" maxLength={200} value={v.nextStep} onChange={set('nextStep')} /></div>
        <div className="min-w-0 flex-1 basis-36"><label className="label" htmlFor={id('nextDate')}>{t.tracker.fields.nextDate}</label><input id={id('nextDate')} type="date" className="field" value={v.nextDate ?? ''} onChange={set('nextDate')} /></div>
      </div>
      <div><label className="label" htmlFor={id('notes')}>{t.tracker.fields.notes}</label><textarea id={id('notes')} className="field min-h-20" maxLength={4000} placeholder={t.tracker.notesHint} value={v.notes} onChange={set('notes')} /></div>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary">{job ? t.tracker.save : t.tracker.addJob}</button><button type="button" className="btn btn-quiet" onClick={onDone}>{t.tracker.cancel}</button></div>
    </form>
  );
}

export function PeopleTracker() {
  const { t } = useI18n();
  const { contacts, jobs, saveContact } = useCareer();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const list = Object.values(contacts).sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || a.name.localeCompare(b.name));
  return (
    <Section title={t.tracker.people} aside={<button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>{adding ? t.tracker.cancel : t.tracker.addContact}</button>}>
      {adding && <div className="mb-4"><ContactForm onDone={() => setAdding(false)} /></div>}
      <p className="mb-3 text-[13px] text-muted">{t.tracker.peopleNote}</p>
      {!list.length ? <Empty>{t.tracker.emptyPeople}</Empty> : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {list.map((c) => <ContactCard key={c.id} c={c} job={c.jobId ? jobs[c.jobId] : undefined} today={today} onTouched={() => saveContact({ ...c, lastContactAt: today, nextFollowUp: plusDays(today, 14) }, t.tracker.touched)} />)}
        </div>
      )}
    </Section>
  );
}

function ContactCard({ c, job, today, onTouched }: { c: Contact; job?: Job; today: string; onTouched: () => void }) {
  const { t } = useI18n();
  const { remove } = useCareer();
  const [editing, setEditing] = useState(false);
  if (editing) return <ContactForm contact={c} onDone={() => setEditing(false)} />;
  const due = c.nextFollowUp ? daysUntil(c.nextFollowUp, today) : null;
  return (
    <article className="panel flex min-w-0 flex-col gap-2 p-3.5 text-sm">
      <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{[c.role, c.company, t.tracker.relation[c.relation as keyof typeof t.tracker.relation]].filter(Boolean).join(' · ')}</p></div>
      <div className="flex flex-wrap gap-1.5">
        {due !== null && <Tag tone={due <= 0 ? 'warn' : 'neutral'}>{due <= 0 ? t.tracker.followUpDue : t.tracker.followUpIn(due)}</Tag>}
        {c.lastContactAt && <Tag>{t.tracker.lastContact(c.lastContactAt)}</Tag>}
        {job && <Tag tone="info">{job.company}</Tag>}
      </div>
      {c.notes && <p className="line-clamp-3 whitespace-pre-wrap text-[13px] text-muted">{c.notes}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn !min-h-9 text-xs" onClick={onTouched}>{t.tracker.touchedToday}</button>
        <button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => setEditing(true)}>{t.tracker.edit}</button>
        <ConfirmRemove onConfirm={() => remove('contact', c.id)} />
        {c.url && <External url={c.url} className="ml-auto text-[13px]">{t.tracker.profile}</External>}
      </div>
    </article>
  );
}

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const { t } = useI18n();
  const { saveContact, jobs } = useCareer();
  const [v, setV] = useState<ContactInput>(contact ? { ...contact } : { name: '', company: '', role: '', relation: 'alumni', url: '', jobId: null, notes: '', lastContactAt: null, nextFollowUp: null });
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value || (['jobId', 'lastContactAt', 'nextFollowUp'].includes(k) ? null : '') }));
  const id = (k: string) => `contact-${contact?.id ?? 'new'}-${k}`;
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await saveContact(v, contact ? t.tracker.saved : t.tracker.added)) onDone(); };
  return (
    <form onSubmit={submit} className="panel space-y-3 p-4" aria-label={contact ? t.tracker.edit : t.tracker.addContact}>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor={id('name')}>{t.tracker.fields.name}</label><input id={id('name')} className="field" required maxLength={120} value={v.name} onChange={set('name')} /></div>
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor={id('company')}>{t.tracker.fields.company}</label><input id={id('company')} className="field" maxLength={120} value={v.company} onChange={set('company')} /></div>
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor={id('role')}>{t.tracker.fields.role}</label><input id={id('role')} className="field" maxLength={120} value={v.role} onChange={set('role')} /></div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 basis-32"><label className="label" htmlFor={id('relation')}>{t.tracker.fields.relation}</label>
          <select id={id('relation')} className="field" value={v.relation} onChange={set('relation')}>{Object.entries(t.tracker.relation).map(([x, label]) => <option key={x} value={x}>{label}</option>)}</select></div>
        <div className="min-w-0 flex-[2] basis-56"><label className="label" htmlFor={id('url')}>{t.tracker.fields.profileUrl}</label><input id={id('url')} type="url" className="field" maxLength={1000} placeholder="https://" value={v.url} onChange={set('url')} /></div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 basis-48"><label className="label" htmlFor={id('job')}>{t.tracker.fields.job}</label>
          <select id={id('job')} className="field" value={v.jobId ?? ''} onChange={set('jobId')}><option value="">—</option>{Object.values(jobs).map((j) => <option key={j.id} value={j.id}>{j.company} · {j.title}</option>)}</select></div>
        <div className="min-w-0 flex-1 basis-36"><label className="label" htmlFor={id('last')}>{t.tracker.fields.lastContactAt}</label><input id={id('last')} type="date" className="field" value={v.lastContactAt ?? ''} onChange={set('lastContactAt')} /></div>
        <div className="min-w-0 flex-1 basis-36"><label className="label" htmlFor={id('follow')}>{t.tracker.fields.nextFollowUp}</label><input id={id('follow')} type="date" className="field" value={v.nextFollowUp ?? ''} onChange={set('nextFollowUp')} /></div>
      </div>
      <div><label className="label" htmlFor={id('notes')}>{t.tracker.fields.notes}</label><textarea id={id('notes')} className="field min-h-20" maxLength={2000} value={v.notes} onChange={set('notes')} /></div>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary">{contact ? t.tracker.save : t.tracker.addContact}</button><button type="button" className="btn btn-quiet" onClick={onDone}>{t.tracker.cancel}</button></div>
    </form>
  );
}
