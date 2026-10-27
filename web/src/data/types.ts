// Shapes follow docs/data-contract.md. Only the fields the web UI reads are typed; the rest pass through untouched.
export type SourceStatus = 'ok' | 'partial' | 'failed' | 'unavailable' | string;

export interface Course { id: string; code: string; name: string; category?: string; note?: string; source?: string }

export interface Assignment {
  id: string; courseId?: string; course: string; title: string; dueAt?: string | null;
  status: string; requirement: 'required' | 'choice' | 'uncertain' | string; sourceId?: string; source?: string;
  estimateMinutes?: number; /** 'ai' when the collecting task estimated it from the instructions. */ estimateSource?: string; estimateBasis?: string; statusUnread?: boolean; evidence?: string; description?: string; materials?: string; aiPolicy?: string;
  checklist?: string[]; archivedFromSource?: boolean; submissionUnknown?: boolean;
}

export interface CalendarEvent {
  id: string; title: string; start: string; end: string; busy?: boolean; allDay?: boolean;
  sourceId?: string; source?: string; location?: string; calendar?: string;
}

export interface Proposal extends CalendarEvent {
  status?: string; reason?: string; action?: string; recurrence?: string; account?: string; calendarId?: string;
  sourceRefs?: { kind: string; id: string }[]; minutes?: number;
  /** Set on AI proposals made from one sentence: where it came from and its Chinese title. */
  origin?: string; aiKey?: string; aiSentence?: string; titleZh?: string;
  /** Planner blocks: the day they were planned for, and whether the owner's edit or approval locked them against regeneration. */
  planDate?: string; locked?: boolean;
}

export interface Source { id: string; name: string; status: SourceStatus; lastSuccess?: string; lastAttempt?: string; source?: string; note?: string }

export interface Priority { title: string; detail?: string; source?: string }

export interface Receipt { id: string; status: string; fingerprint?: string; reference?: string; at?: string; note?: string }

export interface EmailMessage {
  id: string; threadId: string; receivedAt: string; from: string; subject: string; snippet?: string;
  labels?: string[]; unread?: boolean; hasAttachments?: boolean; attachmentCount?: number | null; link?: string;
  /** AI triage written by the collecting assistant; the owner's `emailTriage` progress overrides it. */
  triage?: { category: TriageCategory; priority: 'high' | 'medium' | 'low'; summary: string; action: string; dueAt: string | null; assignmentId?: string };
}

export type TriageCategory = 'interview' | 'reply' | 'action' | 'info' | 'promo';

export interface Role {
  id: string; title: string; market: string; source?: string; evidence?: string; checkedAt?: string;
  startYear?: number; sponsorship?: string; fit?: string;
}

export interface Person {
  id: string; name: string; market?: string; source?: string; evidence?: string; reason?: string; relationship?: string;
}

export interface Career {
  enabled?: boolean; note?: string; tracks?: { title: string; reason?: string }[]; unknowns?: string[];
  roles?: Role[]; candidates?: Person[]; profile?: Record<string, unknown>;
}

export interface Snapshot {
  schemaVersion: number; generatedAt: string; timezone: string; summary?: string; coverageNote?: string;
  courses: Course[]; assignments: Assignment[]; events: CalendarEvent[]; proposals: Proposal[];
  sources: Source[]; priorities: Priority[]; actionHistory: Receipt[];
  calendarCoverage?: { complete?: boolean; start?: string; end?: string; checkedAt?: string; note?: string; provider?: string; account?: string; calendar?: string };
  career?: Career; email?: { enabled?: boolean; account?: string; messages?: EmailMessage[]; checkedAt?: string; coverage?: { status?: string; note?: string; [key: string]: unknown }; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface Todo {
  id: string; title: string; dueAt: string | null; durationMinutes: number; notes: string; status: 'open' | 'done' | string;
  origin: { type: string; messageId?: string; subject?: string }; createdAt: string; updatedAt: string; completedAt: string | null;
}

// Progress mirrors the server's `progress` table: kind -> id -> value.
export interface Progress {
  checks?: Record<string, boolean>;
  actual?: Record<string, number>;
  career?: Record<string, { status: string; at?: string }>;
  archive?: Record<string, unknown>;
  dismissed?: Record<string, boolean>;
  preferences?: { workloadMode?: string };
  todo?: Record<string, Todo>;
  emailTriage?: Record<string, { category?: TriageCategory; handled?: boolean; at?: string } | null>;
  [kind: string]: Record<string, unknown> | undefined;
}

export interface Approval {
  id: number; reference: string; status: string; at: string; value: Proposal[]; fingerprints: Record<string, string>;
  /** The owner's approval recorded on the page (server mode), or null. */
  approval?: { channel: string; text: string; at: string; by: string } | null;
}

export interface PlanResult {
  date: string; ready?: boolean; blocks: Proposal[]; unscheduled: { id: string; title: string; reason: string; kind?: string }[]; unscheduledTotal?: number;
  gaps: string[]; assumptions: string[]; usable: { minutes: number; budget: number; allocated: number };
}

export interface Habit { id: string; title: string; minutes: number; perWeek: number; days: number[]; windows: { start: string; end: string }[]; enabled: boolean }
/** The owner's planning rules (planner.planSettings); the recommended ones until the owner saves their own. */
export interface PlanSettings { dayStart: string; dayEnd: string; breaks: { start: string; end: string }[]; habits: Habit[] }

/** Hosted only: whether the owner connected Google Calendar for direct writes (docs/google-direct.md). */
export interface CalendarWrite { available: boolean; connected?: boolean; account?: string; connectedAt?: string | null }
/** One direct write run: each action's outcome, or why the whole version stopped. */
export interface WriteResult { reference: string; stopped: string[]; actions: { id: string; title: string; status: string; already?: boolean; errors?: string[]; mismatches?: string[] }[] }

/** Server only: two dated weeks from retained source snapshots (src/trends.cjs). Unknown stays unknown, never zero. */
export interface TrendWeek {
  start: string; end: string; current: boolean; retentionLimited: boolean; observations: number; imports: number; unread: number;
  latest: { generatedAt: string; counts: Record<string, number>; noFresh: boolean } | null;
  sources: { id: string; name: string; ok: number; failed: number; other: number; notReported: number; latestStatus: string | null }[];
}
export interface Trends {
  available: boolean; reason?: string; timezone: string; defaultWeek: boolean;
  nav: { earlier: string | null; later: string | null }; retention: { days: number };
  weeks: [TrendWeek, TrendWeek]; comparison: { comparable: boolean; reasons: string[]; changes: Record<string, number> | null };
}

/** Server only: one page (20 rows) of the audit log, newest first, and the last 30 measured runs. */
export interface HistoryPage { page: number; total: number; items: { id: number; at: string; kind: string; status: string; label: string; value: unknown }[] }
export type Run = Record<string, unknown> & { startedAt?: string; status?: string; model?: string };

export interface Loaded { snapshot: Snapshot; progress: Progress; approvals: Approval[]; outage?: boolean; planSettings: PlanSettings; planSettingsSaved: boolean; calendarWrite?: CalendarWrite }

export interface DataSource {
  readonly mode: 'demo' | 'local';
  /** Local mode on a private hosted instance (Google sign-in): known after the first request. */
  hosted?: boolean;
  load(): Promise<Loaded>;
  saveProgress(kind: string, id: string, value: unknown): Promise<void>;
  setWorkloadMode(mode: string): Promise<void>;
  saveTodo(todo: Partial<Todo> & { origin?: { type: string; messageId?: string } }): Promise<void>;
  completeTodo(id: string, done: boolean): Promise<void>;
  generatePlan(date: string): Promise<PlanResult>;
  editProposal(id: string, changes: Partial<Proposal>): Promise<void>;
  savePlanSettings(settings: PlanSettings): Promise<void>;
  /** Demo only: adds an AI proposal from one sentence to the review queue. It still needs approval like any other. */
  addProposal?(p: Proposal): Promise<void>;
  prepare(ids: string[]): Promise<Approval>;
  /** Server only: records or withdraws the owner's approval of an exact prepared version. */
  approve?(reference: string): Promise<void>;
  withdraw?(reference: string): Promise<void>;
  /** Hosted only: writes an approved version to Google Calendar now, or forgets the stored Google consent. */
  writeCalendar?(reference: string): Promise<WriteResult>;
  /** Freezes the estimate and recorded actual minutes as a calibration sample, or removes it. Not a submission record. */
  confirmEffort?(id: string): Promise<void>;
  clearEffort?(id: string): Promise<void>;
  /** Server only: weekly evidence trends; `week` is a Monday (YYYY-MM-DD), latest observed week when omitted. */
  trends?(week?: string): Promise<Trends>;
  history?(filter: { q?: string; status?: string; from?: string; to?: string; page?: number }): Promise<HistoryPage>;
  runs?(): Promise<Run[]>;
  disconnectCalendar?(): Promise<void>;
  /** Demo only: stands in for the assistant's approved execution and read-back. */
  simulateApproval?(approval: Approval): Promise<void>;
  /** Demo only: makes the calendar and Gmail fail, to show how failures stay visible. */
  setOutage?(on: boolean): Promise<void>;
  reset?(): Promise<void>;
  /** Server only: the backup list (newest first), a new backup, and restoring one. */
  backups?(): Promise<string[]>;
  backup?(): Promise<string>;
  restore?(name: string): Promise<void>;
}
