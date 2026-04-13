import type { LLMProvider } from '../types.js';

/**
 * Wrap any async `(prompt) => string` as an {@link LLMProvider}.
 */
export function createCustomProvider(fn: (prompt: string) => Promise<string>): LLMProvider {
  if (typeof fn !== 'function') {
    throw new TypeError('[llm-schema-validator] createCustomProvider: fn must be a function');
  }
  return {
    complete: fn,
  };
}
