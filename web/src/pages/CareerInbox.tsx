import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, Section, Tabs, Tag } from '../components/ui';
import type { CareerFetch, Posting } from '../data/types';

// New postings from the watched public job boards, best rule score first. Tracking copies one into Applications; nothing is
// applied for. The score is a sort order with its reasons shown, not a verdict.
type Filter = 'new' | 'tracked' | 'dismissed';

export function JobsInbox({ onWatch }: { onWatch: () => void }) {
  const { progress, source, run, f, now } = useApp();
  const { t } = useI18n();
  const all = Object.values((progress.careerPosting || {}) as Record<string, Posting>);
  const last = progress.careerFetch?.last as CareerFetch | undefined;
  const watching = ((progress.careerSettings?.main as { watch?: unknown[] } | undefined)?.watch || []).length;
  const [filter, setFilter] = useState<Filter>('new');
  const [track, setTrack] = useState('all');
  const list = all.filter((p) => p.status === filter && (track === 'all' || p.track === track)).sort((a, b) => b.score - a.score || (b.postedAt || '').localeCompare(a.postedAt || ''));
  const act = (p: Posting, action: 'track' | 'dismiss' | 'restore') => run(() => source.actOnPosting!(p.id, action), t.inbox.done[action]);
  const refresh = () => run(() => source.refreshCareer!(), (r) => (r.skipped ? t.inbox.noWatch : t.inbox.refreshed(r.found ?? 0)));
  const failed = last?.boards.filter((b) => b.status !== 'ok') || [];
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{last ? t.inbox.lastRead(f.ago(last.at, now), last.boards.length) : t.inbox.neverRead}</p>
        <button type="button" className="btn" onClick={refresh} disabled={!watching}>{t.inbox.refresh}</button>
      </div>
      {!!failed.length && (
        <ul className="rounded-xl border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-warn">{failed.map((b) => <li key={b.ats + b.slug}>{b.error}</li>)}</ul>
      )}
      <Tabs label={t.inbox.title} value={filter} onChange={setFilter} items={(['new', 'tracked', 'dismissed'] as Filter[]).map((x) => [x, t.inbox.filter[x], all.filter((p) => p.status === x).length] as [Filter, string, number])} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="inbox-track" className="text-muted">{t.tracker.fields.track}</label>
        <select id="inbox-track" className="field !min-h-9 !w-auto !py-1 text-sm" value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="all">{t.inbox.allTracks}</option>{Object.entries(t.tracker.track).map(([x, label]) => <option key={x} value={x}>{label}</option>)}
        </select>
      </div>
      <Section title={t.inbox.title} aside={t.inbox.scoreNote}>
        {!watching ? <Empty action={<button type="button" className="btn" onClick={onWatch}>{t.inbox.goWatch}</button>}>{t.inbox.noWatch}</Empty>
          : !list.length ? <Empty>{filter === 'new' ? t.inbox.emptyNew : t.inbox.empty}</Empty> : (
          <ul className="space-y-3">
            {list.map((p) => (
              <li key={p.id} className="panel flex flex-wrap items-start gap-x-4 gap-y-2 p-3.5 text-sm">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg font-mono text-sm font-semibold ${p.score >= 70 ? 'bg-ok-soft text-ok' : p.score >= 50 ? 'bg-accent-soft text-accent-ink' : 'bg-soft text-muted'}`} aria-label={t.inbox.score(p.score)}>{p.score}</span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-semibold leading-snug">{p.title}</p>
                  <p className="text-xs text-muted">{[p.company, p.location || t.tracker.market[p.market as keyof typeof t.tracker.market], p.postedAt ? t.inbox.posted(p.postedAt.slice(0, 10)) : ''].filter(Boolean).join(' · ')}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{p.reasons.map((r) => <Tag key={r} tone={r === 'senior' || r === 'intern' ? 'warn' : 'neutral'}>{reason(r, t)}</Tag>)}</div>
                  {p.summary && <p className="mt-1.5 line-clamp-2 text-[13px] text-muted">{p.summary}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <External url={p.url} className="text-[13px]">{t.tracker.posting}</External>
                  {p.status === 'new' && <><button type="button" className="btn btn-primary !min-h-9 text-xs" onClick={() => act(p, 'track')}>{t.inbox.track}</button><button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => act(p, 'dismiss')}>{t.inbox.dismiss}</button></>}
                  {p.status === 'dismissed' && <button type="button" className="btn btn-quiet !min-h-9 text-xs" onClick={() => act(p, 'restore')}>{t.inbox.restore}</button>}
                  {p.status === 'tracked' && <Tag tone="info">{t.inbox.inTracker}</Tag>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function reason(r: string, t: ReturnType<typeof useI18n>['t']) {
  const [k, v] = r.split(':');
  if (k === 'track') return t.tracker.track[v as keyof typeof t.tracker.track] ?? v;
  if (k === 'place' || k === 'keyword') return v;
  return t.inbox.reason[k as keyof typeof t.inbox.reason] ?? r;
}
