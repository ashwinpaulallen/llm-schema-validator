import { describe, expect, it, vi } from 'vitest';

import { coerce, defineSchema, query, validate } from '../src/index.js';

describe('standalone exports', () => {
  it('exports validate and coerce from the package root', () => {
    const schema = defineSchema({
      n: { type: 'number', required: true },
    });
    const coerced = coerce({ n: '42' }, schema);
    expect(coerced.n).toBe(42);
    expect(validate(coerced, schema)).toEqual([]);
    expect(validate({ n: 'x' }, schema).length).toBeGreaterThan(0);
  });
});

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

  it('extracts the final JSON when chain-of-thought includes an earlier illustrative object', async () => {
    const schema = defineSchema({
      answer: { type: 'number', required: true },
    });
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValue(
          'Let me sketch: {"draft": true}\n\nSo the result is:\n{"answer": 42}',
        ),
    };
    const result = await query({
      prompt: 'Compute.',
      schema,
      provider,
      chainOfThought: true,
      maxRetries: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data.answer).toBe(42);
  });

  it('supports root JSON array when rootType is array', async () => {
    const arraySchema = {
      type: 'array' as const,
      required: true,
      itemType: 'object' as const,
      itemProperties: {
        id: { type: 'string' as const, required: true },
      },
    };
    const provider = {
      complete: vi.fn().mockResolvedValue('[{"id":"a"},{"id":"b"}]'),
    };
    const result = await query({
      prompt: 'Return items.',
      rootType: 'array',
      arraySchema,
      provider,
      maxRetries: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});
