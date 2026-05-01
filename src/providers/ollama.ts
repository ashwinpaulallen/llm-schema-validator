import { ProviderError } from '../errors.js';
import type {
  CompleteOptions,
  LLMCompletion,
  LLMProvider,
  LLMProviderCompleteResult,
  StreamChunk,
  StreamingLLMProvider,
} from '../types.js';

/** Options for the Ollama provider. */
export interface OllamaProviderOptions {
  /**
   * The Ollama model to use (e.g., 'llama3.2', 'mistral', 'codellama').
   * @default 'llama3.2'
   */
  model?: string;
  /**
   * Base URL for the Ollama API.
   * @default 'http://localhost:11434'
   */
  baseUrl?: string;
  /**
   * Temperature for generation (0.0 to 2.0).
   */
  temperature?: number;
  /**
   * Top-p sampling parameter.
   */
  topP?: number;
  /**
   * Top-k sampling parameter.
   */
  topK?: number;
  /**
   * Context window size.
   */
  numCtx?: number;
  /**
   * Seed for reproducible generation.
   */
  seed?: number;
  /**
   * When `true`, returns a streaming provider.
   * @default false
   */
  stream?: boolean;
  /**
   * When `true`, requests JSON output format.
   * @default true
   */
  jsonMode?: boolean;
  /**
   * Passed to Ollama as `keep_alive` (duration string, `true`, or `false`).
   * Set to **`false`** to unload the model after the request; omit or use **`true`** to keep it loaded.
   * @default true
   */
  keepAlive?: boolean | string;
}

type OllamaResponse = {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_BASE_URL = 'http://localhost:11434';

function extractOllamaUsage(response: OllamaResponse): LLMCompletion['usage'] {
  if (response.prompt_eval_count === undefined && response.eval_count === undefined) {
    return undefined;
  }
  return {
    promptTokens: response.prompt_eval_count,
    completionTokens: response.eval_count,
    totalTokens:
      response.prompt_eval_count !== undefined && response.eval_count !== undefined
        ? response.prompt_eval_count + response.eval_count
        : undefined,
  };
}

/**
 * Ollama local LLM API adapter.
 *
 * @example
 * createOllamaProvider() // Uses llama3.2 on localhost:11434 with JSON mode
 * @example
 * createOllamaProvider({ model: 'mistral', temperature: 0.2 })
 * @example
 * createOllamaProvider({ baseUrl: 'http://192.168.1.100:11434', model: 'codellama' })
 * @example
 * createOllamaProvider({ stream: true }) // Returns StreamingLLMProvider
 */
export function createOllamaProvider(
  options?: OllamaProviderOptions,
): LLMProvider | StreamingLLMProvider {
  const model = options?.model ?? DEFAULT_MODEL;
  const baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const enableStreaming = options?.stream === true;
  const jsonMode = options?.jsonMode !== false;
  const keepAlive = options?.keepAlive ?? true;

  function buildOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {};
    if (options?.temperature !== undefined) opts.temperature = options.temperature;
    if (options?.topP !== undefined) opts.top_p = options.topP;
    if (options?.topK !== undefined) opts.top_k = options.topK;
    if (options?.numCtx !== undefined) opts.num_ctx = options.numCtx;
    if (options?.seed !== undefined) opts.seed = options.seed;
    return opts;
  }

  function buildRequestBody(
    prompt: string,
    init?: CompleteOptions,
    stream: boolean = false,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      stream,
      options: buildOptions(),
      keep_alive: keepAlive,
    };

    if (jsonMode) {
      body.format = 'json';
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (init?.systemPrompt) {
      messages.push({ role: 'system', content: init.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    body.messages = messages;

    return body;
  }

  const baseProvider: LLMProvider = {
    __providerId: 'ollama' as const,
    async complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult> {
      const url = `${baseUrl}/api/chat`;
      const body = buildRequestBody(prompt, init, false);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: init?.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ProviderError(
            `Ollama API error (${response.status}): ${errorBody}`,
            new Error(errorBody),
          );
        }

        const data = (await response.json()) as OllamaResponse;
        const text = data.message?.content ?? data.response ?? '';
        const usage = extractOllamaUsage(data);
        const out: LLMCompletion = usage ? { text, usage } : { text };
        return out;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw new ProviderError(
            `Ollama connection failed. Is Ollama running at ${baseUrl}?`,
            error,
          );
        }
        throw new ProviderError(
          `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    },
  };

  if (!enableStreaming) {
    return baseProvider;
  }

  const streamingProvider: StreamingLLMProvider = {
    ...baseProvider,
    supportsStreaming: true as const,
    async *stream(prompt: string, init?: CompleteOptions): AsyncIterable<StreamChunk> {
      const url = `${baseUrl}/api/chat`;
      const body = buildRequestBody(prompt, init, true);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: init?.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ProviderError(
            `Ollama API error (${response.status}): ${errorBody}`,
            new Error(errorBody),
          );
        }

        reader = response.body?.getReader();
        if (!reader) {
          throw new ProviderError('Ollama stream: no response body', null);
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let lastUsage: LLMCompletion['usage'] | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line) as OllamaResponse;
                const text = chunk.message?.content ?? chunk.response ?? '';
                if (text) {
                  yield { text, done: false };
                }
                if (chunk.done) {
                  lastUsage = extractOllamaUsage(chunk);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        yield { text: '', done: true, usage: lastUsage };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw new ProviderError(
            `Ollama connection failed. Is Ollama running at ${baseUrl}?`,
            error,
          );
        }
        throw new ProviderError(
          `Ollama stream failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      } finally {
        if (reader) {
          try {
            await reader.cancel();
          } catch {
            /* release connection when consumer stops early or after natural completion */
          }
        }
      }
    },
  };

  return streamingProvider;
}
