import OpenAI, { APIError } from 'openai';

import { ProviderError } from '../errors.js';
import type { LLMProvider } from '../types.js';

/**
 * OpenAI Chat Completions adapter.
 */
export function createOpenAIProvider(apiKey: string, model = 'gpt-4o'): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createOpenAIProvider: apiKey must be a non-empty string');
  }
  const client = new OpenAI({ apiKey });

  return {
    async complete(prompt: string): Promise<string> {
      try {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = res.choices[0]?.message?.content;
        return typeof text === 'string' ? text : '';
      } catch (error) {
        if (error instanceof APIError) {
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
