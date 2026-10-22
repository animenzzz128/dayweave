import type { ReactNode } from 'react';
import { useApp } from '../data/AppData';
import { useI18n } from '../i18n/I18n';
import { href } from '../lib/router';
import { trackEvent } from '../lib/analytics';
import { caseStudy } from './caseStudyContent';
import { AiEvals } from './AiEvals';

const REPO = 'https://github.com/animenzzz128/dayweave';

// The product story an interviewer can read in five minutes. Lazy-loaded: none of this ships with the app pages.
export default function CaseStudy() {
  const { lang } = useI18n();
  const { source, run, outage } = useApp();
  const c = caseStudy[lang];
  const sections: [string, string][] = [['problem', c.problem.title], ['users', c.users.title], ['principles', c.principles.title], ['decisions', c.decisions.title], ['ai', c.ai.title], ['evals', c.evals.title], ['roadmap', c.roadmap.title]];
  const startOutage = async () => {
    trackEvent('case-study-cta');
    if (source.setOutage && !outage) await run(() => source.setOutage!(true));
    window.location.hash = href('today');
  };

  return (
    <div className="mx-auto flex max-w-[1120px] gap-12">
      <article className="min-w-0 max-w-[720px] flex-1">
        <header className="border-b border-line pb-8">
          <p className="eyebrow text-accent">{c.eyebrow}</p>
          <h1 className="mt-2 text-[34px] font-semibold leading-tight sm:text-[40px]">{c.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-body">{c.lede}</p>
          <p className="mt-3 text-sm text-muted">{c.role}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {c.stats.map(([n, label]) => (
              <div key={label} className="rounded-xl border border-line bg-raised px-4 py-3">
                <dt className="sr-only">{label}</dt>
                <dd className="font-mono text-2xl font-semibold text-ink">{n}</dd>
                <dd className="mt-0.5 text-xs text-muted">{label}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 rounded-xl border border-accent-line bg-accent-soft p-4">
            <h2 className="text-sm font-semibold text-accent">{c.try.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={href('today')} className="btn btn-primary no-underline">{c.try.today} →</a>
              {source.setOutage && <button type="button" className="btn" onClick={startOutage}>{c.try.outage}</button>}
              <a href={href('review')} className="btn no-underline">{c.try.review}</a>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn no-underline">{c.try.repo} ↗</a>
            </div>
          </div>
        </header>

        <Block id="problem" title={c.problem.title}>{c.problem.body.map((p) => <p key={p}>{p}</p>)}</Block>

        <Block id="users" title={c.users.title}>
          <p>{c.users.body}</p>
          <ul className="space-y-2">{c.users.jobs.map((j) => <li key={j} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{j}</li>)}</ul>
        </Block>

        <Block id="principles" title={c.principles.title}>
          <ol className="grid gap-3 sm:grid-cols-2">
            {c.principles.items.map(([h, body], i) => (
              <li key={h} className="panel p-4">
                <span className="font-mono text-xs text-accent">0{i + 1}</span>
                <h3 className="mt-1 font-semibold text-ink">{h}</h3>
                <p className="mt-1.5 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </Block>

        <Block id="decisions" title={c.decisions.title}>
          <p>{c.decisions.intro}</p>
          <div className="space-y-4">
            {c.decisions.items.map((d) => (
              <section key={d.title} className="panel p-5" aria-label={d.title}>
                <h3 className="font-semibold text-ink">{d.title}</h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[88px_1fr]">
                  <dt className="font-medium text-ok">{c.decisions.chose}</dt><dd>{d.chose}</dd>
                  <dt className="font-medium text-warn">{c.decisions.gaveUp}</dt><dd>{d.gaveUp}</dd>
                  <dt className="font-medium text-muted">{c.decisions.why}</dt><dd className="text-muted">{d.why}</dd>
                </dl>
              </section>
            ))}
          </div>
        </Block>

        <Block id="ai" title={c.ai.title}><AiEvals c={c.ai} /></Block>

        <Block id="evals" title={c.evals.title}>
          {c.evals.body.map((p) => <p key={p}>{p}</p>)}
          <h3 className="pt-2 font-semibold text-ink">{c.evals.metricsTitle}</h3>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-soft text-xs text-muted"><tr>{c.evals.metricHead.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {c.evals.metrics.map(([m, why, status]) => (
                  <tr key={m}><th scope="row" className="px-4 py-3 font-medium text-ink">{m}</th><td className="px-4 py-3 text-muted">{why}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block id="roadmap" title={c.roadmap.title}>
          <ol className="relative space-y-5 border-l border-line pl-6">
            {c.roadmap.items.map(([when, what, detail], i) => (
              <li key={what} className="relative">
                <span aria-hidden="true" className={`absolute -left-[30px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-accent' : 'border border-line bg-surface'}`} />
                <span className="font-mono text-xs text-muted">{when}</span>
                <h3 className="font-semibold text-ink">{what}</h3>
                <p className="text-sm text-muted">{detail}</p>
              </li>
            ))}
          </ol>
        </Block>

        <p className="mt-12 border-t border-line pt-8 text-[17px] leading-relaxed text-body">{c.closing}</p>
      </article>

      <nav aria-label={c.toc} className="sticky top-6 hidden h-fit w-48 shrink-0 lg:block">
        <p className="eyebrow">{c.toc}</p>
        <ul className="mt-3 space-y-1.5 border-l border-line text-sm">
          {sections.map(([id, title]) => <li key={id}><a href={'#' + id} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }} className="-ml-px block border-l border-transparent pl-3 text-muted no-underline hover:border-ink hover:text-ink">{title}</a></li>)}
        </ul>
      </nav>
    </div>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id + '-h'} className="scroll-mt-6 pt-10">
      <h2 id={id + '-h'} className="text-[22px] font-semibold">{title}</h2>
      <div className="mt-3 space-y-4 leading-relaxed text-body">{children}</div>
    </section>
  );
}
