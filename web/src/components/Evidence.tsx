import { useEffect, useRef, type ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href } from '../lib/router';
import { Dot, External, Tag, sourceTone } from './ui';
import type { Sentence } from '../data/ai';

/** Numbers each cited record once, in order of first use, so the same source keeps the same number across sentences. */
export function citationNumbers(sentences: Sentence[]) {
  const order = new Map<string, number>();
  for (const s of sentences) for (const c of s.cites) if (!order.has(c)) order.set(c, order.size + 1);
  return order;
}

/** One sentence with its citation chips. A chip opens the cited records in the evidence panel, inside the app. */
export function CitedSentence({ s, numbers, onOpen }: { s: Sentence; numbers: Map<string, number>; onOpen: (refs: string[]) => void }) {
  const { t } = useI18n();
  return (
    <span>
      {s.text}
      {s.cites.map((c) => (
        <button key={c} type="button" onClick={() => onOpen([c])} aria-label={t.ai.cite(numbers.get(c) ?? 0)}
          className="ml-1 inline-flex min-h-6 min-w-6 -translate-y-0.5 items-center justify-center rounded-md border border-accent-line bg-raised px-1 align-middle font-mono text-[11px] text-accent hover:bg-accent-soft">
          {numbers.get(c)}
        </button>
      ))}{' '}
    </span>
  );
}

/** Side panel showing the records behind a citation, read from the same snapshot the page uses. */
export function EvidencePanel({ refs, onClose }: { refs: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); restore.current?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30 animate-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.ai.evidence}
        className="animate-rise h-full w-full max-w-md overflow-y-auto border-l border-line bg-raised p-5 shadow-2xl outline-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t.ai.evidence}</h2>
          <button type="button" className="btn" onClick={onClose}>{t.common.close}</button>
        </div>
        <div className="space-y-3">{refs.map((r) => <RecordCard key={r} reference={r} onNavigate={onClose} />)}</div>
        <p className="mt-4 text-xs text-muted">{t.ai.evidenceNote}</p>
      </div>
    </div>
  );
}

function RecordCard({ reference, onNavigate }: { reference: string; onNavigate: () => void }) {
  const { snapshot: d, f, now, workStatus } = useApp();
  const { t } = useI18n();
  const [kind, ...rest] = reference.split(':');
  const id = rest.join(':');
  const label = t.ai.kinds[kind as keyof typeof t.ai.kinds] ?? kind;
  let body: ReactNode = <p className="text-sm text-danger">{t.ai.missingRecord}</p>;
  if (kind === 'assignment') {
    const a = d.assignments.find((x) => x.id === id);
    if (a) body = <>
      <p className="font-medium">{a.course} · {a.title}</p>
      <p className="text-sm text-muted">{a.dueAt ? t.common.due(f.when(a.dueAt, now)) : t.common.noDue} · {a.requirement === 'choice' ? t.status.optional : t.status.required} · {workStatus(a.status)}</p>
      {a.evidence && <p className="mt-1 text-sm">{a.evidence}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-[13px]"><a href={href('coursework', { open: a.id })} onClick={onNavigate}>{t.ai.openRecord} →</a><External url={a.source}>{t.common.source}</External></div>
    </>;
  } else if (kind === 'source') {
    const s = d.sources.find((x) => x.id === id);
    if (s) body = <>
      <p className="flex items-center gap-2 font-medium"><Dot tone={sourceTone(s.status)} />{s.name}</p>
      <p className="text-sm text-muted">{t.status[s.status as 'ok'] ?? s.status} · {t.health.lastGood(f.ago(s.lastSuccess, now))}</p>
      {s.note && <p className="mt-1 text-sm">{s.note}</p>}
      <div className="mt-2 text-[13px]"><a href={href('health')} onClick={onNavigate}>{t.ai.openRecord} →</a></div>
    </>;
  } else if (kind === 'event') {
    const e = d.events.find((x) => x.id === id);
    if (e) body = <><p className="font-medium">{e.title}</p><p className="font-mono text-sm text-muted">{f.day(e.start)} {f.hm(e.start)}–{f.hm(e.end)}{e.calendar ? ` · ${e.calendar}` : ''}</p></>;
  } else if (kind === 'email') {
    const m = d.email?.messages?.find((x) => x.id === id);
    if (m) body = <>
      <p className="font-medium">{m.subject}</p>
      <p className="text-sm text-muted">{m.from.replace(/\s*<[^>]*>/, '')} · {f.ago(m.receivedAt, now)}</p>
      {m.snippet && <p className="mt-1 text-sm">{m.snippet}</p>}
      <div className="mt-2 text-[13px]"><a href={href('email')} onClick={onNavigate}>{t.ai.openRecord} →</a></div>
    </>;
  } else if (kind === 'priority') {
    const p = d.priorities[Number(id) - 1];
    if (p) body = <><p className="font-medium">{p.title}</p>{p.detail && <p className="text-sm text-muted">{p.detail}</p>}<div className="mt-2 text-[13px]"><External url={p.source}>{t.common.source}</External></div></>;
  } else if (kind === 'coverage') {
    const c = d.calendarCoverage;
    if (c) body = <><p className="font-medium">{c.complete ? t.health.complete : t.health.incomplete}</p><p className="text-sm text-muted">{f.day(c.start)} – {f.day(c.end)} · {t.common.checkedAt(f.ago(c.checkedAt, now))}</p>{c.note && <p className="mt-1 text-sm">{c.note}</p>}</>;
  }
  return (
    <section className="panel p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2"><Tag>{label}</Tag><span className="font-mono text-[11px] text-muted">{reference}</span></div>
      {body}
    </section>
  );
}
