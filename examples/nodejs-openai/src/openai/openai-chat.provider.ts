import OpenAI from 'openai';
import type { CompleteOptions, LLMProvider } from 'llm-schema-validator';

export interface OpenAIChatProviderOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
}

/** `LLMProvider` via the **`openai`** SDK against any Chat Completions–compatible `baseURL`. */
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
