import { Core } from './shared';

/**
 * The first hour a day view draws: the hour of the planning day's start (`dayStart`, the saved rule), or earlier when a timed
 * calendar event or block that day begins before it, so an 08:30 class is never cut to the 09:00 edge. Never before 00:00.
 */
export function firstHour(date: string, dayStart: string, items: { start: string; end: string; allDay?: boolean }[]): number {
  const dayFrom = Date.parse(Core.zonedISO(date, '00:00'));
  const earliest = Math.min(Date.parse(Core.zonedISO(date, dayStart)),
    ...items.filter((e) => !e.allDay && Date.parse(e.end) > dayFrom && Date.parse(e.start) < dayFrom + 86400000).map((e) => Date.parse(e.start)));
  let h = Number(dayStart.slice(0, 2));
  while (h > 0 && earliest < Date.parse(Core.zonedISO(date, String(h).padStart(2, '0') + ':00'))) h--;
  return h;
}
