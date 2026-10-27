import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Core, Demo } from '../lib/shared';
import { href } from '../lib/router';
import { coveredMs, layoutLanes } from '../lib/overlap';
import type { CalendarEvent, Proposal } from '../data/types';

interface Block { id: string; title: string; start: number; end: number; kind: 'event' | 'proposal' | 'done'; meta?: string }

/** The 09:00–24:00 planning day (from 07:00 when a weekly-goal block sits earlier): hatched = free, grey = calendar, dashed blue = AI proposal, solid blue = approved. */
export function DayTimeline({ date, scale = 0.9, compact = false }: { date: string; scale?: number; compact?: boolean }) {
  const { snapshot: d, f, now, started, progress } = useApp();
  const { t } = useI18n();
  const at = (hm: string) => Date.parse(Core.zonedISO(date, hm));
  const early = d.proposals.some((p) => !progress.dismissed?.[p.id] && Date.parse(p.start) < at('09:00') && Date.parse(p.end) > at('07:00'));
  const startHour = early ? 7 : 9;
  const from = at(startHour === 7 ? '07:00' : '09:00');
  const to = Date.parse(Core.zonedISO(Demo.addDays(date, 1), '00:00'));
  const inDay = (e: CalendarEvent) => Date.parse(e.end) > from && Date.parse(e.start) < to;
  const clamp = (e: CalendarEvent) => ({ start: Math.max(from, Date.parse(e.start)), end: Math.min(to, Date.parse(e.end)) });

  const blocks = layoutLanes<Block>([
    ...d.events.filter((e) => e.busy !== false && !e.allDay && inDay(e)).map((e) => ({ id: e.id, title: e.title, kind: 'event' as const, ...clamp(e), meta: e.location })),
    ...d.proposals.filter((p: Proposal) => inDay(p) && !progress.dismissed?.[p.id]).map((p) => ({ id: p.id, title: p.title, kind: started(p.id) ? ('done' as const) : ('proposal' as const), ...clamp(p) })),
  ]);
  const allDay = d.events.filter((e) => e.allDay && inDay(e));
  // Without complete coverage a blank slot may hide an unread event, so it is not drawn as free time.
  const known = d.calendarCoverage?.complete === true;

  const height = Math.round(((to - from) / 60000) * scale);
  const y = (ms: number) => Math.round(((ms - from) / 60000) * scale);
  const hours = Array.from({ length: 24 - startHour }, (_, i) => i).filter((i) => !compact || i % 3 === 0);
  const busy = coveredMs(blocks);
  const freePct = Math.max(0, Math.round((1 - busy / (to - from)) * 100));
  const nowY = +now > from && +now < to ? y(+now) : null;

  const style = {
    event: 'bg-event border-l-[3px] border-l-event-edge text-ink',
    proposal: 'bg-accent-soft border-[1.5px] border-dashed border-accent text-accent-ink',
    done: 'bg-accent text-on-accent',
  };

  return (
    <div>
      {!known && !compact && <p role="note" className="mb-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">{t.today.calendarDown}</p>}
      {allDay.map((e) => <div key={e.id} className="mb-1 rounded-md bg-event px-2 py-1 text-xs">{e.title}</div>)}
      <div className="relative flex" style={{ height }}>
        <div className={`relative ${compact ? 'w-0' : 'w-14'} shrink-0`} aria-hidden="true">
          {!compact && hours.map((i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-muted" style={{ top: y(from + i * 3600000) }}>{String(startHour + i).padStart(2, '0')}:00</span>
          ))}
        </div>
        <ol className={`${known ? 'hatch' : 'bg-soft'} relative flex-1 overflow-hidden rounded-lg border ${known ? 'border-line' : 'border-dashed border-warn-edge'}`} aria-label={f.long(Date.parse(Core.zonedISO(date, '12:00')))}>
          {hours.map((i) => <li key={'h' + i} aria-hidden="true" className="absolute inset-x-0 border-t border-grid" style={{ top: y(from + i * 3600000) }} />)}
          {blocks.map((b) => {
            const h = Math.max(y(b.end) - y(b.start), 14);
            const label = `${f.hm(new Date(b.start).toISOString())}–${f.hm(new Date(b.end).toISOString())} ${b.title}`;
            const body = (
              <>
                <span className={`block ${b.cols > 1 ? 'line-clamp-2 break-words leading-tight' : 'truncate'} font-medium ${compact ? 'text-[11px]' : 'text-[13px]'}`}>{b.title}</span>
                {h > 42 && <span className={`block truncate text-[11px] ${b.kind === 'done' ? 'text-on-accent/85' : 'opacity-80'}`}>{f.hm(new Date(b.start).toISOString())}–{f.hm(new Date(b.end).toISOString())}{b.kind === 'proposal' ? ` · ${t.today.legendProposal}` : ''}</span>}
              </>
            );
            // Overlapping blocks share the width side by side instead of covering each other.
            const w = `((100% - ${8 + (b.cols - 1) * 3}px) / ${b.cols})`;
            const pos = { top: y(b.start) + 1, height: h - 2, left: `calc(4px + ${b.col} * (${w} + 3px))`, width: `calc${w}` };
            const cls = `absolute overflow-hidden rounded-md ${b.cols > 2 ? 'px-1' : 'px-2'} py-1 no-underline ${style[b.kind]}`;
            return (
              <li key={b.id} className="contents">
                {b.kind === 'proposal'
                  ? <a href={href('review', { id: b.id })} className={cls} style={pos} title={label} aria-label={label}>{body}</a>
                  : <div className={cls} style={pos} title={label} aria-label={label}>{body}</div>}
              </li>
            );
          })}
          {nowY !== null && <li aria-hidden="true" className="absolute inset-x-0 z-10 border-t-2 border-danger-dot" style={{ top: nowY }} />}
        </ol>
      </div>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-l-event-edge bg-event" />{t.today.legendEvent}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm border border-dashed border-accent bg-accent-soft" />{t.today.legendProposal}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-accent" />{t.today.legendDone}</span>
          <span className="flex items-center gap-1.5"><i className={`${known ? 'hatch' : 'bg-soft border-dashed'} inline-block h-3 w-3 rounded-sm border border-line`} />{known ? t.today.legendFree(freePct) : t.today.legendUnknown}</span>
        </div>
      )}
    </div>
  );
}
