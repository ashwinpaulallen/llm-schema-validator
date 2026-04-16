import { ProviderError } from '../errors.js';
import type {
  CompleteOptions,
  LLMCompletion,
  LLMProvider,
  LLMProviderCompleteResult,
  StreamChunk,
  StreamingLLMProvider,
} from '../types.js';

/** Options for the Gemini provider. */
export interface GeminiProviderOptions {
  /**
   * The Gemini model to use.
   * @default 'gemini-1.5-flash'
   */
  model?: string;
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
   * Maximum number of tokens to generate.
   */
  maxOutputTokens?: number;
  /**
   * When `true`, returns a streaming provider.
   * @default false
   */
  stream?: boolean;
  /**
   * When `true`, enables JSON mode by setting response MIME type.
   * @default true
   */
  jsonMode?: boolean;
}

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

type GeminiGenerationConfig = {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

const DEFAULT_MODEL = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildGeminiUrl(model: string, apiKey: string, stream: boolean): string {
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  return `${GEMINI_API_BASE}/${model}:${action}?key=${apiKey}${stream ? '&alt=sse' : ''}`;
}

function extractGeminiText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return '';
  return parts.map((p) => p.text ?? '').join('');
}

function extractGeminiUsage(response: GeminiResponse): LLMCompletion['usage'] {
  const u = response.usageMetadata;
  if (!u) return undefined;
  return {
    promptTokens: u.promptTokenCount,
    completionTokens: u.candidatesTokenCount,
    totalTokens: u.totalTokenCount,
  };
}

/**
 * Google Gemini API adapter.
 *
 * @example
 * createGeminiProvider(apiKey) // Uses gemini-1.5-flash with JSON mode
 * @example
 * createGeminiProvider(apiKey, { model: 'gemini-1.5-pro', temperature: 0.2 })
 * @example
 * createGeminiProvider(apiKey, { stream: true }) // Returns StreamingLLMProvider
 */
export function createGeminiProvider(
  apiKey: string,
  options?: GeminiProviderOptions,
): LLMProvider | StreamingLLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createGeminiProvider: apiKey must be a non-empty string');
  }

  const model = options?.model ?? DEFAULT_MODEL;
  const enableStreaming = options?.stream === true;
  const jsonMode = options?.jsonMode !== false;

  function buildGenerationConfig(): GeminiGenerationConfig {
    const config: GeminiGenerationConfig = {};
    if (options?.temperature !== undefined) config.temperature = options.temperature;
    if (options?.topP !== undefined) config.topP = options.topP;
    if (options?.topK !== undefined) config.topK = options.topK;
    if (options?.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
    if (jsonMode) config.responseMimeType = 'application/json';
    return config;
  }

  function buildRequestBody(prompt: string, init?: CompleteOptions): Record<string, unknown> {
    const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: prompt }] }];

    const body: Record<string, unknown> = {
      contents,
      generationConfig: buildGenerationConfig(),
    };

    if (init?.systemPrompt) {
      body.systemInstruction = { parts: [{ text: init.systemPrompt }] };
    }

    return body;
  }

  const baseProvider: LLMProvider = {
    __providerId: 'gemini' as const,
    async complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult> {
      const url = buildGeminiUrl(model, apiKey, false);
      const body = buildRequestBody(prompt, init);

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
            `Gemini API error (${response.status}): ${errorBody}`,
            new Error(errorBody),
          );
        }

        const data = (await response.json()) as GeminiResponse;
        const text = extractGeminiText(data);
        const usage = extractGeminiUsage(data);
        const out: LLMCompletion = usage ? { text, usage } : { text };
        return out;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`,
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
      const url = buildGeminiUrl(model, apiKey, true);
      const body = buildRequestBody(prompt, init);

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
            `Gemini API error (${response.status}): ${errorBody}`,
            new Error(errorBody),
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new ProviderError('Gemini stream: no response body', null);
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
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  const chunk = JSON.parse(jsonStr) as GeminiResponse;
                  const text = extractGeminiText(chunk);
                  if (text) {
                    yield { text, done: false };
                  }
                  const usage = extractGeminiUsage(chunk);
                  if (usage) {
                    lastUsage = usage;
                  }
                } catch {
                  // Skip invalid JSON chunks
                }
              }
            }
          }
        }

        yield { text: '', done: true, usage: lastUsage };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          `Gemini stream failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    },
  };

  return streamingProvider;
}
