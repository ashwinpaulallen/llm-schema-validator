import type { CompleteOptions, LLMProvider } from '../types.js';

/**
 * Wrap any async `(prompt) => string` as an {@link LLMProvider}.
 * The function may accept an optional second argument with `signal` for cancellation.
 */
export function createCustomProvider(
  fn: (prompt: string, init?: CompleteOptions) => Promise<string>,
): LLMProvider {
  if (typeof fn !== 'function') {
    throw new TypeError('[llm-schema-validator] createCustomProvider: fn must be a function');
  }
  return {
    complete: (prompt, init) => fn(prompt, init),
  };
}
