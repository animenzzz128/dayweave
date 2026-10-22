// Scores the Claude API on the Luna AI cases (evals/luna-ai/cases.json). Developer machines only:
//   ANTHROPIC_API_KEY=... node scripts/ai-eval.mjs [--runs 3]    writes evals/luna-ai/results/<date>.json
//   node scripts/ai-eval.mjs --rescore <result.json> "<reason>"   re-scores the stored outputs after a scorer fix (no API calls)
// Each case is scored on its first attempt (no repair round), by the same validator the site uses plus the case's expectations.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AI = require('../src/ai.cjs'), E = require('./ai-eval-cases.cjs');

const tally = (list) => { const runs = list.flatMap((x) => x.runs); return { passed: runs.filter((x) => x.pass).length, total: runs.length }; };
function summarize(rows, usage) {
  const byTask = Object.fromEntries(['brief', 'breakdown', 'propose'].map((t) => [t, tally(rows.filter((x) => x.task === t))]));
  return { overall: tally(rows), byTask, casesPassingEveryRun: rows.filter((x) => x.runs.every((r) => r.pass)).length, cases: rows.length, usage };
}

const rescore = process.argv.indexOf('--rescore');
if (rescore > 0) {
  // A scorer fix is applied to the outputs the run stored, and the first scores are kept next to the new ones. Earlier runs
  // stored only failing outputs, so their passes stay as scored; the result says so.
  const file = process.argv[rescore + 1], reason = process.argv[rescore + 2];
  if (!file || !reason) throw Error('Use --rescore <result.json> "<reason>"');
  const result = JSON.parse(fs.readFileSync(file, 'utf8')), changed = [];
  for (const row of result.cases) {
    const c = E.cases.find((x) => x.id === row.id);
    row.runs.forEach((run, i) => {
      if (!run.output) return;
      const errors = E.score(c, run.output);
      if (JSON.stringify(errors) === JSON.stringify(run.errors)) return;
      run.firstErrors ??= run.errors;
      Object.assign(run, { pass: !errors.length, errors });
      changed.push(`${row.id} #${i + 1}`);
    });
  }
  result.firstSummary ??= { overall: result.summary.overall, byTask: result.summary.byTask, casesPassingEveryRun: result.summary.casesPassingEveryRun };
  result.rescored = [...(result.rescored || []), { at: new Date().toISOString(), reason, changed, storedOutputsOnly: !result.allOutputsStored }];
  result.summary = summarize(result.cases, result.summary.usage);
  fs.writeFileSync(file, JSON.stringify(result, null, 1) + '\n');
  console.log(`Re-scored ${changed.length} run(s): ${changed.join(', ') || 'none'}. Now ${result.summary.overall.passed}/${result.summary.overall.total}.`);
  process.exit(0);
}

const { MODEL, call, cost } = await import('./ai-client.mjs');
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
    row.runs.push({ pass: !errors.length, errors, output: res.output, usage: res.usage });
    console.log(`${errors.length ? 'FAIL' : 'pass'} ${c.id} #${r + 1}${errors.length ? ': ' + errors.join('; ') : ''}`);
  }
  rows.push(row);
}

const result = {
  schemaVersion: 1, synthetic: true, model: MODEL, servedModels: [...served], promptVersion: AI.VERSION, runAt: new Date().toISOString(),
  runsPerCase: RUNS, firstAttemptOnly: true, allOutputsStored: true, ...(stopped ? { incomplete: true, stoppedAt: stopped } : {}),
  summary: summarize(rows, { ...usage, costUSD: cost(usage) }),
  cases: rows,
};
const dir = new URL('../evals/luna-ai/results/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const file = new URL(`${result.runAt.slice(0, 10)}${stopped ? '-incomplete' : ''}.json`, dir);
fs.writeFileSync(file, JSON.stringify(result, null, 1) + '\n');
const o = result.summary.overall;
if (stopped) console.log('Stopped early: ' + stopped);
console.log(`${o.passed}/${o.total} runs passed (${result.summary.casesPassingEveryRun}/${rows.length} cases every run), about US$${result.summary.usage.costUSD}. Wrote ${file.pathname}`);
