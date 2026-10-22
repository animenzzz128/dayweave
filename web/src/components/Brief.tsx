import { useMemo, useState } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { AI } from '../lib/shared';
import { lookup, type Brief as BriefText, type Pack } from '../data/ai';
import { CitedSentence, EvidencePanel, citationNumbers } from './Evidence';
import { Tag } from './ui';

/** Today's brief. The demo shows the stored AI text when it still matches today's evidence; otherwise the rules write it. */
export function Brief() {
  const { snapshot: d, now, f, source } = useApp();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<string[] | null>(null);
  const day = f.dayKey(now);
  // The pack depends on the snapshot and the day; recomputing it every minute would only repeat the same work.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pack = useMemo(() => AI.briefPack(d, now) as Pack, [d, day]);
  const result = lookup<BriefText>(pack, 'today');
  const text: BriefText = result.used === 'ai' ? result.output : AI.fallbackBrief(pack);
  const sentences = text[lang];
  const numbers = citationNumbers(sentences);
  const title = (ref: string) => (pack.records.find((r) => r.ref === ref)?.title as string) || ref;

  if (source.mode === 'local' && d.summary) {
    // Local mode keeps the assistant's own summary from the collection run.
    return <p className="mt-2.5 text-[17px] leading-relaxed">{d.summary}</p>;
  }
  return (
    <>
      <p className="mt-2.5 text-[17px] leading-relaxed">{sentences.map((s, i) => <CitedSentence key={i} s={s} numbers={numbers} onOpen={setOpen} />)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Tag tone={result.used === 'ai' ? 'info' : 'neutral'}>{result.used === 'ai' ? t.ai.aiTag : t.ai.rulesTag}</Tag>
        <span>{result.used === 'ai' ? t.ai.generated(result.model, f.day(result.generatedAt)) : t.ai.fallback[result.reason]}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-[13px] text-accent">{t.ai.why}</summary>
        <div className="mt-2 space-y-2 text-[13px] text-sub">
          <p>{t.ai.whyText}</p>
          {(['urgent', 'verification'] as const).map((k) => pack.lists?.[k]?.length ? (
            <p key={k}><span className="font-medium text-ink">{t.ai.lists[k]}:</span> {pack.lists[k].map(title).join('; ')}</p>
          ) : null)}
          <p className="font-medium text-ink">{t.ai.howChecked}</p>
          <ul className="list-disc space-y-0.5 pl-5">{t.ai.checks.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </details>
      {open && <EvidencePanel refs={open} onClose={() => setOpen(null)} />}
    </>
  );
}
