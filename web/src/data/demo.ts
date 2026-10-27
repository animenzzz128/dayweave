import template from '../../../examples/luna-demo.json';
import { Core, Demo, Effort, Phase2, Planner, Todos } from '../lib/shared';
import { trackEvent } from '../lib/analytics';
import type { Approval, DataSource, Loaded, PlanDay, PlanResult, PlanSettings, Progress, Proposal, Receipt, Snapshot, Todo, WriteResult } from './types';

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
  outage?: boolean;
  /** The visitor's planning rules; the recommended ones when unset. */
  planSettings?: PlanSettings;
  /** Today's and tomorrow's drafts were made on the first visit of the day, standing in for the morning collection. */
  autoPlanned?: boolean;
  /** When the visitor connected the simulated Google Calendar. */
  calendarConnectedAt?: string;
}

const fresh = (day: string): DemoState => ({ v: 1, day, progress: {}, proposals: null, approvals: [], receipts: [], nextQ: 12 });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function read(day: string): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as DemoState) : null;
    if (!s || s.v !== 1) return fresh(day);
    // Dated work (plans, approvals, simulated receipts) belongs to the day it was made; checklists and todos carry over.
    return s.day === day ? s : { ...fresh(day), progress: s.progress, nextQ: s.nextQ, outage: s.outage, planSettings: s.planSettings, calendarConnectedAt: s.calendarConnectedAt };
  } catch {
    return fresh(day);
  }
}

// The calendar and Gmail fail to read. Their last good records are kept, but blank calendar time is no longer known
// to be free, so the planner refuses to plan and every page says what it cannot know.
function simulateOutage(d: Snapshot, now: Date) {
  const lastGood = new Date(+now - 26 * 3600000).toISOString();
  const attempt = new Date(+now - 2 * 60000).toISOString();
  for (const id of ['google-calendar', 'gmail']) {
    const src = d.sources.find((x) => x.id === id);
    if (src) Object.assign(src, { status: 'failed', lastSuccess: lastGood, lastAttempt: attempt, note: 'Simulated outage: the read timed out. Records from the last good read are kept.' });
  }
  if (d.calendarCoverage) d.calendarCoverage = { ...d.calendarCoverage, complete: false, checkedAt: lastGood, note: 'Simulated outage: the calendar could not be read, so blank time is unknown.' };
  // Same shape as a failed read merged by the server: earlier messages stay, labelled as retained.
  if (d.email) d.email = {
    ...d.email, checkedAt: lastGood, lastSuccess: lastGood, retained: true, retainedFrom: lastGood,
    coverage: { ...d.email.coverage, status: 'failed', complete: false, morePages: null, returned: 0, errors: ['Simulated outage: the Gmail read timed out.'], note: '' },
    messages: (d.email.messages || []).map((m) => ({ ...m, retained: true })),
  };
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
    if (s.outage) simulateOutage(d, now);
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
    if (!s.autoPlanned) {
      const now = new Date(), today = Core.dayKey(now);
      for (const date of [today, Demo.addDays(today, 1) as string]) this.planDay(d, s, date, now);
      s.autoPlanned = true;
      this.save();
    }
    return { snapshot: d, progress: clone(s.progress), approvals: clone(s.approvals).reverse(), outage: !!s.outage, planSettings: this.settings(), planSettingsSaved: !!s.planSettings,
      calendarWrite: { available: true, connected: !!s.calendarConnectedAt, account: d.calendarCoverage?.account, connectedAt: s.calendarConnectedAt ?? null } };
  }

  private settings(): PlanSettings { return Planner.planSettings(this.state?.planSettings || Planner.RECOMMENDED); }

  async savePlanSettings(settings: PlanSettings) {
    const { s } = this.build();
    s.planSettings = Planner.planSettings(settings);
    this.save();
  }

  async saveProgress(kind: string, id: string, value: unknown) {
    const { s } = this.build();
    const bucket = (s.progress[kind] ??= {}) as Record<string, unknown>;
    if (value === null || value === undefined || value === false) delete bucket[id];
    else bucket[id] = value;
    // As on the server: editing actual minutes removes that work's calibration confirmation.
    if (kind === 'actual' && s.progress.effortCalibration) delete s.progress.effortCalibration[id];
    this.save();
  }

  async confirmEffort(id: string) {
    const { d, s } = this.build();
    const a = d.assignments.find((x) => x.id === id), actual = s.progress.actual?.[id];
    if (!a) throw new Error('Unknown assignment');
    if (!Effort.positive(a.estimateMinutes)) throw new Error('Effort confirmation needs a positive estimate');
    if (!Effort.positive(actual)) throw new Error('Record positive actual minutes before confirming');
    (s.progress.effortCalibration ??= {})[id] = { estimateMinutes: a.estimateMinutes, actualMinutes: actual, requirement: a.requirement, confirmedAt: new Date().toISOString() };
    this.save();
  }

  async clearEffort(id: string) {
    const { s } = this.build();
    if (s.progress.effortCalibration) delete s.progress.effortCalibration[id];
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
    const result = this.planDay(d, s, date, new Date());
    this.save();
    return result;
  }

  // As on the server: every day's replaceable drafts are cleared first, so old drafts on later days do not count as coverage.
  async generatePlans(from: string, days: number): Promise<PlanDay[]> {
    const { d, s } = this.build(), now = new Date();
    const dates = Array.from({ length: days }, (_, i) => Demo.addDays(from, i) as string);
    const cleared = d.proposals.filter((p) => dates.some((k) => Planner.replaceable(d, p, k))).map((p) => p.id);
    d.proposals = d.proposals.filter((p) => !cleared.includes(p.id));
    this.invalidate(cleared);
    const out = dates.map((date) => { const r = this.planDay(d, s, date, now); return { date, ready: !!r.ready, blocks: r.ready ? r.blocks.length : 0, gaps: r.gaps.length }; });
    this.save();
    return out;
  }

  // As on the server: replaceable drafts for the day give way to new ones, and the summary is kept for the Plan page.
  private planDay(d: Snapshot, s: DemoState, date: string, now: Date): PlanResult {
    const result = Planner.plan({ snapshot: d, date, now, todos: s.progress.todo || {}, archive: s.progress.archive || {}, dismissed: s.progress.dismissed || {}, started: [], settings: this.settings(), emailTriage: s.progress.emailTriage || {} }) as PlanResult;
    const replaced = d.proposals.filter((p) => Planner.replaceable(d, p, date)).map((p) => p.id);
    d.proposals = [...d.proposals.filter((p) => !Planner.replaceable(d, p, date)), ...result.blocks];
    Core.validate(d);
    s.proposals = clone(d.proposals);
    this.invalidate(replaced);
    (s.progress.plan ??= {})[date] = { ...Planner.summary(result), replaced };
    return result;
  }

  async editProposal(id: string, changes: Partial<Proposal>) {
    const { d, s } = this.build();
    const p = d.proposals.find((x) => x.id === id);
    if (!p) throw new Error('Unknown proposal');
    if (d.actionHistory.some((h) => h.id === id && ['pending', 'executed', 'unverified'].includes(h.status))) throw new Error('This action was already carried out.');
    // A retitled AI proposal keeps no stale Chinese title.
    if (changes.title !== undefined && changes.title !== p.title) delete p.titleZh;
    for (const k of ['title', 'start', 'end'] as const) if (changes[k] !== undefined) p[k] = changes[k] as string;
    // As on the server: an edited planner block is locked against regeneration; `locked: false` alone unlocks it.
    if (p.origin === 'planner') { delete p.lockedBy; if (changes.locked === false && Object.keys(changes).length === 1) delete p.locked; else p.locked = true; }
    Core.validate(d);
    s.proposals = clone(d.proposals);
    this.invalidate([id]);
    this.save();
  }

  async addProposal(p: Proposal) {
    const { d, s } = this.build();
    if (d.proposals.some((x) => x.id === p.id)) throw new Error('This proposal is already in the review queue.');
    if (p.origin !== 'ai' || p.status !== 'proposed') throw new Error('Only new AI proposals can be added here.');
    d.proposals = [...d.proposals, clone(p)];
    Core.validate(d);
    s.proposals = clone(d.proposals);
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

  // The private instance's direct write (docs/google-direct.md), played out in this browser: connect once, approve an exact
  // version, then a live recheck and one create per block. No calendar is touched; receipts say "simulated".
  async connectCalendar() {
    const { s } = this.build();
    s.calendarConnectedAt = new Date().toISOString();
    this.save();
  }

  async disconnectCalendar() {
    const { s } = this.build();
    delete s.calendarConnectedAt;
    this.save();
  }

  private version(s: DemoState, reference: string) {
    const a = s.approvals.find((x) => x.reference === reference);
    if (!a || a.status !== 'prepared') throw new Error('This version is no longer waiting for approval.');
    return a;
  }

  async approve(reference: string) {
    const { s } = this.build();
    this.version(s, reference).approval = { channel: 'web', text: `Approve ${reference}`, at: new Date().toISOString(), by: 'Luna (demo)' };
    this.save();
  }

  async withdraw(reference: string) {
    const { s } = this.build();
    this.version(s, reference).approval = null;
    this.save();
  }

  async writeCalendar(reference: string): Promise<WriteResult> {
    const { d, s } = this.build();
    const a = this.version(s, reference);
    const stopped: string[] = [];
    if (!s.calendarConnectedAt) stopped.push('Google Calendar is not connected.');
    if (!a.approval) stopped.push(`${reference} is not approved.`);
    if (d.calendarCoverage?.complete === false) stopped.push('The calendar could not be read again, so free time is unknown.');
    for (const p of a.value) {
      const current = d.proposals.find((x) => x.id === p.id);
      if (!current || Phase2.fingerprint(current) !== a.fingerprints[p.id]) { stopped.push(`${p.title} changed after ${reference} was prepared.`); break; }
    }
    if (stopped.length) return { reference, stopped, actions: [] };
    const now = new Date(), at = now.toISOString();
    // The live recheck: a block that now clashes with the calendar or has already passed is skipped (no receipt), never moved.
    const actions = a.value.map((p) => {
      const errors = Phase2.errors(p, { ...d, proposals: d.proposals.filter((x) => x.id !== p.id) }, now, []) as string[];
      return { id: p.id, title: p.title, status: errors.length ? 'skipped' : 'executed', ...(errors.length ? { errors } : {}) };
    });
    for (const x of actions) if (x.status === 'executed') s.receipts.push({ id: x.id, status: x.status, fingerprint: a.fingerprints[x.id], reference, at, note: 'simulated' });
    a.status = actions.every((x) => x.status === 'executed') ? 'executed' : actions.some((x) => x.status === 'executed') ? 'partial' : 'failed';
    this.save();
    return { reference, stopped, actions };
  }

  async setOutage(on: boolean) {
    const { s } = this.build();
    s.outage = on;
    this.save();
    trackEvent(on ? 'outage-on' : 'outage-off');
  }

  async reset() {
    try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
    this.state = null;
  }
}
