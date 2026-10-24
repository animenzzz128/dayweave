// Shared Claude API call for the offline AI scripts (ai-generate.mjs, ai-eval.mjs). Developer machines only; never bundled into the
// site. The SDK reads ANTHROPIC_API_KEY from the environment; the key is never written anywhere.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AI = require('../src/ai.cjs');

// US$ per million tokens. Haiku is the default: these are short structured outputs that Dayweave's validator checks anyway, and
// Opus cost about US$1.71 for one 63-run eval. DAYWEAVE_AI_MODEL picks another listed model for a comparison run.
const PRICES = { 'claude-haiku-5-5': { input: 0.1, output: 0.5 }, 'claude-sonnet-5-5': { input: 2, output: 10 }, 'claude-opus-5-5': { input: 4, output: 20 } };
// Server-side refusal fallback is accepted on these models only.
const FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);
export const MODEL = process.env.DAYWEAVE_AI_MODEL || 'claude-haiku-5-5';
if (!PRICES[MODEL]) throw new Error(`DAYWEAVE_AI_MODEL must be one of ${Object.keys(PRICES).join(', ')}`);
export const PRICE = PRICES[MODEL];
export const cost = (u) => Math.round((u.input * PRICE.input + u.output * PRICE.output) / 1e4) / 100;
// A hard spending cap per script run (US$, default 0.25): the next call is refused once the spend so far reaches it.
const MAX_USD = Number(process.env.DAYWEAVE_AI_MAX_USD || 0.25);
const spent = { input: 0, output: 0 };

let client;
// One structured-output call for an evidence pack. `repair` feeds back the validator's errors for one more try.
// Returns the parsed JSON (or null), the stop reason, the model that served it and token usage.
export async function call(pack, repair) {
  if (cost(spent) >= MAX_USD) throw new Error(`Spending cap reached: about US$${cost(spent)} of US$${MAX_USD} (raise DAYWEAVE_AI_MAX_USD to continue)`);
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  const p = AI.prompt(pack);
  const messages = [{ role: 'user', content: p.user }];
  if (repair) messages.push({ role: 'assistant', content: JSON.stringify(repair.output) }, { role: 'user', content: 'Dayweave rejected that output: ' + repair.errors.join('; ') + '. Return a corrected version.' });
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, ...(FALLBACK.has(MODEL) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    system: p.system, messages, output_config: { effort: 'low', format: { type: 'json_schema', schema: p.schema } },
  });
  spent.input += r.usage.input_tokens; spent.output += r.usage.output_tokens;
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let output = null;
  if (r.stop_reason === 'end_turn') try { output = JSON.parse(text); } catch { /* the caller reports it as no output */ }
  return { output, stop: r.stop_reason, model: r.model, usage: { input: r.usage.input_tokens, output: r.usage.output_tokens } };
}
