import { useEffect, useState } from 'react';

// Hash routes keep the static demo working on GitHub Pages, where unknown paths would 404 on reload.
export const NAV = ['today', 'plan', 'coursework', 'week', 'review', 'career', 'email', 'health'] as const;
export const ROUTES = [...NAV, 'case-study'] as const;
export type Route = (typeof ROUTES)[number];
// Phones get a bottom tab bar with the daily pages; everything else sits behind "More" on every width.
export const TABS = ['today', 'plan', 'review', 'coursework'] as const satisfies readonly Route[];
export const DESKTOP_NAV = ['today', 'plan', 'coursework', 'week', 'review'] as const satisfies readonly Route[];
export const MORE = ['career', 'email', 'health', 'case-study'] as const satisfies readonly Route[];

export interface Location { route: Route; params: URLSearchParams }

function parse(): Location {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?');
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : 'today';
  return { route, params: new URLSearchParams(query || '') };
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    const on = () => { setLoc(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}

export const href = (route: Route, params?: Record<string, string>) => {
  const q = params ? new URLSearchParams(params).toString() : '';
  return `#/${route}${q ? '?' + q : ''}`;
};
