import { Component, type ReactNode } from 'react';
import { safeUrl } from '../lib/format';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
  info: 'bg-accent-soft text-accent-ink border-accent-line',
  neutral: 'bg-soft text-muted border-line',
};

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  const c = { ok: 'bg-ok-dot', warn: 'bg-warn-dot', danger: 'bg-danger-dot', info: 'bg-accent', neutral: 'bg-neutral-dot' }[tone];
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
          className={`min-h-9 rounded-full border px-3.5 text-sm ${v === value ? 'border-ink bg-ink text-on-ink' : 'border-line bg-raised text-ink hover:bg-soft'}`}>
          {text}{count !== undefined && <span className={`ml-1.5 font-mono text-xs ${v === value ? 'text-on-ink/80' : 'text-muted'}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

/** An empty list says so plainly, and points to the next useful step when there is one. */
export function Empty({ children, action, compact = false }: { children: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`animate-fade flex flex-col items-center gap-2 rounded-xl border border-dashed border-line text-center text-sm text-muted ${compact ? 'px-4 py-4' : 'px-4 py-8'}`}>
      {!compact && <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="text-neutral-dot"><path d="M4 11c5 0 5 9 10 9s5-9 10-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** A failure is shown with what happened and a way out, never as an empty page. */
export function ErrorState({ title, message, hint, onRetry, retry }: { title: string; message?: string; hint?: string; onRetry?: () => void; retry?: string }) {
  return (
    <div role="alert" className="animate-rise mx-auto max-w-xl rounded-[14px] border border-danger-line bg-danger-soft p-6">
      <div className="flex items-center gap-2"><Dot tone="danger" /><h1 className="text-lg font-semibold text-ink">{title}</h1></div>
      {message && <p className="mt-2 break-words font-mono text-[13px] text-danger">{message}</p>}
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
      {onRetry && <button type="button" className="btn mt-4" onClick={onRetry}>{retry}</button>}
    </div>
  );
}

interface BoundaryProps { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }

/** Keeps one broken page from blanking the whole app; the header and navigation stay usable. */
export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children; }
}
