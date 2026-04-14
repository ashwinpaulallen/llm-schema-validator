import { ProviderError } from '../errors.js';
import type { CompleteOptions, LLMProvider } from '../types.js';

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

/**
 * OpenAI Chat Completions adapter.
 */
export function createOpenAIProvider(apiKey: string, model = 'gpt-4o'): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createOpenAIProvider: apiKey must be a non-empty string');
  }
  let client: InstanceType<OpenAIModule['default']> | null = null;

  return {
    async complete(prompt: string, init?: CompleteOptions): Promise<string> {
      const openai = await loadOpenAIModule();
      if (!client) {
        client = new openai.default({ apiKey });
      }
      try {
        const body = {
          model,
          messages: [{ role: 'user', content: prompt }],
        };
        const res = (await (init?.signal !== undefined
          ? client.chat.completions.create(body, { signal: init.signal })
          : client.chat.completions.create(body))) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const text = res.choices?.[0]?.message?.content;
        return typeof text === 'string' ? text : '';
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
