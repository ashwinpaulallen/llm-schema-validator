import Anthropic, { APIError } from '@anthropic-ai/sdk';

import { ProviderError } from '../errors.js';
import type { LLMProvider } from '../types.js';

function textFromContent(content: Anthropic.Message['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Anthropic Messages API adapter.
 */
export function createAnthropicProvider(
  apiKey: string,
  model = 'claude-sonnet-4-20250514',
): LLMProvider {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new TypeError('[llm-schema-validator] createAnthropicProvider: apiKey must be a non-empty string');
  }
  const client = new Anthropic({ apiKey });

  return {
    async complete(prompt: string): Promise<string> {
      try {
        const res = await client.messages.create({
          model,
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        });
        return textFromContent(res.content);
      } catch (error) {
        if (error instanceof APIError) {
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
