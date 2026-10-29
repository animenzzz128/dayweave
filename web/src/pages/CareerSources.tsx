import { useState, type FormEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, Section, Tabs, Tag, type Tone } from '../components/ui';
import { BOARD_HINT, SOURCES, type Region, type Tier } from '../data/careerSources';
import type { CareerSettings } from '../data/types';

// The source library: where postings come from, how far Dayweave can help with each, and the companies whose public job
// boards are read once a day. Turning a source off only hides it here.
const REGIONS: Region[] = ['overseas', 'china', 'hksg'];
const TIER_TONE: Record<Tier, Tone> = { A: 'ok', B: 'warn', C: 'neutral' };
const EMPTY: CareerSettings = { watch: [], keywords: [], sources: {} };

export function useCareerSettings() {
  const { progress, source, run } = useApp();
  const settings = (progress.careerSettings?.main as CareerSettings | undefined) ?? EMPTY;
  const save = (next: CareerSettings, done: string) => run(() => source.saveCareerSettings!(next), done);
  return { settings, save };
}

export function SourcesTracker() {
  const { t, lang } = useI18n();
  const { settings, save } = useCareerSettings();
  const [region, setRegion] = useState<Region>('overseas');
  const using = (id: string) => settings.sources[id] !== false;
  const toggle = (id: string) => save({ ...settings, sources: { ...settings.sources, [id]: !using(id) } }, using(id) ? t.sources.hidden : t.sources.shown);
  const list = SOURCES.filter((x) => x.region === region).sort((a, b) => Number(!using(a.id)) - Number(!using(b.id)));
  return (
    <div className="min-w-0 space-y-8">
      <WatchList />
      <Section title={t.sources.library}>
        <ul className="mb-3 space-y-1 text-[13px] text-muted">
          {(['A', 'B', 'C'] as Tier[]).map((x) => <li key={x} className="flex flex-wrap items-center gap-2"><Tag tone={TIER_TONE[x]}>{t.sources.tier[x]}</Tag>{t.sources.tierNote[x]}</li>)}
        </ul>
        <Tabs label={t.sources.library} value={region} onChange={setRegion} items={REGIONS.map((r) => [r, t.sources.region[r], SOURCES.filter((x) => x.region === r).length] as [Region, string, number])} />
        <ul className="panel divide-y divide-line">
          {list.map((x) => (
            <li key={x.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 text-sm ${using(x.id) ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex flex-wrap items-center gap-2 font-medium">{x.name}<Tag tone={TIER_TONE[x.tier]}>{t.sources.tier[x.tier]}</Tag>{x.planned && <Tag>{t.sources.planned}</Tag>}</p>
                <p className="mt-0.5 text-[13px] text-muted">{x.how[lang]}</p>
              </div>
              <div className="flex items-center gap-2">
                <External url={x.url} className="text-[13px]">{t.sources.open}</External>
                <button type="button" className="btn btn-quiet !min-h-9 text-xs" aria-pressed={using(x.id)} onClick={() => toggle(x.id)}>{using(x.id) ? t.sources.notUsing : t.sources.using}</button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-muted">{t.sources.campusNote}</p>
      </Section>
    </div>
  );
}

function WatchList() {
  const { t } = useI18n();
  const { settings, save } = useCareerSettings();
  const [v, setV] = useState({ ats: 'greenhouse', slug: '', company: '', market: 'US' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await save({ ...settings, watch: [...settings.watch, { ...v, slug: v.slug.trim(), company: v.company.trim() || v.slug.trim() }] }, t.sources.watchAdded)) setV((x) => ({ ...x, slug: '', company: '' }));
  };
  const remove = (i: number) => save({ ...settings, watch: settings.watch.filter((_, j) => j !== i) }, t.sources.watchRemoved);
  return (
    <Section title={t.sources.watch} aside={t.sources.watchCount(settings.watch.length)}>
      <p className="mb-3 text-[13px] text-muted">{t.sources.watchNote}</p>
      {settings.watch.length ? (
        <ul className="panel mb-4 divide-y divide-line">
          {settings.watch.map((w, i) => (
            <li key={w.ats + w.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 font-medium">{w.company}</span>
              <span className="font-mono text-xs text-muted">{BOARD_HINT[w.ats].replace('<name>', w.slug)}</span>
              <Tag>{t.tracker.market[w.market as keyof typeof t.tracker.market]}</Tag>
              <button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => remove(i)}>{t.tracker.remove}</button>
            </li>
          ))}
        </ul>
      ) : <div className="mb-4"><Empty compact>{t.sources.watchEmpty}</Empty></div>}
      <form onSubmit={add} className="panel flex flex-wrap items-end gap-3 p-4" aria-label={t.sources.watchAdd}>
        <div className="min-w-0 flex-1 basis-36"><label className="label" htmlFor="watch-ats">{t.sources.board}</label>
          <select id="watch-ats" className="field" value={v.ats} onChange={set('ats')}>{Object.keys(BOARD_HINT).map((x) => <option key={x} value={x}>{SOURCES.find((s) => s.id === x)?.name}</option>)}</select></div>
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor="watch-slug">{t.sources.boardName}</label><input id="watch-slug" className="field font-mono" required maxLength={80} placeholder="acme" value={v.slug} onChange={set('slug')} /><p className="mt-1 font-mono text-xs text-muted">{BOARD_HINT[v.ats]}</p></div>
        <div className="min-w-0 flex-1 basis-40"><label className="label" htmlFor="watch-company">{t.tracker.fields.company}</label><input id="watch-company" className="field" maxLength={120} value={v.company} onChange={set('company')} /></div>
        <div className="min-w-0 flex-1 basis-32"><label className="label" htmlFor="watch-market">{t.tracker.fields.market}</label>
          <select id="watch-market" className="field" value={v.market} onChange={set('market')}>{Object.entries(t.tracker.market).map(([x, label]) => <option key={x} value={x}>{label}</option>)}</select></div>
        <button type="submit" className="btn btn-primary">{t.sources.watchAdd}</button>
      </form>
    </Section>
  );
}
