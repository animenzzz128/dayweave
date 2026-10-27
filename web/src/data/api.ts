import type { Approval, DataSource, Loaded, PlanResult, Proposal, Todo } from './types';

// Client for the existing Dayweave server (development port, synthetic data). The server owns every rule: sessions, CSRF,
// validation, approvals and backups. This class only forwards requests.
export class ApiSource implements DataSource {
  readonly mode = 'local' as const;
  private csrf = '';
  hosted = false;

  private async session() {
    const r = await fetch('/api/session', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Could not start a local session');
    const value = await r.json();
    this.csrf = value.csrf;
    this.hosted = !!value.hosted;
  }

  private async call<T>(path: string, body?: unknown, retry = true): Promise<T> {
    if (!this.csrf) await this.session();
    const r = await fetch('/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-dayweave-token': this.csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 401 && retry) { this.csrf = ''; return this.call(path, body, false); }
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || 'Request failed');
    return value as T;
  }

  async load(): Promise<Loaded> {
    const { snapshot, progress } = await this.call<Pick<Loaded, 'snapshot' | 'progress'>>('snapshot');
    if (!snapshot) throw new Error('The local database has no snapshot yet.');
    const approvals = await this.call<Approval[]>('approvals');
    return { snapshot, progress: progress || {}, approvals };
  }

  async saveProgress(kind: string, id: string, value: unknown) { await this.call('progress', { kind, id, value }); }
  async setWorkloadMode(mode: string) { await this.call('workload-mode', { mode }); }
  async saveTodo(todo: Partial<Todo>) { await this.call('todos/save', { todo }); }
  async completeTodo(id: string, done: boolean) { await this.call('todos/complete', { id, done }); }
  async generatePlan(date: string) { return this.call<PlanResult>('plan/generate', { date }); }
  async editProposal(id: string, changes: Partial<Proposal>) { await this.call('proposals/edit', { id, changes }); }
  async prepare(ids: string[]) { return this.call<Approval>('approvals/prepare', { ids }); }
  async approve(reference: string) { await this.call('approvals/approve', { reference }); }
  async withdraw(reference: string) { await this.call('approvals/withdraw', { reference }); }
  async backups() { return (await this.call<{ backups: string[] }>('health')).backups; }
  async backup() { return (await this.call<{ name: string }>('backup', {})).name; }
  async restore(name: string) { await this.call('restore', { name }); }
}
