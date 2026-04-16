import { ProviderError } from '../errors.js';
import type {
  CompleteOptions,
  LLMCompletion,
  LLMProvider,
  LLMProviderCompleteResult,
  Schema,
  StreamChunk,
  StreamingLLMProvider,
} from '../types.js';
import { toJsonSchema } from '../to-json-schema.js';

/**
 * OpenAI Structured Outputs configuration.
 * When enabled, the model is guaranteed to return valid JSON matching the schema.
 */
export interface OpenAIStructuredOutputsConfig {
  /**
   * The schema to enforce. Will be converted to JSON Schema format.
   */
  schema: Schema;
  /**
   * Name for the schema (required by OpenAI API).
   * @default 'response'
   */
  name?: string;
  /**
   * When `true`, skips client-side validation since OpenAI guarantees schema compliance.
   * @default false
   */
  skipValidation?: boolean;
  /**
   * Strict mode for JSON Schema. When true, all properties are required and
   * additionalProperties is false.
   * @default true
   */
  strict?: boolean;
}

/** Options forwarded to `chat.completions.create` (same names as the OpenAI API). */
export interface OpenAIProviderOptions {
  temperature?: number | null;
  top_p?: number | null;
  seed?: number | null;
  /**
   * Chat Completions `response_format`. The provider defaults to **`{ type: 'json_object' }`** (native JSON mode)
   * unless you set this — use **`{ type: 'text' }`** to disable JSON mode for models that do not support it.
   *
   * If `structuredOutputs` is set, this option is ignored and structured outputs mode is used instead.
   */
  response_format?: { type: 'json_object' } | { type: 'text' } | null;
  /**
   * When `true`, returns a streaming provider that yields chunks as they arrive.
   * Use `stream()` instead of `complete()` for progressive responses.
   * @default false
   */
  stream?: boolean;
  /**
   * Enable OpenAI's native Structured Outputs mode.
   * When set, the model is guaranteed to return JSON matching the provided schema.
   * This uses `response_format: { type: 'json_schema', json_schema: {...} }`.
   *
   * @example
   * createOpenAIProvider(apiKey, {
   *   model: 'gpt-4o',
   *   structuredOutputs: {
   *     schema: mySchema,
   *     skipValidation: true, // Safe since output is guaranteed valid
   *   },
   * });
   */
  structuredOutputs?: OpenAIStructuredOutputsConfig;
}

/** Dynamic `import('openai')` result; typed loosely to avoid TS resolution-mode clashes. */
type OpenAIModule = Record<string, unknown> & {
  default: new (opts: { apiKey: string }) => {
    chat: {
      completions: {
        create: (body: unknown, options?: { signal?: AbortSignal }) => Promise<unknown> | AsyncIterable<unknown>;
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

function buildOpenAIMessages(
  prompt: string,
  init?: CompleteOptions,
): Array<{ role: 'system' | 'user'; content: string }> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (init?.systemPrompt != null && init.systemPrompt.length > 0) {
    messages.push({ role: 'system', content: init.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

function buildStructuredOutputsResponseFormat(config: OpenAIStructuredOutputsConfig): Record<string, unknown> {
  const jsonSchema = toJsonSchema(config.schema);
  const { $schema: _, ...schemaWithoutMeta } = jsonSchema;

  return {
    type: 'json_schema',
    json_schema: {
      name: config.name ?? 'response',
      strict: config.strict !== false,
      schema: schemaWithoutMeta,
    },
  };
}

function buildOpenAIBody(
  model: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  requestOptions: OpenAIProviderOptions | undefined,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages };

  if (requestOptions?.structuredOutputs) {
    body.response_format = buildStructuredOutputsResponseFormat(requestOptions.structuredOutputs);
  } else {
    applyOpenAIRequestOptions(body, requestOptions);
    if (body.response_format === undefined) {
      body.response_format = { type: 'json_object' };
    }
  }

  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  return body;
}

/**
 * OpenAI Chat Completions adapter.
 *
 * @example
 * createOpenAIProvider(apiKey, 'gpt-4o', { temperature: 0.2 }) // JSON mode is on by default
 * @example
 * createOpenAIProvider(apiKey, { temperature: 0, seed: 42, response_format: { type: 'text' } }) // opt out of JSON mode
 * @example
 * createOpenAIProvider(apiKey, { stream: true }) // Returns StreamingLLMProvider
 */
export function createOpenAIProvider(
  apiKey: string,
  modelOrOptions?: string | OpenAIProviderOptions,
  maybeOptions?: OpenAIProviderOptions,
): LLMProvider | StreamingLLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createOpenAIProvider: apiKey must be a non-empty string');
  }
  const { model, requestOptions } = resolveOpenAIArgs(modelOrOptions, maybeOptions);
  let client: InstanceType<OpenAIModule['default']> | null = null;

  const usesStructuredOutputs = requestOptions?.structuredOutputs !== undefined;
  const usesJsonObjectMode = !usesStructuredOutputs && requestOptions?.response_format?.type !== 'text';
  const enableStreaming = requestOptions?.stream === true;
  const skipValidation = usesStructuredOutputs && requestOptions?.structuredOutputs?.skipValidation === true;

  async function ensureClient(): Promise<InstanceType<OpenAIModule['default']>> {
    const openai = await loadOpenAIModule();
    if (!client) {
      client = new openai.default({ apiKey });
    }
    return client;
  }

  const baseProvider: LLMProvider = {
    __providerId: 'openai' as const,
    __usesJsonObjectMode: usesJsonObjectMode,
    __usesStructuredOutputs: usesStructuredOutputs,
    __skipValidation: skipValidation,
    async complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult> {
      const c = await ensureClient();
      const openai = await loadOpenAIModule();
      try {
        const messages = buildOpenAIMessages(prompt, init);
        const body = buildOpenAIBody(model, messages, requestOptions, false);
        const res = (await (init?.signal !== undefined
          ? c.chat.completions.create(body, { signal: init.signal })
          : c.chat.completions.create(body))) as {
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

  if (!enableStreaming) {
    return baseProvider;
  }

  const streamingProvider: StreamingLLMProvider = {
    ...baseProvider,
    supportsStreaming: true as const,
    async *stream(prompt: string, init?: CompleteOptions): AsyncIterable<StreamChunk> {
      const c = await ensureClient();
      const openai = await loadOpenAIModule();
      try {
        const messages = buildOpenAIMessages(prompt, init);
        const body = buildOpenAIBody(model, messages, requestOptions, true);
        const streamResponse = (init?.signal !== undefined
          ? c.chat.completions.create(body, { signal: init.signal })
          : c.chat.completions.create(body)) as AsyncIterable<{
          choices?: Array<{ delta?: { content?: string | null } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        }>;

        for await (const chunk of streamResponse) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            yield { text: delta, done: false };
          }
          if (chunk.usage) {
            const u = chunk.usage;
            yield {
              text: '',
              done: true,
              usage: {
                promptTokens: u.prompt_tokens,
                completionTokens: u.completion_tokens,
                totalTokens: u.total_tokens,
              },
            };
          }
        }
      } catch (error) {
        if (error instanceof openai.APIError) {
          throw new ProviderError(
            `OpenAI API error (${error.status ?? 'unknown'}): ${error.message}`,
            error,
          );
        }
        throw new ProviderError(
          `OpenAI stream failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    },
  };

  return streamingProvider;
}
