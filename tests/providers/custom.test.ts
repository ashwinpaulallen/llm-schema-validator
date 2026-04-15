import { describe, expect, it, vi } from 'vitest';

import { createCustomProvider } from '../../src/providers/custom.js';

describe('createCustomProvider', () => {
  it('wraps an async function as LLMProvider', async () => {
    const fn = vi.fn().mockResolvedValue('hello');
    const p = createCustomProvider(fn);
    await expect(p.complete('prompt')).resolves.toBe('hello');
    expect(fn).toHaveBeenCalledWith('prompt', undefined);
  });

  it('allows returning completion + usage for query() aggregation', async () => {
    const p = createCustomProvider(async () => ({
      text: '{}',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }));
    await expect(p.complete('x')).resolves.toEqual({
      text: '{}',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
  });
});
