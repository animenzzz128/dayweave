import template from '../../../examples/luna-demo.json';
import { Core, Demo, Phase2, Planner, Todos } from '../lib/shared';
import type { Approval, DataSource, Loaded, PlanResult, Progress, Proposal, Receipt, Snapshot, Todo } from './types';

// The public demo keeps everything in this browser. Nothing is sent anywhere, and Reset returns to the original Luna data.
const KEY = 'dayweave.demo.v1';

interface DemoState {
  v: 1;
  day: string;
  progress: Progress;
  proposals: Proposal[] | null;
  approvals: Approval[];
  receipts: Receipt[];
  nextQ: number;
}

const fresh = (day: string): DemoState => ({ v: 1, day, progress: {}, proposals: null, approvals: [], receipts: [], nextQ: 12 });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function read(day: string): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as DemoState) : null;
    if (!s || s.v !== 1) return fresh(day);
    // Dated work (plans, approvals, simulated receipts) belongs to the day it was made; checklists and todos carry over.
    return s.day === day ? s : { ...fresh(day), progress: s.progress, nextQ: s.nextQ };
  } catch {
    return fresh(day);
  }
}

export class DemoSource implements DataSource {
  readonly mode = 'demo' as const;
  private state: DemoState | null = null;
  private snapshot: Snapshot | null = null;

  private build(now = new Date()): { d: Snapshot; s: DemoState } {
    const base = Demo.resolve(template, now) as Snapshot;
    Core.configure(base.timezone);
    const s = read(Core.dayKey(now));
    const d: Snapshot = { ...base, proposals: s.proposals ? clone(s.proposals) : base.proposals, actionHistory: clone(s.receipts) };
    this.state = s;
    this.snapshot = d;
    return { d, s };
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage may be unavailable; the demo still works for this visit */ }
  }

  private invalidate(ids: string[]) {
    for (const a of this.state!.approvals) if (a.status === 'prepared' && a.value.some((p) => ids.includes(p.id))) a.status = 'invalidated';
  }

  async load(): Promise<Loaded> {
    const { d, s } = this.build();
    return { snapshot: d, progress: clone(s.progress), approvals: clone(s.approvals).reverse() };
  }

  async saveProgress(kind: string, id: string, value: unknown) {
    const { s } = this.build();
    const bucket = (s.progress[kind] ??= {}) as Record<string, unknown>;
    if (value === null || value === undefined || value === false) delete bucket[id];
    else bucket[id] = value;
    this.save();
  }

  async setWorkloadMode(mode: string) {
    const { s } = this.build();
    s.progress.preferences = { ...(s.progress.preferences || {}), workloadMode: mode };
    this.save();
  }

  async saveTodo(input: Partial<Todo> & { origin?: { type: string; messageId?: string } }) {
    const { d, s } = this.build();
    const todos = (s.progress.todo ??= {});
    const existing = input.id ? todos[input.id] ?? null : null;
    const id = existing?.id ?? `todo-${Date.now().toString(36)}`;
    todos[id] = Todos.clean(input, { existing, email: d.email, id, now: new Date() });
    this.dropUnstartedBlocksFor(id);
    this.save();
  }

  async completeTodo(id: string, done: boolean) {
    const { s } = this.build();
    const t = s.progress.todo?.[id];
    if (!t) throw new Error('Unknown todo');
    const at = new Date().toISOString();
    s.progress.todo![id] = { ...t, status: done ? 'done' : 'open', completedAt: done ? at : null, updatedAt: at };
    this.dropUnstartedBlocksFor(id);
    this.save();
  }

  // Editing or completing a todo removes the planner blocks made for it that were never attempted (as the server does).
  private dropUnstartedBlocksFor(todoId: string) {
    const d = this.snapshot!, s = this.state!;
    const drop = d.proposals.filter((p) => p.sourceRefs?.some((r) => r.kind === 'todo' && r.id === todoId) && !Planner.attempted(d, p.id)).map((p) => p.id);
    if (!drop.length) return;
    s.proposals = d.proposals.filter((p) => !drop.includes(p.id));
    this.invalidate(drop);
  }

  async generatePlan(date: string): Promise<PlanResult> {
    const { d, s } = this.build();
    const now = new Date();
    const result = Planner.plan({ snapshot: d, date, now, todos: s.progress.todo || {}, archive: s.progress.archive || {}, dismissed: s.progress.dismissed || {}, started: [] }) as PlanResult;
    const replaced = d.proposals.filter((p) => Planner.replaceable(d, p, date)).map((p) => p.id);
    d.proposals = [...d.proposals.filter((p) => !Planner.replaceable(d, p, date)), ...result.blocks];
    Core.validate(d);
    s.proposals = clone(d.proposals);
    this.invalidate(replaced);
    this.save();
    return result;
  }

  async editProposal(id: string, changes: Partial<Proposal>) {
    const { d, s } = this.build();
    const p = d.proposals.find((x) => x.id === id);
    if (!p) throw new Error('Unknown proposal');
    if (d.actionHistory.some((h) => h.id === id && ['pending', 'executed', 'unverified'].includes(h.status))) throw new Error('This action was already carried out.');
    for (const k of ['title', 'start', 'end'] as const) if (changes[k] !== undefined) p[k] = changes[k] as string;
    Core.validate(d);
    s.proposals = clone(d.proposals);
    this.invalidate([id]);
    this.save();
  }

  async prepare(ids: string[]): Promise<Approval> {
    const { d, s } = this.build();
    const chosen = ids.map((id) => d.proposals.find((p) => p.id === id));
    if (!ids.length || chosen.some((p) => !p)) throw new Error('Unknown proposal');
    Phase2.request(chosen, d, new Date(), []);
    const fingerprints = Object.fromEntries(chosen.map((p) => [p!.id, Phase2.fingerprint(p)]));
    const prior = s.approvals.find((a) => a.status === 'prepared' && JSON.stringify(a.fingerprints) === JSON.stringify(fingerprints));
    if (prior) return clone(prior);
    const approval: Approval = { id: s.nextQ, reference: `Q-${s.nextQ}`, status: 'prepared', at: new Date().toISOString(), value: clone(chosen as Proposal[]), fingerprints };
    s.nextQ += 1;
    s.approvals.push(approval);
    this.save();
    return clone(approval);
  }

  async simulateApproval(approval: Approval) {
    const { d, s } = this.build();
    const a = s.approvals.find((x) => x.id === approval.id);
    if (!a || a.status !== 'prepared') throw new Error('This version is no longer waiting for approval.');
    for (const p of a.value) {
      const current = d.proposals.find((x) => x.id === p.id);
      if (!current || Phase2.fingerprint(current) !== a.fingerprints[p.id]) throw new Error('The proposal changed after this version was prepared.');
    }
    const at = new Date().toISOString();
    for (const p of a.value) s.receipts.push({ id: p.id, status: 'executed', fingerprint: a.fingerprints[p.id], reference: a.reference, at, note: 'simulated' });
    a.status = 'executed';
    this.save();
  }

  async reset() {
    try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
    this.state = null;
  }
}
