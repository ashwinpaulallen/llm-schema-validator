import { ProviderError } from '../errors.js';
import type { CompleteOptions, LLMCompletion, LLMProvider, LLMProviderCompleteResult } from '../types.js';

/** Options forwarded to `chat.completions.create` (same names as the OpenAI API). */
export interface OpenAIProviderOptions {
  temperature?: number | null;
  top_p?: number | null;
  seed?: number | null;
  /**
   * Chat Completions `response_format`. The provider defaults to **`{ type: 'json_object' }`** (native JSON mode)
   * unless you set this — use **`{ type: 'text' }`** to disable JSON mode for models that do not support it.
   */
  response_format?: { type: 'json_object' } | { type: 'text' } | null;
}

/** Dynamic `import('openai')` result; typed loosely to avoid TS resolution-mode clashes. */
type OpenAIModule = Record<string, unknown> & {
  default: new (opts: { apiKey: string }) => {
    chat: {
      completions: {
        create: (body: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
      };
    };
  };
  APIError: new (...args: unknown[]) => Error & { status?: number; message: string };
};

let moduleCache: OpenAIModule | null = null;

async function loadOpenAIModule(): Promise<OpenAIModule> {
  if (moduleCache) return moduleCache;
  try {
    moduleCache = (await import('openai')) as OpenAIModule;
    return moduleCache;
  } catch (cause) {
    throw new ProviderError(
      'Optional dependency "openai" is not installed. Install it with: npm install openai',
      cause,
    );
  }
}

function applyOpenAIRequestOptions(body: Record<string, unknown>, opts?: OpenAIProviderOptions): void {
  if (!opts) return;
  const keys = ['temperature', 'top_p', 'seed', 'response_format'] as const;
  for (const k of keys) {
    const v = opts[k];
    if (v !== undefined && v !== null) {
      body[k] = v;
    }
  }
}

function resolveOpenAIArgs(
  modelOrOptions?: string | OpenAIProviderOptions,
  maybeOptions?: OpenAIProviderOptions,
): { model: string; requestOptions?: OpenAIProviderOptions } {
  if (modelOrOptions === undefined) {
    return { model: 'gpt-4o', requestOptions: maybeOptions };
  }
  if (typeof modelOrOptions === 'string') {
    return { model: modelOrOptions, requestOptions: maybeOptions };
  }
  return { model: 'gpt-4o', requestOptions: modelOrOptions };
}

/**
 * OpenAI Chat Completions adapter.
 *
 * @example
 * createOpenAIProvider(apiKey, 'gpt-4o', { temperature: 0.2 }) // JSON mode is on by default
 * @example
 * createOpenAIProvider(apiKey, { temperature: 0, seed: 42, response_format: { type: 'text' } }) // opt out of JSON mode
 */
export function createOpenAIProvider(
  apiKey: string,
  modelOrOptions?: string | OpenAIProviderOptions,
  maybeOptions?: OpenAIProviderOptions,
): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createOpenAIProvider: apiKey must be a non-empty string');
  }
  const { model, requestOptions } = resolveOpenAIArgs(modelOrOptions, maybeOptions);
  let client: InstanceType<OpenAIModule['default']> | null = null;

  return {
    async complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult> {
      const openai = await loadOpenAIModule();
      if (!client) {
        client = new openai.default({ apiKey });
      }
      try {
        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        if (init?.systemPrompt != null && init.systemPrompt.length > 0) {
          messages.push({ role: 'system', content: init.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        const body: Record<string, unknown> = {
          model,
          messages,
        };
        applyOpenAIRequestOptions(body, requestOptions);
        if (body.response_format === undefined) {
          body.response_format = { type: 'json_object' };
        }
        const res = (await (init?.signal !== undefined
          ? client.chat.completions.create(body, { signal: init.signal })
          : client.chat.completions.create(body))) as {
          choices?: Array<{ message?: { content?: string | null } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };
        const text = res.choices?.[0]?.message?.content;
        const content = typeof text === 'string' ? text : '';
        const u = res.usage;
        const usage =
          u &&
          (u.prompt_tokens !== undefined || u.completion_tokens !== undefined || u.total_tokens !== undefined)
            ? {
                promptTokens: u.prompt_tokens,
                completionTokens: u.completion_tokens,
                totalTokens: u.total_tokens,
              }
            : undefined;
        const out: LLMCompletion = usage ? { text: content, usage } : { text: content };
        return out;
      } catch (error) {
        if (error instanceof openai.APIError) {
          throw new ProviderError(
            `OpenAI API error (${error.status ?? 'unknown'}): ${error.message}`,
            error,
          );
        }
        throw new ProviderError(
          `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    },
  };
}
