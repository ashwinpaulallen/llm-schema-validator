/**
 * Examples covering major `llm-schema-validator@1.3.0` APIs:
 * offline: `defineSchema`, `coerce`, `validate`, `fromJsonSchema`, `fromZod`
 * online: `query` object root (hooks, few-shot, system prompt, `promptTemplate`, cross-field `validate`, logging)
 * online: `query` array root
 * errors: `QueryRetriesExhaustedError`, `ProviderError` (pattern)
 */
import { config } from 'dotenv';
import {
  coerce,
  defineSchema,
  fromJsonSchema,
  fromZod,
  ProviderError,
  query,
  QueryRetriesExhaustedError,
  validate,
  type QueryResult,
} from 'llm-schema-validator';
import { z } from 'zod';
import { createOpenAIChatProvider } from './openai/openai-chat.provider.js';

config({ path: ['.env.local', '.env'] });

function section(title: string): void {
  console.log(`\n── ${title} ──\n`);
}

function logResult(label: string, r: QueryResult<unknown>): void {
  console.log(
    JSON.stringify(
      {
        label,
        success: r.success,
        attempts: r.attempts,
        durationMs: r.durationMs,
        usage: r.usage ?? null,
        errors: r.errors,
        data: r.data,
      },
      null,
      2,
    ),
  );
}

/** Runs without any LLM — safe for CI or quick checks. */
function runOfflineDemos(): void {
  section('Offline: defineSchema + coerce + validate');
  const s = defineSchema({
    n: { type: 'number', required: true },
    label: { type: 'string', required: true },
  });
  const coerced = coerce({ n: '42', label: 'ok' }, s);
  console.log('coerced:', coerced);
  console.log('validation:', validate(coerced, s));

  section('Offline: fromJsonSchema (draft-07 object root)');
  const fromJs = fromJsonSchema({
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  });
  console.log('schema keys:', Object.keys(fromJs));

  section('Offline: fromZod + coerce');
  const zodSchema = z.object({
    title: z.string(),
    stars: z.number().int().min(0).max(5),
  });
  const fromZ = fromZod(zodSchema);
  console.log('fromZod row:', coerce({ title: 'hi', stars: 4 }, fromZ));
}

async function runObjectRootQuery(
  provider: ReturnType<typeof createOpenAIChatProvider>,
): Promise<void> {
  section('query() — object root: systemPrompt, fewShot, validate, promptTemplate, onAttempt, onComplete, logLevel');
  const schema = defineSchema({
    summary: { type: 'string', required: true, minLength: 10 },
    confidence: { type: 'number', required: true, minimum: 0, maximum: 1 },
  });

  const attemptLog: string[] = [];

  const result = await query({
    prompt:
      'Summarize in one sentence: "Schema-guided LLM outputs are easier to trust in production." ' +
      'Include a confidence between 0 and 1.',
    schema,
    provider,
    systemPrompt: 'You return only a single JSON object matching the user schema. Be concise.',
    fewShot: [
      {
        input: 'Summarize: "Typing helps APIs stay stable."',
        output: {
          summary: 'Static typing improves API stability.',
          confidence: 0.85,
        },
      },
    ],
    maxRetries: 2,
    coerce: true,
    logLevel: 'info',
    providerTimeoutMs: 120_000,
    validate: (data) => {
      const summary = data.summary as string;
      const words = summary.trim().split(/\s+/).filter(Boolean).length;
      if (words < 3) return 'cross-field rule: summary should be at least 3 words';
      return null;
    },
    promptTemplate: (ctx) =>
      ctx.isRetry ? `[Retry ${ctx.attempt}/${ctx.maxAttempts}]\n${ctx.builtPrompt}` : ctx.builtPrompt,
    onAttempt: (attempt, errors, meta) => {
      attemptLog.push(
        `attempt ${attempt}: ${errors.length} error(s), ~${meta?.durationMs ?? '?'}ms in this attempt`,
      );
    },
    onComplete: (sum) => {
      console.log('[onComplete summary]', {
        success: sum.success,
        attempts: sum.attempts,
        durationMs: sum.durationMs,
        errorLines: sum.errors.length,
        usage: sum.usage ?? null,
      });
    },
  });

  logResult('object-root', result);
  console.log('onAttempt lines:', attemptLog);
}

async function runArrayRootQuery(
  provider: ReturnType<typeof createOpenAIChatProvider>,
): Promise<void> {
  section('query() — array root (rootType + arraySchema)');
  const result = await query({
    prompt: 'Return a JSON array of 2–4 short synonyms for the adjective "quick". Strings only.',
    rootType: 'array',
    arraySchema: {
      type: 'array',
      required: true,
      itemType: 'string',
      minItems: 2,
      maxItems: 6,
    },
    provider,
    maxRetries: 2,
    logLevel: 'silent',
    providerTimeoutMs: 120_000,
  });
  logResult('array-root', result);
}

async function main(): Promise<void> {
  runOfflineDemos();

  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  if (!baseURL || !model) {
    console.log(
      '\n(Skipping LLM demos: set OPENAI_BASE_URL and OPENAI_MODEL in .env — see README.)\n',
    );
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY ?? 'sk-local';
  const provider = createOpenAIChatProvider({ baseURL, apiKey, model });

  try {
    await runObjectRootQuery(provider);
    await runArrayRootQuery(provider);
  } catch (e) {
    if (e instanceof QueryRetriesExhaustedError) {
      console.error('[QueryRetriesExhaustedError]', {
        attempts: e.attempts,
        durationMs: e.durationMs,
        usage: e.usage ?? null,
        message: e.message,
      });
    } else if (e instanceof ProviderError) {
      console.error('[ProviderError]', e.message, e.cause ?? '');
    }
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
