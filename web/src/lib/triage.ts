import type { EmailMessage, Progress, TriageCategory } from '../data/types';

export const CATEGORIES: TriageCategory[] = ['interview', 'reply', 'action', 'info', 'promo'];
const RANK = { high: 0, medium: 1, low: 2 } as const;

export interface Triaged { m: EmailMessage; category: TriageCategory | null; handled: boolean; overridden: boolean }

/** The collected triage with the owner's overrides applied; an override always wins. */
export function triaged(messages: EmailMessage[], progress: Progress): Triaged[] {
  const own = (progress.emailTriage || {}) as Record<string, { category?: TriageCategory; handled?: boolean } | null>;
  return messages.map((m) => {
    const o = own[m.id] || {};
    return { m, category: o.category || m.triage?.category || null, handled: !!o.handled, overridden: !!o.category };
  });
}

/** Interview, reply and action mail not yet handled: interviews first (they get preparation time in the plan), then most urgent. */
export function toHandle(list: Triaged[]) {
  const due = (x: Triaged) => (x.m.triage?.dueAt ? Date.parse(x.m.triage.dueAt) : Infinity);
  const first = (x: Triaged) => (x.category === 'interview' ? 0 : 1);
  return list.filter((x) => !x.handled && (x.category === 'interview' || x.category === 'reply' || x.category === 'action'))
    .sort((a, b) => first(a) - first(b) || RANK[a.m.triage?.priority || 'medium'] - RANK[b.m.triage?.priority || 'medium'] || due(a) - due(b) || Date.parse(b.m.receivedAt) - Date.parse(a.m.receivedAt));
}
