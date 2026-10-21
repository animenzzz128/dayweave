import { useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { Empty, External, PageHeader, Tag } from '../components/ui';
import { TodoForm } from './Coursework';
import { emailHealth } from './Today';
import type { EmailMessage } from '../data/types';

export function EmailPage() {
  const { snapshot: d, now, f, progress } = useApp();
  const { t } = useI18n();
  const h = emailHealth(d.email, now) as { state: string; stale?: boolean; shown?: number; unread?: number };
  const e = d.email as { request?: { windowDays?: number; limit?: number }; messages?: EmailMessage[]; checkedAt?: string } | null | undefined;
  const adopted = new Set(Object.values(progress.todo || {}).map((x) => x.origin?.messageId).filter(Boolean));
  const stateTag = { complete: ['ok', t.email.complete], partial: ['warn', t.email.partial], failed: ['danger', t.email.failed], disabled: ['neutral', t.email.disabled], unknown: ['warn', t.email.unknown] } as const;
  const [tone, text] = stateTag[h.state as keyof typeof stateTag] || stateTag.unknown;
  const messages = [...(e?.messages || [])].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  return (
    <>
      <PageHeader title={t.email.title} subtitle={t.email.subtitle} />
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Tag tone={tone}>{text}</Tag>
        {h.stale && <Tag tone="warn">{t.status.stale}</Tag>}
        {e?.request && <span className="text-muted">{t.email.window(e.request.windowDays || 7, e.request.limit || 50)} · {t.common.checkedAt(f.ago(e.checkedAt, now))}</span>}
      </div>
      {messages.length
        ? <ul className="space-y-3">{messages.map((m) => <Message key={m.id} m={m} adopted={adopted.has(m.id)} />)}</ul>
        : <Empty>{h.state === 'unknown' ? t.email.unknown : t.email.empty}</Empty>}
    </>
  );
}

function Message({ m, adopted }: { m: EmailMessage; adopted: boolean }) {
  const { f, now } = useApp();
  const { t } = useI18n();
  const [adopting, setAdopting] = useState(false);
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className={`block ${m.unread ? 'font-semibold' : 'font-medium'}`}>{m.subject}</span>
          <span className="text-xs text-muted">{m.from}</span>
        </div>
        <div className="flex items-center gap-2">
          {m.unread && <Tag tone="info">{t.email.unread}</Tag>}
          {m.hasAttachments && <Tag>{t.email.attachments(m.attachmentCount || 1)}</Tag>}
          <span className="font-mono text-xs text-muted">{f.ago(m.receivedAt, now)}</span>
        </div>
      </div>
      {m.snippet && <p className="mt-2 text-sm text-body">{m.snippet}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {adopted
          ? <Tag tone="ok">{t.email.adopted}</Tag>
          : <button type="button" className="btn" aria-expanded={adopting} onClick={() => setAdopting(!adopting)}>{t.email.adopt}</button>}
        {m.link && <External url={m.link} className="text-[13px]">Gmail</External>}
      </div>
      {adopting && !adopted && (
        <div className="mt-3 max-w-xl">
          <p className="mb-2 text-xs text-muted">{t.email.adoptHint}</p>
          <TodoForm origin={{ type: 'email', messageId: m.id }} initialTitle={m.subject} onDone={() => setAdopting(false)} />
        </div>
      )}
    </li>
  );
}
