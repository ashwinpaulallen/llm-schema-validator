import { ProviderError } from '../errors.js';
import type { CompleteOptions, LLMProvider } from '../types.js';

/** Dynamic `import('@anthropic-ai/sdk')` result; typed loosely to avoid TS resolution-mode clashes. */
type AnthropicModule = Record<string, unknown> & {
  default: new (opts: { apiKey: string }) => {
    messages: {
      create: (body: unknown, options?: { signal?: AbortSignal }) => Promise<{ content: unknown }>;
    };
  };
  APIError: new (...args: unknown[]) => Error & { status?: number; message: string };
};

let moduleCache: AnthropicModule | null = null;

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

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
/** Default `max_tokens` sent to the Messages API (Claude 3+ models support higher limits; raise for long outputs). */
const DEFAULT_MAX_TOKENS = 8192;

export interface CreateAnthropicProviderOptions {
  /** @default 'claude-sonnet-4-20250514' */
  model?: string;
  /**
   * `max_tokens` for `messages.create`. Anthropic sets per-model ceilings (e.g. Opus allows large values);
   * use a lower value when you want shorter replies.
   * @default 8192
   */
  maxTokens?: number;
}

function resolveAnthropicConfig(
  modelOrOptions?: string | CreateAnthropicProviderOptions,
): { model: string; maxTokens: number } {
  if (modelOrOptions === undefined) {
    return { model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  }
  if (typeof modelOrOptions === 'string') {
    return { model: modelOrOptions, maxTokens: DEFAULT_MAX_TOKENS };
  }
  return {
    model: modelOrOptions.model ?? DEFAULT_MODEL,
    maxTokens: modelOrOptions.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
}

/**
 * Anthropic Messages API adapter.
 *
 * @example
 * createAnthropicProvider(apiKey, 'claude-sonnet-4-20250514')
 * @example
 * createAnthropicProvider(apiKey, { model: 'claude-opus-4-20250514', maxTokens: 32768 })
 */
export function createAnthropicProvider(
  apiKey: string,
  modelOrOptions?: string | CreateAnthropicProviderOptions,
): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createAnthropicProvider: apiKey must be a non-empty string');
  }
  const { model, maxTokens } = resolveAnthropicConfig(modelOrOptions);
  let client: InstanceType<AnthropicModule['default']> | null = null;

  return {
    async complete(prompt: string, init?: CompleteOptions): Promise<string> {
      const Anthropic = await loadAnthropicModule();
      if (!client) {
        client = new Anthropic.default({ apiKey });
      }
      try {
        const body = {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        };
        const res =
          init?.signal !== undefined
            ? await client.messages.create(body, { signal: init.signal })
            : await client.messages.create(body);
        return textFromContent(res.content);
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
