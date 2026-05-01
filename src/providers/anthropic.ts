import { ProviderError } from '../errors.js';
import type { CompleteOptions, LLMCompletion, LLMProvider, LLMProviderCompleteResult } from '../types.js';

/** Dynamic `import('@anthropic-ai/sdk')` result; typed loosely to avoid TS resolution-mode clashes. */
type AnthropicModule = Record<string, unknown> & {
  default: new (opts: { apiKey: string }) => {
    messages: {
      create: (
        body: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<{ content: unknown; usage?: { input_tokens?: number; output_tokens?: number } }>;
    };
  };
  APIError: new (...args: unknown[]) => Error & { status?: number; message: string };
};

let moduleCache: AnthropicModule | null = null;

/** Clears the cached dynamic `import('@anthropic-ai/sdk')` result (test isolation, hot reload). */
export function clearAnthropicModuleCache(): void {
  moduleCache = null;
}

async function loadAnthropicModule(): Promise<AnthropicModule> {
  if (moduleCache) return moduleCache;
  try {
    moduleCache = (await import('@anthropic-ai/sdk')) as AnthropicModule;
    return moduleCache;
  } catch (cause) {
    throw new ProviderError(
      'Optional dependency "@anthropic-ai/sdk" is not installed. Install it with: npm install @anthropic-ai/sdk',
      cause,
    );
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('');
}

/** Anthropic API alias for Claude Sonnet 4.6 (current balanced default; see Anthropic model docs). */
const DEFAULT_MODEL = 'claude-sonnet-4-6';
/** Default `max_tokens` sent to the Messages API (Claude 3+ models support higher limits; raise for long outputs). */
const DEFAULT_MAX_TOKENS = 8192;

/** Factory options: model, `max_tokens`, and sampling / generation fields passed through to `messages.create`. */
export interface CreateAnthropicProviderOptions {
  /** @default 'claude-sonnet-4-6' */
  model?: string;
  /**
   * `max_tokens` for `messages.create`. Anthropic sets per-model ceilings (e.g. Opus allows large values);
   * use a lower value when you want shorter replies.
   * @default 8192
   */
  maxTokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  /** When supported by the API / model. */
  seed?: number;
  stop_sequences?: string[];
}

function applyAnthropicSampling(body: Record<string, unknown>, opts: CreateAnthropicProviderOptions): void {
  for (const k of ['temperature', 'top_p', 'top_k', 'seed', 'stop_sequences'] as const) {
    const v = opts[k];
    if (v !== undefined && v !== null) {
      body[k] = v;
    }
  }
}

/**
 * Anthropic Messages API adapter.
 *
 * @example
 * createAnthropicProvider(apiKey, 'claude-sonnet-4-6')
 * @example
 * createAnthropicProvider(apiKey, { model: 'claude-opus-4-6', maxTokens: 32768, temperature: 0.3 })
 */
export function createAnthropicProvider(
  apiKey: string,
  modelOrOptions?: string | CreateAnthropicProviderOptions,
): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createAnthropicProvider: apiKey must be a non-empty string');
  }

  const isOpts = typeof modelOrOptions === 'object' && modelOrOptions !== null;
  const model =
    typeof modelOrOptions === 'string' ? modelOrOptions : (isOpts ? modelOrOptions.model : undefined) ?? DEFAULT_MODEL;
  const maxTokens =
    typeof modelOrOptions === 'string'
      ? DEFAULT_MAX_TOKENS
      : (isOpts ? modelOrOptions.maxTokens : undefined) ?? DEFAULT_MAX_TOKENS;
  const samplingFrom = isOpts ? modelOrOptions : undefined;

  let client: InstanceType<AnthropicModule['default']> | null = null;

  return {
    async complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult> {
      const Anthropic = await loadAnthropicModule();
      if (!client) {
        client = new Anthropic.default({ apiKey });
      }
      try {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        };
        if (init?.systemPrompt != null && init.systemPrompt.length > 0) {
          body.system = init.systemPrompt;
        }
        if (samplingFrom) {
          applyAnthropicSampling(body, samplingFrom);
        }
        const res =
          init?.signal !== undefined
            ? await client.messages.create(body, { signal: init.signal })
            : await client.messages.create(body);
        const text = textFromContent(res.content);
        const u = res.usage;
        const usage =
          u && (u.input_tokens !== undefined || u.output_tokens !== undefined)
            ? {
                promptTokens: u.input_tokens,
                completionTokens: u.output_tokens,
                totalTokens:
                  u.input_tokens !== undefined && u.output_tokens !== undefined
                    ? u.input_tokens + u.output_tokens
                    : undefined,
              }
            : undefined;
        const out: LLMCompletion = usage ? { text, usage } : { text };
        return out;
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new ProviderError(
            `Anthropic API error (${error.status ?? 'unknown'}): ${error.message}`,
            error,
          );
        }
        throw new ProviderError(
          `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    },
  };
}
