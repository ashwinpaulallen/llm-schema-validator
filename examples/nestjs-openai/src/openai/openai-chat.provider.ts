import OpenAI from 'openai';
import type { CompleteOptions, LLMProvider } from 'llm-schema-validator';

/** Options for the official **`openai`** client (`OpenAI` class) with a custom `baseURL`. */
export interface OpenAIChatProviderOptions {
  /** Chat Completions API root including `/v1` (e.g. `https://api.openai.com/v1` or a compatible proxy). */
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
}

/**
 * Builds an {@link LLMProvider} using **`openai`** `chat.completions.create`.
 * Use with OpenAI’s API or any **OpenAI-compatible** Chat Completions server (same request shape).
 *
 * Omits `response_format: json_object` by default so more backends work; `llm-schema-validator`
 * still extracts JSON from the model reply.
 */
export function createOpenAIChatProvider(options: OpenAIChatProviderOptions): LLMProvider {
  const baseURL = options.baseURL.replace(/\/$/, '');
  const client = new OpenAI({
    baseURL,
    apiKey: options.apiKey,
  });
  const { model, temperature = 0.35 } = options;

  return {
    async complete(prompt: string, init?: CompleteOptions): Promise<string> {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (init?.systemPrompt?.trim()) {
        messages.push({ role: 'system', content: init.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const completion = await client.chat.completions.create(
        {
          model,
          messages,
          temperature,
        },
        init?.signal !== undefined ? { signal: init.signal } : undefined,
      );

      const text = completion.choices[0]?.message?.content;
      return typeof text === 'string' ? text : '';
    },
  };
}
