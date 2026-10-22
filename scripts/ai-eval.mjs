// Scores the Claude API on the Luna AI cases (evals/luna-ai/cases.json). Developer machines only:
//   ANTHROPIC_API_KEY=... node scripts/ai-eval.mjs [--runs 3]    writes evals/luna-ai/results/<date>.json
// Each case is scored on its first attempt (no repair round), by the same validator the site uses plus the case's expectations.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { MODEL, call, cost } from './ai-client.mjs';
const require = createRequire(import.meta.url);
const AI = require('../src/ai.cjs'), E = require('./ai-eval-cases.cjs');

const i = process.argv.indexOf('--runs'), RUNS = i > 0 ? Math.max(1, Math.min(5, Number(process.argv[i + 1]) || 1)) : 1;
const usage = { input: 0, output: 0 }, served = new Set(), rows = [];
let stopped = null;
// An API error (rate or spend limit, outage) ends the run early; what finished is still written, marked incomplete.
cases: for (const c of E.cases) {
  const built = E.build(c), row = { id: c.id, task: c.task, why: c.why, runs: [] };
  for (let r = 0; r < RUNS; r++) {
    let res;
    try { res = await call(built.pack); } catch (err) { stopped = `${c.id} #${r + 1}: ${err.message}`; if (row.runs.length) rows.push(row); break cases; }
    usage.input += res.usage.input; usage.output += res.usage.output; served.add(res.model);
    const errors = res.output ? E.score(c, res.output, built) : [`no output (${res.stop})`];
    row.runs.push({ pass: !errors.length, errors, ...(errors.length ? { output: res.output } : {}), usage: res.usage });
    console.log(`${errors.length ? 'FAIL' : 'pass'} ${c.id} #${r + 1}${errors.length ? ': ' + errors.join('; ') : ''}`);
  }
  rows.push(row);
}

const tally = (list) => { const runs = list.flatMap((x) => x.runs); return { passed: runs.filter((x) => x.pass).length, total: runs.length }; };
const byTask = Object.fromEntries(['brief', 'breakdown', 'propose'].map((t) => [t, tally(rows.filter((x) => x.task === t))]));
const result = {
  schemaVersion: 1, synthetic: true, model: MODEL, servedModels: [...served], promptVersion: AI.VERSION, runAt: new Date().toISOString(),
  runsPerCase: RUNS, firstAttemptOnly: true, ...(stopped ? { incomplete: true, stoppedAt: stopped } : {}),
  summary: { overall: tally(rows), byTask, casesPassingEveryRun: rows.filter((x) => x.runs.every((r) => r.pass)).length, cases: rows.length, usage: { ...usage, costUSD: cost(usage) } },
  cases: rows,
};
const dir = new URL('../evals/luna-ai/results/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const file = new URL(`${result.runAt.slice(0, 10)}${stopped ? '-incomplete' : ''}.json`, dir);
fs.writeFileSync(file, JSON.stringify(result, null, 1) + '\n');
const o = result.summary.overall;
if (stopped) console.log('Stopped early: ' + stopped);
console.log(`${o.passed}/${o.total} runs passed (${result.summary.casesPassingEveryRun}/${rows.length} cases every run), about US$${result.summary.usage.costUSD}. Wrote ${file.pathname}`);
