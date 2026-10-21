import type { ReactNode } from 'react';
import { safeUrl } from '../lib/format';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-[#bbf7d0]',
  warn: 'bg-warn-soft text-warn border-[#f3e2bf]',
  danger: 'bg-danger-soft text-danger border-[#f6d3c4]',
  info: 'bg-accent-soft text-accent-ink border-accent-line',
  neutral: 'bg-soft text-muted border-line',
};

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  const c = { ok: 'bg-[#16a34a]', warn: 'bg-[#d97706]', danger: 'bg-[#dc2626]', info: 'bg-accent', neutral: 'bg-[#9aa3b2]' }[tone];
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

export const sourceTone = (status: string): Tone => (status === 'ok' ? 'ok' : status === 'partial' ? 'warn' : 'danger');

export function External({ url, children, className = '' }: { url?: string; children: ReactNode; className?: string }) {
  const u = safeUrl(url);
  if (!u) return <span className={className}>{children}</span>;
  return <a href={u} target="_blank" rel="noopener noreferrer" className={className}>{children}<span aria-hidden="true"> ↗</span></a>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={title}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <span className="text-xs text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ items, value, onChange, label }: { items: [T, string, number?][]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex flex-wrap gap-1.5">
      {items.map(([v, text, count]) => (
        <button key={v} type="button" role="tab" aria-selected={v === value} onClick={() => onChange(v)}
          className={`min-h-9 rounded-full border px-3.5 text-sm ${v === value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:bg-soft'}`}>
          {text}{count !== undefined && <span className={`ml-1.5 font-mono text-xs ${v === value ? 'text-white/80' : 'text-muted'}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
