import { describe, expect, it } from 'vitest';

import { createOpenAIProvider } from '../../src/providers/openai.js';
import { createAnthropicProvider } from '../../src/providers/anthropic.js';
import { createCustomProvider } from '../../src/providers/custom.js';

describe('provider input validation', () => {
  it('createOpenAIProvider throws for empty apiKey', () => {
    expect(() => createOpenAIProvider('')).toThrow(TypeError);
    expect(() => createOpenAIProvider(null as any)).toThrow(TypeError);
  });

  it('createAnthropicProvider throws for empty apiKey', () => {
    expect(() => createAnthropicProvider('')).toThrow(TypeError);
    expect(() => createAnthropicProvider(undefined as any)).toThrow(TypeError);
  });

  it('createCustomProvider throws for non-function', () => {
    expect(() => createCustomProvider(null as any)).toThrow(TypeError);
    expect(() => createCustomProvider('string' as any)).toThrow(TypeError);
  });
});
