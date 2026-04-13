import { describe, expect, it, vi } from 'vitest';

import { QueryRetriesExhaustedError } from '../src/errors.js';
import { executeWithRetry } from '../src/retry.js';
import type { QueryOptions } from '../src/types.js';

const baseSchema: QueryOptions['schema'] = {
  answer: { type: 'number', required: true },
};

function opts(overrides: Partial<QueryOptions> & { provider: QueryOptions['provider'] }): QueryOptions {
  return {
    prompt: 'Return JSON with answer 42.',
    schema: baseSchema,
    maxRetries: 3,
    coerce: true,
    ...overrides,
  };
}

describe('executeWithRetry', () => {
  it('returns success on first valid response', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 42}'),
    };
    const result = await executeWithRetry(opts({ provider }));
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.data).toEqual({ answer: 42 });
    expect(result.errors).toEqual([]);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('retries on validation failure then succeeds', async () => {
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"answer": "not a number"}')
        .mockResolvedValueOnce('{"answer": 1}'),
    };
    const result = await executeWithRetry(
      opts({ provider, maxRetries: 3, coerce: false }),
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting attempts', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": "bad"}'),
    };
    try {
      await executeWithRetry(opts({ provider, maxRetries: 2, coerce: false }));
    } catch (e) {
      expect(e).toBeInstanceOf(QueryRetriesExhaustedError);
      expect((e as QueryRetriesExhaustedError).attempts).toBe(2);
      expect(provider.complete).toHaveBeenCalledTimes(2);
      return;
    }
    throw new Error('expected QueryRetriesExhaustedError');
  });

  it('returns partial data when fallbackToPartial is true', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": "still wrong"}'),
    };
    const result = await executeWithRetry(
      opts({ provider, maxRetries: 1, coerce: false, fallbackToPartial: true }),
    );
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ answer: 'still wrong' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('skips coercion when coerce is false so invalid types fail validation', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": "7"}'),
    };
    await expect(
      executeWithRetry(opts({ provider, maxRetries: 1, coerce: false })),
    ).rejects.toThrow(/Failed after 1 attempt/);
  });

  it('logs when debug is true', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 1}'),
    };
    await executeWithRetry(opts({ provider, debug: true }));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('uses injected logger.debug when provided', async () => {
    const debug = vi.fn();
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 1}'),
    };
    await executeWithRetry(opts({ provider, logger: { debug } }));
    expect(debug).toHaveBeenCalled();
  });

  it('retries after JSON parse failure', async () => {
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('not json')
        .mockResolvedValueOnce('{"answer": 2}'),
    };
    const result = await executeWithRetry(opts({ provider, maxRetries: 3 }));
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries when root is array instead of object', async () => {
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('[1]')
        .mockResolvedValueOnce('{"answer": 3}'),
    };
    const result = await executeWithRetry(opts({ provider, maxRetries: 3 }));
    expect(result.success).toBe(true);
    expect((result.data as { answer: number }).answer).toBe(3);
  });
});
