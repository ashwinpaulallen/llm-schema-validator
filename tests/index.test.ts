import { describe, expect, it, vi } from 'vitest';

import { defineSchema, query } from '../src/index.js';

describe('defineSchema', () => {
  it('returns the same object reference', () => {
    const s = { a: { type: 'string' as const, required: true } };
    expect(defineSchema(s)).toBe(s);
  });
});

describe('query', () => {
  it('delegates to executeWithRetry and returns typed result', async () => {
    const schema = defineSchema({
      x: { type: 'number', required: true },
    });
    const provider = {
      complete: vi.fn().mockResolvedValue('{"x": 99}'),
    };
    const result = await query({
      prompt: 'test',
      schema,
      provider,
      maxRetries: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data.x).toBe(99);
  });
});
