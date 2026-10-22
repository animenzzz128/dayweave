import { useState, type FormEvent } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { AI } from '../lib/shared';
import { lookup, presets, type Pack, type Parsed, type Preset } from '../data/ai';
import { Tag } from './ui';
import type { Proposal } from '../data/types';

/**
 * "Ask in one line": the AI turns a sentence into at most one proposed block. Dayweave's own phase2 checks then judge it, and it
 * can only join the review queue, where it needs the same exact-version approval as any other proposal. In the demo the
 * sentences are presets with stored parses; live parsing belongs to the private version.
 */
export function OneLine({ onAdded }: { onAdded: (id: string) => void }) {
  const { snapshot: d, now, f, source, run } = useApp();
  const { t, lang } = useI18n();
  const [chosen, setChosen] = useState<Preset | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  if (source.mode !== 'demo' || !source.addProposal || !presets.length) return null;

  const pick = (p: Preset) => { setChosen(p); setText(p[lang]); setNote(false); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = presets.find((x) => x.en.trim().toLowerCase() === text.trim().toLowerCase() || x.zh.trim() === text.trim());
    if (p) pick(p); else { setChosen(null); setNote(true); }
  };

  return (
    <section className="mb-6 rounded-[14px] border border-accent-line bg-accent-soft p-4" aria-labelledby="one-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="one-line" className="text-sm font-semibold text-accent">{t.ai.oneLine}</h2>
        <Tag tone="info">{t.ai.aiTag}</Tag>
      </div>
      <p className="mt-1 text-xs text-muted">{t.ai.oneLineHint}</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="one-line-input" className="sr-only">{t.ai.oneLine}</label>
        <input id="one-line-input" className="field min-w-0 flex-[1_1_260px]" maxLength={300} placeholder={presets[0][lang]} value={text} onChange={(e) => { setText(e.target.value); setNote(false); }} />
        <button type="submit" className="btn">{t.ai.ask}</button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{t.ai.presets}</span>
        {presets.map((p) => <button key={p.key} type="button" aria-pressed={chosen?.key === p.key} onClick={() => pick(p)}
          className={`chip ${chosen?.key === p.key ? 'border-accent text-accent' : ''}`}>{p[lang]}</button>)}
      </div>
      {note && <p className="mt-3 text-[13px] text-muted">{t.ai.liveNote}</p>}
      {chosen && <Result key={chosen.key + lang} preset={chosen} />}
    </section>
  );

  function Result({ preset }: { preset: Preset }) {
    const sentence = preset[lang];
    const pack = AI.proposePack(sentence, d, now) as Pack;
    const r = lookup<Parsed>(pack, `${preset.key}-${lang}`);
    if (r.used !== 'ai') return <p className="mt-3 text-[13px] text-muted">{t.ai.withheld[r.reason as 'evidence-changed' | 'invalid'] ?? t.ai.withheld.invalid}</p>;
    const out = r.output;
    if (out.status !== 'proposal') return (
      <div className="mt-3 rounded-xl border border-line bg-raised p-3.5 text-sm">
        <span className="label">{out.status === 'clarify' ? t.ai.clarify : t.ai.refuse}</span>
        <p>{out[lang]}</p>
      </div>
    );
    const { proposal, errors } = AI.toProposal(out, d, now, `${preset.key}-${lang}`) as { proposal: Proposal; errors: string[] };
    const exists = d.proposals.some((p) => p.id === proposal.id);
    return (
      <div className="mt-3 rounded-xl border border-line bg-raised p-3.5 text-sm">
        <span className="label">{t.ai.parsed}</span>
        <p className="font-medium">{f.day(proposal.start)} {f.hm(proposal.start)}–{f.hm(proposal.end)} · {out[lang]}</p>
        <span className="label mt-3">{t.ai.rulesSay}</span>
        {errors.length
          ? <ul className="list-disc space-y-0.5 pl-5 text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          : <p className="text-ok">{t.ai.rulesOk}</p>}
        {errors.length > 0 && <p className="mt-1 text-xs text-muted">{t.ai.fixInQueue}</p>}
        <button type="button" className="btn btn-primary mt-3" disabled={exists}
          onClick={async () => { if (await run(() => source.addProposal!({ ...proposal, aiSentence: sentence }), t.ai.added)) onAdded(proposal.id); }}>
          {exists ? t.ai.already : t.ai.add}
        </button>
      </div>
    );
  }
}
