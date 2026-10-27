import { useEffect, useRef, useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href } from '../lib/router';
import { Tag, type Tone } from '../components/ui';
import { CONNECT_LIMIT, FOLLOW_UP_DAYS, PEOPLE, PREP, PROFILE, REL_STAGES, ROLES, STAGES, THANKS, WEIGHTS, matchScore, type Dim, type Draft, type Link, type Met, type PreviewPerson, type PreviewRole, type RelStage, type Stage } from '../data/careerPreview';
import { useCareerStatus } from './CareerPipeline';

// Demo-only previews of the job match and networking panels. Outputs are written in advance (like the other demo AI);
// "Generate" only reveals them. Statuses and todos go through the demo source, so they stay in this browser.
const MET_TONE: Record<Met, Tone> = { yes: 'ok', partial: 'warn', no: 'danger', unknown: 'neutral' };
const LINK_TONE: Record<Link, string> = { same: 'border-accent bg-accent-soft', near: 'border-accent-line bg-accent-soft/60', none: 'border-line bg-soft' };
const DIMS = Object.keys(WEIGHTS) as Dim[];

export function SoonBanner({ intro }: { intro: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-5 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border border-dashed border-accent-line bg-accent-soft px-4 py-3 text-sm">
      <span className="rounded-md border border-dashed border-accent px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-accent-ink">{t.career.soon}</span>
      <p className="min-w-0 flex-1">{intro} <span className="text-muted">{t.career.soonNote}</span></p>
    </div>
  );
}

function Ring({ value, size = 56 }: { value: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--color-ink)" className="font-mono text-[15px] font-semibold">{value}</text>
    </svg>
  );
}

function Bar({ value }: { value: number }) {
  return <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} /></div>;
}

/** Shows the pre-written output after a short pause, so the demo reads like the real flow without calling a model. */
function useGenerate(): [boolean, boolean, () => void] {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [state === 'done', state === 'busy', () => { setState('busy'); timer.current = window.setTimeout(() => setState('done'), 700); }];
}

function GenerateButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={onClick}>{busy ? t.career.generating : t.career.generate}</button>;
}

export function JobsPanel({ focus }: { focus?: string | null }) {
  const { t, lang } = useI18n();
  const ranked = [...ROLES].sort((a, b) => matchScore(b.dims) - matchScore(a.dims));
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <div className="min-w-0 space-y-3">
        {ranked.map((r) => <RoleCard key={r.id} r={r} initiallyOpen={focus === r.id} />)}
      </div>
      <aside className="space-y-3 text-sm lg:sticky lg:top-24" aria-label={t.career.profile}>
        <h2 className="text-lg font-semibold">{t.career.profile}</h2>
        <div className="panel p-4">
          <p className="font-medium">{PROFILE.name}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{PROFILE.lines.map((x) => <li key={x.en}>{x[lang]}</li>)}</ul>
        </div>
        <p className="text-xs text-muted">{t.career.weights}</p>
      </aside>
    </div>
  );
}

function RoleCard({ r, initiallyOpen }: { r: PreviewRole; initiallyOpen: boolean }) {
  const { t, lang } = useI18n();
  const { source, run, now } = useApp();
  const { stageOf, setStage: saveStage } = useCareerStatus();
  const [open, setOpen] = useState(initiallyOpen);
  const [shown, busy, generate] = useGenerate();
  const score = matchScore(r.dims);
  const stage = stageOf(r.id).stage;
  const contact = PEOPLE.find((p) => p.id === r.contactId);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (initiallyOpen) ref.current?.scrollIntoView({ block: 'start' }); }, [initiallyOpen]);
  const setStage = (s: Stage) => saveStage(r.id, s);
  const addTodo = () => run(() => source.saveTodo({
    title: `${lang === 'zh' ? '申请' : 'Apply'}: ${r.title} · ${r.company.replace(/ \(.*\)$/, '')}`,
    dueAt: new Date(+now + 5 * 86400000).toISOString(), durationMinutes: 60, notes: r.summary[lang],
  }), t.career.todoAdded);

  return (
    <article ref={ref} className="panel scroll-mt-24 p-4" aria-label={r.title}>
      <div className="flex flex-wrap items-start gap-4">
        <Ring value={score} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{r.title}</h3>
          <p className="text-xs text-muted">{r.company} · {r.location} · {t.career.posted(r.posted)}</p>
          <p className="mt-1.5 text-sm">{r.summary[lang]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag tone={r.sponsorship === 'yes' ? 'ok' : r.sponsorship === 'no' ? 'danger' : 'warn'}>{t.career.sponsorship[r.sponsorship]}</Tag>
            {r.startYear ? <Tag>{r.startYear}</Tag> : <Tag tone="warn">{t.career.startUnknown}</Tag>}
            {stage !== 'none' && <Tag tone="info">{t.career.stage[stage]}</Tag>}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {DIMS.map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <dt className="w-20 shrink-0 text-muted">{t.career.dims[k]}</dt>
            <Bar value={r.dims[k]} />
            <dd className="w-7 text-right font-mono tabular-nums">{r.dims[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t.career.close : t.career.open}</button>
        <label className="sr-only" htmlFor={`stage-${r.id}`}>{t.career.stageLabel}</label>
        <select id={`stage-${r.id}`} className="field !w-auto" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => <option key={s} value={s}>{t.career.stage[s]}</option>)}
        </select>
        {stage === 'interview' && r.id === PREP.roleId && <a className="text-sm" href={href('career', { tab: 'pipeline', id: 'prep' })}>{t.career.prepLink} →</a>}
      </div>
      {open && (
        <div className="animate-rise mt-4 space-y-4 border-t border-line pt-4">
          <section aria-label={t.career.requirements}>
            <h4 className="mb-2 text-sm font-semibold">{t.career.requirements}</h4>
            <ul className="space-y-2 text-sm">
              {r.requirements.map((q) => (
                <li key={q.text.en} className="flex items-start gap-2.5">
                  <span className="w-[4.5rem] shrink-0"><Tag tone={MET_TONE[q.met]}>{t.career.met[q.met]}</Tag></span>
                  <span className="min-w-0">{q.text[lang]}<span className="block text-xs text-muted">{q.evidence[lang]}</span></span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label={t.career.suggestions} className="rounded-xl border border-accent-line bg-accent-soft p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-accent">{t.career.suggestions}</h4>
              <Tag tone="info">AI</Tag>
            </div>
            <ul className="mb-3 space-y-1 text-xs text-muted">{DIMS.map((k) => <li key={k}><span className="font-medium text-ink">{t.career.dims[k]}</span> · {r.dimNotes[k][lang]}</li>)}</ul>
            {shown ? (
              <ol className="animate-fade list-decimal space-y-3 pl-5 text-sm">
                {r.suggestions.map((s) => (
                  <li key={s.title.en}>
                    <span className="font-medium">{s.title[lang]}</span>
                    <span className="block text-muted">{s.why[lang]}</span>
                    {s.before && <span className="mt-1 block text-xs"><span className="text-muted">{t.career.before}: </span><s className="text-muted">{s.before}</s></span>}
                    <span className="mt-1 block rounded-md bg-raised px-2.5 py-1.5 text-[13px]"><span className="text-muted">{t.career.after}: </span>{s.after}</span>
                  </li>
                ))}
              </ol>
            ) : <GenerateButton busy={busy} onClick={generate} />}
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={addTodo}>{t.career.addTodo}</button>
            {contact && <a className="text-sm" href={href('career', { tab: 'people', id: contact.id })}>{t.career.contact(contact.name)} →</a>}
          </div>
        </div>
      )}
    </article>
  );
}

export function PeoplePanel({ focus }: { focus?: string | null }) {
  return <div className="space-y-3">{PEOPLE.map((p) => <PersonCard key={p.id} p={p} initiallyOpen={focus === p.id} />)}</div>;
}

function PersonCard({ p, initiallyOpen }: { p: PreviewPerson; initiallyOpen: boolean }) {
  const { t, lang } = useI18n();
  const { source, run, now } = useApp();
  const { rel, setRel, days } = useCareerStatus();
  const [open, setOpen] = useState(initiallyOpen);
  const [shown, busy, generate] = useGenerate();
  const role = ROLES.find((r) => r.id === p.roleId);
  const r = rel(p.id), d = days(r.at), afterChat = r.stage === 'chatted' || r.stage === 'referred';
  const next = r.stage === 'requested' ? (d >= FOLLOW_UP_DAYS ? t.career.requestStale(p.name.replace(/ \(.*\)$/, '').split(' ')[0], d) : t.career.next.requested(d)) : r.stage === 'chatted' ? (r.thanked ? t.career.next.chatted(d) : t.career.next.thanks) : t.career.next[r.stage];
  const drafts: Draft[] = afterChat ? [{ kind: 'thanks', text: THANKS[p.id] }, ...p.drafts] : p.drafts;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (initiallyOpen) ref.current?.scrollIntoView({ block: 'start' }); }, [initiallyOpen]);
  const followUp = () => run(() => source.saveTodo({
    title: `${lang === 'zh' ? '跟进' : 'Follow up with'} ${p.name.replace(/ \(.*\)$/, '')}`,
    dueAt: new Date(+now + 3 * 86400000).toISOString(), durationMinutes: 15, notes: p.why[lang],
  }), t.career.followUpAdded);

  return (
    <article ref={ref} className="panel scroll-mt-24 p-4" aria-label={p.name}>
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-ink">{p.name.split(' ').slice(0, 2).map((x) => x[0]).join('')}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{p.name}</h3>
          <p className="text-xs text-muted">{p.headline} · {p.location} · {t.career.degree(p.degree)} · {t.career.mutuals(p.mutuals)}</p>
          <p className="mt-1.5 text-sm">{p.summary[lang]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{p.shared.map((x) => <Tag key={x.en} tone="info">{x[lang]}</Tag>)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm"><span className="font-medium">{t.career.nextStep}:</span> {next}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t.career.close : t.career.open}</button>
        <label className="sr-only" htmlFor={`rel-${p.id}`}>{t.career.relLabel}</label>
        <select id={`rel-${p.id}`} className="field !w-auto" value={r.stage} onChange={(e) => setRel(p.id, e.target.value as RelStage)}>
          {REL_STAGES.map((s) => <option key={s} value={s}>{t.career.rel[s]}</option>)}
        </select>
        {r.stage === 'chatted' && (r.thanked ? <Tag tone="ok">{t.career.thanked}</Tag> : <button type="button" className="btn" onClick={() => setRel(p.id, 'chatted', true)}>{t.career.markThanked}</button>)}
        {role && <a className="text-sm" href={href('career', { tab: 'jobs', id: role.id })}>{t.career.role(role.title)} →</a>}
      </div>
      {open && (
        <div className="animate-rise mt-4 space-y-4 border-t border-line pt-4">
          <section aria-label={t.career.why}>
            <h4 className="mb-1 text-sm font-semibold">{t.career.why}</h4>
            <p className="text-sm">{p.why[lang]}</p>
          </section>
          <section aria-label={t.career.shared}>
            <h4 className="mb-2 text-sm font-semibold">{t.career.shared}</h4>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-2 text-[13px]">
              <span className="text-xs font-medium text-muted">{t.career.you}</span><span /><span className="text-xs font-medium text-muted">{p.name.replace(/ \(.*\)$/, '')}</span>
              {p.path.map((row) => (
                <PathLine key={row.yours.en} yours={row.yours[lang]} theirs={row.theirs[lang]} link={row.link} note={row.note?.[lang]} />
              ))}
            </div>
          </section>
          <section aria-label={t.career.drafts} className="rounded-xl border border-accent-line bg-accent-soft p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-accent">{t.career.drafts}</h4>
              <Tag tone="info">AI</Tag>
            </div>
            {shown ? <Drafts key={drafts[0].kind} drafts={drafts} id={p.id} /> : <GenerateButton busy={busy} onClick={generate} />}
            <p className="mt-2 text-xs text-muted">{t.career.neverSent}</p>
          </section>
          <button type="button" className="btn" onClick={followUp}>{t.career.followUp}</button>
        </div>
      )}
    </article>
  );
}

function PathLine({ yours, theirs, link, note }: { yours: string; theirs: string; link: Link; note?: string }) {
  const { t } = useI18n();
  return (
    <>
      <span className={`min-w-0 rounded-md border px-2.5 py-1.5 ${LINK_TONE[link]}`}>{yours}</span>
      <span className={`self-center text-center font-mono text-[11px] ${link === 'none' ? 'text-muted' : 'text-accent-ink'}`} title={t.career.link[link]}>{link === 'same' ? '=' : link === 'near' ? '≈' : '≠'}<span className="sr-only"> {t.career.link[link]}</span></span>
      <span className={`min-w-0 rounded-md border px-2.5 py-1.5 ${LINK_TONE[link]}`}>{theirs}</span>
      {note && <span className="col-span-3 -mt-1 text-center text-xs text-muted">{note}</span>}
    </>
  );
}

function Drafts({ drafts, id }: { drafts: Draft[]; id: string }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Draft['kind']>(drafts[0].kind);
  const draft = drafts.find((d) => d.kind === kind)!;
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(draft.text); setCopied(null); }, [draft]);
  const over = kind === 'connect' && text.length > CONNECT_LIMIT;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied('ok'); } catch { area.current?.select(); setCopied('fail'); }
  };
  return (
    <div className="animate-fade space-y-2">
      <div role="tablist" aria-label={t.career.drafts} className="flex flex-wrap gap-1.5">
        {drafts.map((d) => (
          <button key={d.kind} type="button" role="tab" aria-selected={d.kind === kind} onClick={() => setKind(d.kind)}
            className={`min-h-8 rounded-full border px-3 text-[13px] ${d.kind === kind ? 'border-ink bg-ink text-on-ink' : 'border-line bg-raised hover:bg-soft'}`}>{t.career.draftKinds[d.kind]}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor={`draft-${id}`}>{t.career.draftKinds[kind]}</label>
      <textarea id={`draft-${id}`} ref={area} className="field min-h-36 font-sans text-[13px] leading-relaxed" value={text} onChange={(e) => { setText(e.target.value); setCopied(null); }} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={over ? 'text-danger' : 'text-muted'}>{kind === 'connect' ? `${t.career.chars(text.length, CONNECT_LIMIT)}${over ? ` · ${t.career.tooLong}` : ''}` : ''}</span>
        <span className="flex items-center gap-2">
          {copied && <span role="status" className="text-muted">{copied === 'ok' ? t.career.copied : t.career.copyFail}</span>}
          <button type="button" className="btn" onClick={copy}>{t.career.copy}</button>
        </span>
      </div>
    </div>
  );
}
