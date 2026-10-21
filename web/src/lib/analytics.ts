// Cookie-free demo analytics through GoatCounter's count endpoint: no third-party script, no cookies, no storage and
// no personal data. Only the route name (never its query), the page title, the referrer, the screen width and a few
// named demo events are sent. Only the production demo build sets the endpoint (vite.config.ts); server mode never counts.
const ENDPOINT: string = __GOATCOUNTER_URL__;

function enabled() {
  if (!ENDPOINT || typeof window === 'undefined') return false;
  if (/^(localhost|127\.|\[::1\])/.test(window.location.hostname)) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack !== '1' && nav.globalPrivacyControl !== true;
}

function send(params: Record<string, string>) {
  if (!enabled()) return;
  const q = new URLSearchParams({ ...params, s: String(window.screen?.width || ''), rnd: Math.random().toString(36).slice(2) });
  // A plain image request: no CORS, no script from the count domain, and GoatCounter sets no cookies.
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = `${ENDPOINT}?${q}`;
}

let lastPath = '';
export function trackPage(route: string) {
  const p = '/' + route;
  if (p === lastPath) return;
  lastPath = p;
  send({ p, t: document.title, r: document.referrer ? new URL(document.referrer).origin : '' });
}

export function trackEvent(name: 'palette-open' | 'outage-on' | 'outage-off' | 'case-study-cta') {
  send({ p: name, t: name, e: 'true' });
}
