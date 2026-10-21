import { useEffect, useState } from 'react';

// Hash routes keep the static demo working on GitHub Pages, where unknown paths would 404 on reload.
export const ROUTES = ['today', 'coursework', 'week', 'review', 'career', 'email', 'health'] as const;
export type Route = (typeof ROUTES)[number];

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
