import { useEffect, useRef } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href } from '../lib/router';
import { Section, Tag } from '../components/ui';
import {
  FOLLOW_UP_DAYS, PEOPLE, PEOPLE_SEED, PIPELINE_SEED, PREP, ROLES, STAGES, STALE_DAYS,
  type PipelineItem, type RelStage, type Stage,
} from '../data/careerPreview';

// Demo-only preview: the application pipeline, the interview prep pack and the follow-up rhythm for contacts.
// The seeds say where Luna's search stands today; the visitor's changes are saved through the demo source.
const DAY = 86400000;
const SENT: Stage[] = ['applied', 'interview', 'offer', 'closed'];
const REPLIED: Stage[] = ['interview', 'offer', 'closed'];
const BOARD: Stage[] = ['saved', 'applied', 'interview', 'offer', 'closed'];
const short = (name: string) => name.replace(/ \(.*\)$/, '').split(' ')[0];

interface SavedStage { stage: Stage; at: string; appliedAt?: string }
interface SavedRel { stage: RelStage; at: string; thanked?: boolean }
export interface Status extends PipelineItem { appliedAt: string | null; heardAt: string | null }

/** Application and relationship status: the visitor's change if there is one, otherwise the demo's starting point. */
export function useCareerStatus() {
  const { progress, now, source, run } = useApp();
  const ago = (n?: number) => (n === undefined ? null : new Date(+now - n * DAY).toISOString());
  const days = (at: string | null) => (at ? Math.max(0, Math.floor((+now - Date.parse(at)) / DAY)) : 0);
  const item = (seed: PipelineItem): Status => {
    const s = progress.careerPipeline?.[seed.id] as SavedStage | undefined;
    if (!s) return { ...seed, appliedAt: ago(seed.appliedDaysAgo), heardAt: ago(seed.heardDaysAgo) };
    return { ...seed, stage: s.stage, appliedAt: s.appliedAt ?? null, heardAt: REPLIED.includes(s.stage) ? s.at : null };
  };
  const stageOf = (id: string) => item(PIPELINE_SEED.find((x) => x.id === id) ?? { id, title: '', company: '', stage: 'none' });
  const setStage = (id: string, stage: Stage) => {
    const cur = stageOf(id), at = new Date().toISOString();
    return run(() => source.saveProgress('careerPipeline', id, { stage, at, ...(SENT.includes(stage) ? { appliedAt: cur.appliedAt ?? at } : {}) } satisfies SavedStage));
  };
  const rel = (id: string): { stage: RelStage; at: string | null; thanked: boolean } => {
    const s = progress.careerPeople?.[id] as SavedRel | undefined;
    if (s) return { stage: s.stage, at: s.at, thanked: !!s.thanked };
    const seed = PEOPLE_SEED[id] ?? { stage: 'none' as RelStage };
    return { stage: seed.stage, at: ago(seed.daysAgo), thanked: false };
  };
  const setRel = (id: string, stage: RelStage, thanked = false) =>
    run(() => source.saveProgress('careerPeople', id, { stage, at: rel(id).stage === stage ? rel(id).at ?? new Date().toISOString() : new Date().toISOString(), thanked } satisfies SavedRel));
  return { item, stageOf, setStage, rel, setRel, days, now };
}

interface Step { key: string; text: string; tone: 'warn' | 'info'; link?: [string, string] }

/** What needs doing next, from the same rules the cards use. */
function useNextSteps(): Step[] {
  const { t } = useI18n();
  const { item, rel, days } = useCareerStatus();
  const steps: Step[] = [];
  for (const it of PIPELINE_SEED.map(item)) {
    if (it.stage === 'interview' && it.id === PREP.roleId) steps.push({ key: 'prep-' + it.id, tone: 'info', text: `${it.title} · ${it.company}: ${t.career.prepReady}`, link: [href('career', { tab: 'pipeline', id: 'prep' }), t.career.prepLink] });
    if (it.stage === 'applied') {
      const quiet = days(it.heardAt ?? it.appliedAt);
      const contact = PEOPLE.find((p) => p.id === it.contactId);
      if (quiet >= STALE_DAYS) steps.push({ key: 'stale-' + it.id, tone: 'warn', text: `${it.title} · ${it.company}: ${t.career.stale(quiet)}`, link: contact ? [href('career', { tab: 'people', id: contact.id }), short(contact.name)] : undefined });
    }
  }
  for (const p of PEOPLE) {
    const r = rel(p.id), d = days(r.at), link: [string, string] = [href('career', { tab: 'people', id: p.id }), t.career.openPerson];
    if (r.stage === 'requested' && d >= FOLLOW_UP_DAYS) steps.push({ key: 'req-' + p.id, tone: 'warn', text: t.career.requestStale(short(p.name), d), link });
    if (r.stage === 'chatted' && !r.thanked) steps.push({ key: 'thx-' + p.id, tone: 'warn', text: t.career.thanksDue(short(p.name)), link });
    if (r.stage === 'chatted' && r.thanked && d >= FOLLOW_UP_DAYS) steps.push({ key: 'chat-' + p.id, tone: 'info', text: t.career.chatFollow(short(p.name), d), link });
  }
  return steps;
}

export function PipelinePanel({ focus }: { focus?: string | null }) {
  const { t } = useI18n();
  const { planSettings } = useApp();
  const { item, rel, days } = useCareerStatus();
  const steps = useNextSteps();
  const items = PIPELINE_SEED.map(item);
  const sent = items.filter((x) => SENT.includes(x.stage));
  const replied = sent.filter((x) => REPLIED.includes(x.stage));
  const week = sent.filter((x) => x.appliedAt && days(x.appliedAt) < 7).length;
  const goal = planSettings.habits.find((h) => h.id === 'job-applications')?.perWeek ?? 4;
  const linkedinGoal = planSettings.habits.find((h) => h.id === 'linkedin')?.perWeek ?? 5;
  const touches = PEOPLE.filter((p) => { const r = rel(p.id); return r.stage !== 'none' && r.at && days(r.at) < 7; }).length;
  const stats: [string, string][] = [
    [t.career.stats.applied, t.career.ofGoal(week, goal)],
    [t.career.stats.response, t.career.rate(replied.length, sent.length)],
    [t.career.stats.interviews, String(items.filter((x) => x.stage === 'interview' || x.stage === 'offer').length)],
    [t.career.stats.attention, String(steps.length)],
  ];
  const prepOpen = items.find((x) => x.id === PREP.roleId)?.stage === 'interview';

  return (
    <div className="min-w-0 space-y-8">
      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {stats.map(([k, v]) => <div key={k} className="panel p-3.5"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd></div>)}
      </dl>

      <Section title={t.career.attention} aside={t.career.contactsWeek(touches, linkedinGoal)}>
        {steps.length ? (
          <ul className="panel divide-y divide-line">
            {steps.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Tag tone={s.tone}>{s.tone === 'warn' ? t.career.staleTag : t.career.nextStep}</Tag>
                <span className="min-w-0 flex-1">{s.text}</span>
                {s.link && <a href={s.link[0]} className="text-[13px]">{s.link[1]} →</a>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{t.career.attentionEmpty}</p>}
      </Section>

      <Section title={t.career.tabs.pipeline}>
        <div className="relative overflow-x-auto pb-2">
          <div className="grid min-w-[880px] grid-cols-5 gap-3">
            {BOARD.map((stage) => {
              const list = items.filter((x) => x.stage === stage);
              return (
                <div key={stage} className="rounded-xl bg-soft p-2.5" aria-label={t.career.stage[stage]}>
                  <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{t.career.stage[stage]}<span className="font-mono text-xs text-muted">{list.length}</span></h3>
                  <div className="space-y-2">
                    {list.length ? list.map((x) => <BoardCard key={x.id} x={x} />) : <p className="px-1 py-3 text-xs text-muted">{t.career.emptyColumn}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {prepOpen && <PrepPack focus={focus === 'prep'} />}
    </div>
  );
}

function BoardCard({ x }: { x: Status }) {
  const { t, lang } = useI18n();
  const { setStage, days } = useCareerStatus();
  const stale = x.stage === 'applied' && days(x.heardAt ?? x.appliedAt) >= STALE_DAYS;
  const role = ROLES.find((r) => r.id === x.id);
  return (
    <article className="rounded-lg border border-line bg-raised p-3 text-sm">
      <p className="font-medium leading-snug">{x.title}</p>
      <p className="text-xs text-muted">{x.company.replace(/ \(.*\)$/, '')}</p>
      {x.appliedAt && <p className="mt-1 text-xs text-muted">{t.career.appliedAgo(days(x.appliedAt))}{x.heardAt ? ` · ${t.career.heardAgo(days(x.heardAt))}` : ''}</p>}
      {x.note && <p className="mt-1 text-xs">{x.note[lang]}</p>}
      {stale && <div className="mt-1.5"><Tag tone="warn">{t.career.staleTag}</Tag></div>}
      <label className="sr-only" htmlFor={`board-${x.id}`}>{t.career.stageLabel}</label>
      <select id={`board-${x.id}`} className="field mt-2 !min-h-8 !py-1 text-xs" value={x.stage} onChange={(e) => setStage(x.id, e.target.value as Stage)}>
        {STAGES.map((s) => <option key={s} value={s}>{t.career.stage[s]}</option>)}
      </select>
      {role && <a className="mt-1.5 inline-block text-xs" href={href('career', { tab: 'jobs', id: role.id })}>{t.career.openRole} →</a>}
    </article>
  );
}

export function PrepPack({ focus }: { focus: boolean }) {
  const { t, lang } = useI18n();
  const role = ROLES.find((r) => r.id === PREP.roleId)!;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'start' }); }, [focus]);
  return (
    <section ref={ref} id="prep" aria-label={t.career.prep} className="scroll-mt-24 rounded-xl border border-accent-line bg-accent-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-accent">{t.career.prep}</h2>
          <p className="text-sm">{t.career.prepFor(`${role.title} · ${role.company}`)}</p>
        </div>
        <Tag tone="info">AI</Tag>
      </div>
      <p className="mt-1 text-xs text-muted">{t.career.prepNote}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><h3 className="text-sm font-semibold">{t.career.format}</h3><p className="text-sm">{PREP.format[lang]}</p></div>
        <div><h3 className="text-sm font-semibold">{t.career.companyNotes}</h3><ul className="list-disc space-y-1 pl-5 text-sm">{PREP.company.map((x) => <li key={x.en}>{x[lang]}</li>)}</ul></div>
      </div>
      <h3 className="mt-5 mb-2 text-sm font-semibold">{t.career.questions}</h3>
      <ol className="space-y-2">
        {PREP.questions.map((q, i) => (
          <li key={q.q.en}>
            <details className="rounded-lg border border-line bg-raised p-3" open={i === 0}>
              <summary className="cursor-pointer text-sm font-medium">{i + 1}. {q.q[lang]}</summary>
              <p className="mt-1 text-xs text-muted">{t.career.fromReq}: {q.from[lang]}</p>
              <p className="mt-2 text-xs font-medium text-muted">{t.career.star}</p>
              <ul className="mt-1 space-y-0.5 text-[13px]">{q.story.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="mt-2 text-xs text-muted">{t.career.resumeLine}: “{q.quote}”</p>
            </details>
          </li>
        ))}
      </ol>
      <h3 className="mt-5 mb-1 text-sm font-semibold">{t.career.toAsk}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">{PREP.ask.map((x) => <li key={x.en}>{x[lang]}</li>)}</ul>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">{t.career.prepInPlan} <a href={href('plan')}>{t.career.openPlan} →</a></p>
    </section>
  );
}
