import type { Messages } from '../i18n/messages';

// All times render in the snapshot's timezone, not the viewer's, because deadlines are defined there.
export function makeFormat(timezone: string, locale: string, t: Messages) {
  const zh = locale.startsWith('zh');
  const time = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hourCycle: zh ? 'h23' : 'h12' });
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' });
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'short' });
  const long = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' });
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const ok = (x?: string | null) => !!x && Number.isFinite(Date.parse(x));
  const dayKey = (x: string | number | Date) => key.format(new Date(x));

  return {
    dayKey,
    time: (x?: string | null) => (ok(x) ? time.format(new Date(x!)) : t.common.unknown),
    hm: (x?: string | null) => (ok(x) ? hm.format(new Date(x!)) : '--:--'),
    day: (x?: string | null) => (ok(x) ? day.format(new Date(x!)) : t.common.unknown),
    long: (x: string | number | Date) => long.format(new Date(x)),
    weekday: (x: string | number | Date) => weekday.format(new Date(x)),
    /** "Wed 11:59 PM" within a week, otherwise "Oct 30, 11:59 PM". */
    when(x?: string | null, now = new Date()) {
      if (!ok(x)) return t.common.noDue;
      const ms = Date.parse(x!) - +now;
      const w = Math.abs(ms) < 6 * 86400000 ? weekday.format(new Date(x!)) : new Intl.DateTimeFormat(locale, { timeZone: timezone, month: 'short', day: 'numeric' }).format(new Date(x!));
      return `${w} ${time.format(new Date(x!))}`;
    },
    ago(x?: string | null, now = new Date()) {
      if (!ok(x)) return t.common.unknown;
      const m = Math.max(0, Math.round((+now - Date.parse(x!)) / 60000));
      if (m < 60) return t.common.ago(m, 'min');
      if (m < 48 * 60) return t.common.ago(Math.round(m / 60), 'h');
      return t.common.ago(Math.round(m / 1440), 'd');
    },
    duration(min?: number | null) {
      if (!min || !Number.isFinite(min)) return t.common.unknown;
      return min < 60 ? t.common.minutes(min) : t.common.hoursMinutes(Math.floor(min / 60), min % 60);
    },
  };
}

export type Format = ReturnType<typeof makeFormat>;

export function safeUrl(url?: string) {
  try {
    const u = new URL(url || '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
