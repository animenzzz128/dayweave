// Shared Claude API call for the offline AI scripts (ai-generate.mjs, ai-eval.mjs). Developer machines only; never bundled into the
// site. The SDK reads ANTHROPIC_API_KEY from the environment; the key is never written anywhere.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AI = require('../src/ai.cjs');

export const MODEL = 'claude-opus-5-5', PRICE = { input: 4, output: 20 }; // US$ per million tokens
export const cost = (u) => Math.round((u.input * PRICE.input + u.output * PRICE.output) / 1e4) / 100;

let client;
// One structured-output call for an evidence pack. `repair` feeds back the validator's errors for one more try.
// Returns the parsed JSON (or null), the stop reason, the model that served it and token usage.
export async function call(pack, repair) {
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  const p = AI.prompt(pack);
  const messages = [{ role: 'user', content: p.user }];
  if (repair) messages.push({ role: 'assistant', content: JSON.stringify(repair.output) }, { role: 'user', content: 'Dayweave rejected that output: ' + repair.errors.join('; ') + '. Return a corrected version.' });
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system: p.system, messages, output_config: { effort: 'medium', format: { type: 'json_schema', schema: p.schema } },
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let output = null;
  if (r.stop_reason === 'end_turn') try { output = JSON.parse(text); } catch { /* the caller reports it as no output */ }
  return { output, stop: r.stop_reason, model: r.model, usage: { input: r.usage.input_tokens, output: r.usage.output_tokens } };
}
