import type { CompleteOptions, LLMProvider, LLMProviderCompleteResult } from '../types.js';

/**
 * Wrap any async completion function as an {@link LLMProvider}.
 * The function may accept an optional second argument with `signal` for cancellation.
 * Return a plain `string` or `{ text, usage? }` when you have token counts.
 */
export function createCustomProvider(
  fn: (prompt: string, init?: CompleteOptions) => Promise<LLMProviderCompleteResult>,
): LLMProvider {
  if (typeof fn !== 'function') {
    throw new TypeError('[llm-schema-validator] createCustomProvider: fn must be a function');
  }
  return {
    complete: (prompt, init) => fn(prompt, init),
  };
}
