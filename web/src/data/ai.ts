import { AI } from '../lib/shared';

// Pre-generated AI outputs for the public demo (examples/luna-ai.json, written offline by scripts/ai-generate.mjs). The site
// never calls a model. Each stored output is shown only when today's evidence has the same fingerprint and it passes the
// validator again in this browser; otherwise the rules write the text and the page says why.
const found = import.meta.glob('../../../examples/luna-ai.json', { eager: true, import: 'default' });

export interface Sentence { text: string; cites: string[] }
export interface Brief { en: Sentence[]; zh: Sentence[] }
export interface Step { en: string; zh: string; minutes: number; quote: string }
export interface Parsed { status: 'proposal' | 'clarify' | 'refuse'; en: string; zh: string; day: number; start: string; minutes: number; cites: string[] }
export interface EvidenceRecord { ref: string; kind: string; [field: string]: unknown }
export interface Pack { task: string; records: EvidenceRecord[]; lists?: Record<string, string[]> }
export interface Preset { key: string; en: string; zh: string }
interface Store { model: string; generatedAt: string; presets: Preset[]; items: { task: string; key: string; fingerprint: string; output: unknown }[] }

export const store: Store | null = __DAYWEAVE_MODE__ === 'demo' ? ((Object.values(found)[0] as Store | undefined) ?? null) : null;
export const presets: Preset[] = store?.presets ?? [];

export type Reason = 'missing' | 'evidence-changed' | 'invalid' | 'local';
export type Outcome<T> = { used: 'ai'; output: T; model: string; generatedAt: string } | { used: 'rules'; reason: Reason; errors?: string[] };

export function lookup<T>(pack: Pack, key: string): Outcome<T> {
  if (!store) return { used: 'rules', reason: __DAYWEAVE_MODE__ === 'demo' ? 'missing' : 'local' };
  const r = AI.lookup(store, pack, key);
  return r.ok ? { used: 'ai', output: r.output as T, model: store.model, generatedAt: store.generatedAt } : { used: 'rules', reason: r.reason, errors: r.errors };
}

// Step-level edit size between the suggested and accepted steps: changed, removed and added steps.
export function stepEdits(before: { text: string; minutes: number }[], after: { text: string; minutes: number }[]) {
  let edits = Math.abs(before.length - after.length);
  for (let i = 0; i < Math.min(before.length, after.length); i++) if (before[i].text.trim() !== after[i].text.trim() || before[i].minutes !== after[i].minutes) edits++;
  return edits;
}
