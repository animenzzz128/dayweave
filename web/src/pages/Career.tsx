import { useState, type ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, PageHeader, Section, Tabs, Tag } from '../components/ui';
import { JobsPanel, PeoplePanel, SoonBanner } from './CareerPreview';
import { PipelinePanel } from './CareerPipeline';
import { Phase3 } from '../lib/shared';
import type { Person, Role } from '../data/types';

const TABS = ['jobs', 'pipeline', 'people', 'research'] as const;
type Tab = (typeof TABS)[number];

// The public demo previews the planned job match and people panels; the private instance shows only the assistant's research.
export function CareerPage({ params }: { params: URLSearchParams }) {
  const { source } = useApp();
  const { t } = useI18n();
  const asked = params.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(asked && TABS.includes(asked) ? asked : 'jobs');
  if (source.mode !== 'demo') return <><PageHeader title={t.career.title} subtitle={t.career.subtitle} /><Research /></>;
  const focus = params.get('id');
  return (
    <>
      <PageHeader title={t.career.title} subtitle={t.career.subtitle} />
      <Tabs label={t.career.title} value={tab} onChange={setTab} items={TABS.map((x) => [x, t.career.tabs[x]] as [Tab, string])} />
      {tab === 'jobs' && <><SoonBanner intro={t.career.jobsIntro} /><JobsPanel focus={focus} /></>}
      {tab === 'pipeline' && <><SoonBanner intro={t.career.pipelineIntro} /><PipelinePanel focus={focus} /></>}
      {tab === 'people' && <><SoonBanner intro={t.career.peopleIntro} /><PeoplePanel focus={focus} /></>}
      {tab === 'research' && <Research />}
    </>
  );
}

function Research() {
  const { snapshot: d, progress, f, now } = useApp();
  const { t } = useI18n();
  const c = d.career;
  if (!c?.enabled) return <Empty>{t.career.disabled}</Empty>;
  const status = (x: { id: string }) => progress.career?.[x.id]?.status;
  const roles: Role[] = Phase3.feedbackOrder(c.roles || [], status);
  const people: Person[] = Phase3.feedbackOrder(c.candidates || [], status);

  return (
    <>
      {c.note && <p className="-mt-3 mb-6 text-sm text-muted">{c.note}</p>}
      <div className="grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="space-y-8">
          <Section title={t.career.roles}>
            <div className="space-y-3">
              {roles.map((r) => {
                const issues: string[] = Phase3.eligibility(r, c.profile || {});
                return (
                  <Card key={r.id} item={r} title={r.title} detail={r.fit} evidence={r.evidence} meta={`${r.market}${r.startYear ? ` · ${r.startYear}` : ''} · ${t.career.checked(f.ago(r.checkedAt, now))}`}>
                    <div className="flex flex-wrap gap-1.5">{issues.length ? issues.map((x) => <Tag key={x} tone="warn">{x}</Tag>) : <Tag tone="ok">{t.career.eligible}</Tag>}</div>
                  </Card>
                );
              })}
            </div>
          </Section>
        </div>
        <div className="space-y-8">
          <Section title={t.career.people}>
            <div className="space-y-3">
              {people.map((p) => <Card key={p.id} item={p} title={p.name} detail={p.reason} evidence={p.evidence} meta={p.market || ''} />)}
            </div>
          </Section>
          {!!c.tracks?.length && (
            <Section title={t.career.tracks}>
              <ul className="space-y-2 text-sm">{c.tracks.map((x) => <li key={x.title}><span className="font-medium">{x.title}</span>{x.reason && <span className="block text-muted">{x.reason}</span>}</li>)}</ul>
            </Section>
          )}
          {!!c.unknowns?.length && (
            <Section title={t.career.unknowns}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{c.unknowns.map((x) => <li key={x}>{x}</li>)}</ul>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Card({ item, title, detail, evidence, meta, children }: { item: { id: string; source?: string }; title: string; detail?: string; evidence?: string; meta: string; children?: ReactNode }) {
  const { progress, source, run } = useApp();
  const { t } = useI18n();
  const s = progress.career?.[item.id]?.status;
  const set = (status: string) => run(() => source.saveProgress('career', item.id, { status, at: new Date().toISOString() }));
  return (
    <article className={`panel p-4 ${s === 'dismissed' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted">{meta}</p>
        </div>
        {s === 'saved' && <Tag tone="info">{t.career.savedByYou}</Tag>}
        {s === 'dismissed' && <Tag>{t.career.dismissedByYou}</Tag>}
      </div>
      {detail && <p className="mt-2 text-sm">{detail}</p>}
      {evidence && <p className="mt-1 text-[13px] text-muted">{evidence}</p>}
      {children && <div className="mt-2.5">{children}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {s === 'saved' || s === 'dismissed'
          ? <button type="button" className="btn" onClick={() => set('reset')}>{t.career.restore}</button>
          : <><button type="button" className="btn" onClick={() => set('saved')}>{t.career.save}</button><button type="button" className="btn" onClick={() => set('dismissed')}>{t.career.dismiss}</button></>}
        <External url={item.source} className="ml-auto text-[13px]">{t.common.source}</External>
      </div>
    </article>
  );
}
