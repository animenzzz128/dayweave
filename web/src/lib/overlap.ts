/**
 * Side-by-side layout for overlapping timeline blocks, like a calendar day view.
 * Blocks that overlap (directly or through a chain) form a cluster; each block takes
 * the first free column in its cluster and every block in that cluster gets the
 * cluster's column count, so overlapping blocks never cover each other.
 */
export interface Span { start: number; end: number }
export interface Lane { col: number; cols: number }

export function layoutLanes<T extends Span>(items: T[]): (T & Lane)[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & Lane)[] = [];
  let cluster: (T & Lane)[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const b of cluster) b.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.start);
    if (col < 0) col = colEnds.length;
    colEnds[col] = item.end;
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}

/** Total milliseconds covered by at least one span (overlaps counted once). */
export function coveredMs(items: Span[]): number {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const { start, end } of sorted) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else curEnd = Math.max(curEnd, end);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/**
 * What text fits in a timeline block h pixels tall (its drawn, border-box height), so a line is never cut through: side-by-side
 * blocks wrap the title to two lines when there is room, the time line shows only below a whole title, and short blocks drop
 * their padding and shrink the title line to the height left. pad is the block's vertical padding, edge its vertical borders.
 */
export function fitText(h: number, cols: number, pad: number, edge: number): { title: string; style?: { fontSize: number; lineHeight: string }; times: boolean; tight: boolean } {
  const tight = h - pad - edge < 16;
  if (tight) {
    // No padding: the title gets every pixel inside the borders, at most one 14px line; below 9px nothing fits, and the
    // block's title attribute and label still name it.
    const line = Math.min(14, Math.floor(h - edge));
    return line < 9
      ? { title: 'hidden', times: false, tight }
      : { title: 'truncate', style: { fontSize: Math.min(11, line - 1), lineHeight: line + 'px' }, times: false, tight };
  }
  const lines = Math.floor((h - pad - edge) / 16);
  const wrap = cols > 1 && lines >= 2;
  return {
    title: wrap ? 'line-clamp-2 break-words text-[13px] leading-4' : 'truncate text-[13px] leading-4',
    times: lines >= (wrap ? 3 : 2),
    tight,
  };
}
