import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Core, Demo, Phase2 } from '../lib/shared';
import { fitText, layoutLanes } from '../lib/overlap';
import { CALENDAR_COLORS } from '../lib/calendarColors';
import type { Proposal } from '../data/types';

interface Block { id: string; title: string; start: number; end: number; kind: 'event' | 'draft' | 'done' | 'gone'; locked?: boolean; p?: Proposal }
interface Drag { id: string; mode: 'move' | 'resize'; y0: number; start: number; end: number; dy: number }

const STEP = 5 * 60000;
const snap = (ms: number) => Math.round(ms / STEP) * STEP;

/**
 * The editable day for the planning page: calendar events are fixed (grey); unstarted Dayweave blocks can be dragged to move
 * and their lower edge dragged to change the length, on a 5-minute grid. Each drop is one edit, which locks the block.
 */
export function PlanTimeline({ date, startHour, onChange }: { date: string; startHour: number; onChange: (p: Proposal, start: number, end: number) => void }) {
  const { snapshot: d, f, now, started, progress, ownEvents } = useApp();
  const { t } = useI18n();
  const scale = 1.1;
  const from = Date.parse(Core.zonedISO(date, String(startHour).padStart(2, '0') + ':00'));
  const to = Date.parse(Core.zonedISO(Demo.addDays(date, 1), '00:00'));
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);
  const inDay = (e: { start: string; end: string }) => Date.parse(e.end) > from && Date.parse(e.start) < to;
  const span = (e: { start: string; end: string }) => ({ start: Math.max(from, Date.parse(e.start)), end: Math.min(to, Date.parse(e.end)) });

  // Removals are not drawn; the written block they take off the calendar is shown struck through until it is gone.
  const sup = Phase2.superseded(d, progress.dismissed ?? {}) as Map<string, Proposal>;
  const raw: Block[] = [
    ...d.events.filter((e) => e.busy !== false && !e.allDay && inDay(e) && !ownEvents.has(e.id)).map((e) => ({ id: e.id, title: e.title, kind: 'event' as const, ...span(e) })),
    ...d.proposals.filter((p) => inDay(p) && !progress.dismissed?.[p.id] && p.action !== 'delete' && !(sup.has(p.id) && started(sup.get(p.id)!.id)))
      .map((p) => ({ id: p.id, title: p.title, kind: sup.has(p.id) ? ('gone' as const) : started(p.id) ? ('done' as const) : ('draft' as const), locked: !!p.locked, p, ...span(p) })),
  ];
  // While dragging, the block is drawn at its new place so the lanes and the time label follow it.
  const shown = raw.map((b) => {
    if (!drag || b.id !== drag.id) return b;
    const delta = snap(drag.dy / scale * 60000);
    return drag.mode === 'move' ? { ...b, start: drag.start + delta, end: drag.end + delta } : { ...b, end: Math.max(drag.start + 15 * 60000, drag.end + delta) };
  });
  const blocks = layoutLanes(shown);
  const height = Math.round(((to - from) / 60000) * scale);
  const y = (ms: number) => Math.round(((ms - from) / 60000) * scale);
  const hours = Array.from({ length: 24 - startHour }, (_, i) => i);
  const nowY = +now > from && +now < to ? y(+now) : null;
  const style = { event: 'bg-event border-l-[3px] border-l-event-edge text-ink', draft: 'bg-accent-soft border-[1.5px] border-dashed border-accent text-accent-ink', done: 'bg-accent text-on-accent', gone: 'bg-soft border border-dashed border-line text-muted line-through' };

  const begin = (b: Block, mode: Drag['mode']) => (e: ReactPointerEvent) => {
    if (b.kind !== 'draft' || !b.p) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    moved.current = false;
    const p = b.p;
    setDrag({ id: b.id, mode, y0: e.clientY, start: Date.parse(p.start), end: Date.parse(p.end), dy: 0 });
  };
  const move = (e: ReactPointerEvent) => { if (!drag) return; moved.current = true; setDrag({ ...drag, dy: e.clientY - drag.y0 }); };
  const end = () => {
    if (!drag) return;
    const b = shown.find((x) => x.id === drag.id), p = raw.find((x) => x.id === drag.id)?.p;
    setDrag(null);
    if (b && p && moved.current && (b.start !== Date.parse(p.start) || b.end !== Date.parse(p.end))) onChange(p, b.start, b.end);
  };

  return (
    <div className="relative flex select-none" style={{ height }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
      <div className="relative w-14 shrink-0" aria-hidden="true">
        {hours.map((i) => <span key={i} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-muted" style={{ top: y(from + i * 3600000) }}>{String(startHour + i).padStart(2, '0')}:00</span>)}
      </div>
      <ol className="hatch relative flex-1 overflow-hidden rounded-lg border border-line" aria-label={f.long(Date.parse(Core.zonedISO(date, '12:00')))}>
        {hours.map((i) => <li key={'h' + i} aria-hidden="true" className="absolute inset-x-0 border-t border-grid" style={{ top: y(from + i * 3600000) }} />)}
        {blocks.map((b) => {
          const h = Math.max(y(b.end) - y(b.start), 14);
          const w = `((100% - ${8 + (b.cols - 1) * 3}px) / ${b.cols})`;
          const times = `${f.hm(new Date(b.start).toISOString())}–${f.hm(new Date(b.end).toISOString())}`;
          const editable = b.kind === 'draft';
          const fit = fitText(h, b.cols, 4, b.kind === 'draft' ? 3 : 0);
          return (
            <li key={b.id} title={`${times} ${b.title}`}
              className={`absolute overflow-hidden rounded-md px-2 ${fit.tight ? 'py-0' : 'py-0.5'} ${style[b.kind]} ${editable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${drag?.id === b.id ? 'z-10 shadow-lg' : ''}`}
              style={{ top: y(b.start), height: h, width: `calc(${w})`, left: `calc(4px + ${b.col} * (${w} + 3px))`, ...(b.p?.color ? { borderLeft: `4px solid ${CALENDAR_COLORS[b.p.color]}` } : {}) }}
              onPointerDown={begin(b, 'move')}>
              <span className={`block font-medium ${fit.title}`} style={fit.style}>{b.locked && <span aria-label={t.plan.locked}>🔒 </span>}{b.title}</span>
              {fit.times && <span className="block truncate text-[11px] leading-4 opacity-80">{times}</span>}
              {editable && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={begin(b, 'resize')} />}
            </li>
          );
        })}
        {nowY !== null && <li aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t-2 border-danger" style={{ top: nowY }} />}
      </ol>
    </div>
  );
}
