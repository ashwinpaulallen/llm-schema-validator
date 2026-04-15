import { describe, expect, it, vi } from 'vitest';

import { ProviderError, QueryRetriesExhaustedError } from '../src/errors.js';
import { executeWithRetry } from '../src/retry.js';
import type { QueryObjectOptions, QueryOptions, Schema } from '../src/types.js';

const baseSchema: Schema = {
  answer: { type: 'number', required: true },
};

function opts(
  overrides: Partial<QueryObjectOptions<Schema>> & { provider: QueryOptions['provider'] },
): QueryObjectOptions<Schema> {
  return {
    prompt: 'Return JSON with answer 42.',
    schema: baseSchema,
    maxRetries: 3,
    coerce: true,
    ...overrides,
  };
}

describe('executeWithRetry', () => {
  it('throws when fewShot output is not a plain object for object root', async () => {
    const provider = { complete: vi.fn() };
    await expect(
      executeWithRetry(
        opts({
          provider,
          fewShot: [{ input: 'x', output: [1, 2] as unknown }],
        }),
      ),
    ).rejects.toThrow(/fewShot\[0\].*plain object/);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('throws when fewShot input is not a string', async () => {
    const provider = { complete: vi.fn() };
    await expect(
      executeWithRetry(
        opts({
          provider,
          fewShot: [{ input: 1 as unknown as string, output: {} }],
        }),
      ),
    ).rejects.toThrow(/fewShot\[0\].*input must be a string/);
  });

  it('throws when fewShot output is not an array for array root', async () => {
    const provider = { complete: vi.fn() };
    await expect(
      executeWithRetry({
        prompt: 'List.',
        rootType: 'array',
        arraySchema: {
          type: 'array',
          required: true,
          itemType: 'string',
        },
        provider,
        maxRetries: 1,
        fewShot: [{ input: 'a', output: { x: 1 } }],
      }),
    ).rejects.toThrow(/fewShot\[0\].*must be an array when rootType is 'array'/);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('applies promptTemplate to the built prompt before complete', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 42}'),
    };
    await executeWithRetry(
      opts({
        provider,
        promptTemplate: (ctx) => `[HOUSE]\n${ctx.builtPrompt}`,
      }),
    );
    const arg = provider.complete.mock.calls[0]![0] as string;
    expect(arg.startsWith('[HOUSE]')).toBe(true);
    expect(arg).toContain('Return JSON with answer 42');
    expect(arg).toContain('Match this shape');
  });

  it('passes PromptTemplateContext with attempt and isRetry on retries', async () => {
    const seen: { attempt: number; isRetry: boolean; taskPrompt: string }[] = [];
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"answer": "not"}')
        .mockResolvedValueOnce('{"answer": 42}'),
    };
    await executeWithRetry(
      opts({
        provider,
        maxRetries: 2,
        coerce: false,
        promptTemplate: (ctx) => {
          seen.push({ attempt: ctx.attempt, isRetry: ctx.isRetry, taskPrompt: ctx.taskPrompt });
          return ctx.builtPrompt;
        },
      }),
    );
    expect(seen).toEqual([
      { attempt: 1, isRetry: false, taskPrompt: 'Return JSON with answer 42.' },
      { attempt: 2, isRetry: true, taskPrompt: 'Return JSON with answer 42.' },
    ]);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('throws when promptTemplate does not return a string', async () => {
    const provider = { complete: vi.fn() };
    await expect(
      executeWithRetry(
        opts({
          provider,
          promptTemplate: () => null as unknown as string,
        }),
      ),
    ).rejects.toThrow(/promptTemplate must return a string/);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('passes chainOfThought instructions to provider.complete', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 42}'),
    };
    await executeWithRetry(opts({ provider, chainOfThought: true }));
    const arg = provider.complete.mock.calls[0]![0] as string;
    expect(arg).toMatch(/Reasoning:/i);
    expect(arg).toContain('step by step');
  });

  it('passes fewShot text to provider.complete', async () => {
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 42}'),
    };
    await executeWithRetry(
      opts({
        provider,
        fewShot: [{ input: 'demo', output: { answer: 1 } }],
      }),
    );
    const arg = provider.complete.mock.calls[0]![0] as string;
    expect(arg).toContain('demo');
    expect(arg).toContain('Examples');
    expect(arg).toContain('"answer"');
  });

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

  it('rejects when provider never settles and providerTimeoutMs elapses', async () => {
    const provider = {
      complete: () => new Promise<string>(() => {}),
    };
    await expect(
      executeWithRetry(opts({ provider, providerTimeoutMs: 30, maxRetries: 1 })),
    ).rejects.toThrow(ProviderError);
  });

  it('rejects when outer signal aborts during a slow complete', async () => {
    const controller = new AbortController();
    const provider = {
      complete: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('{"answer": 1}'), 200);
        }),
    };
    const p = executeWithRetry(opts({ provider, signal: controller.signal, maxRetries: 1 }));
    controller.abort();
    await expect(p).rejects.toThrow(ProviderError);
  });

  it('forwards systemPrompt to provider.complete', async () => {
    const complete = vi.fn().mockResolvedValue('{"answer": 1}');
    const provider = { complete };
    await executeWithRetry(
      opts({ provider, systemPrompt: 'Only output JSON.', maxRetries: 1 }),
    );
    expect(complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ systemPrompt: 'Only output JSON.' }),
    );
  });

  it('waits retryDelayMs before a subsequent attempt', async () => {
    vi.useFakeTimers();
    try {
      const provider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce('{"answer":"x"}')
          .mockResolvedValueOnce('{"answer": 1}'),
      };
      const resultPromise = executeWithRetry(
        opts({ provider, maxRetries: 3, coerce: false, retryDelayMs: 500 }),
      );

      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(provider.complete).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(499);
      expect(provider.complete).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(provider.complete).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses exponential delays when retryBackoffMultiplier is default', async () => {
    const debug = vi.fn();
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"answer":"a"}')
        .mockResolvedValueOnce('{"answer":"b"}')
        .mockResolvedValueOnce('{"answer": 1}'),
    };
    await executeWithRetry(
      opts({
        provider,
        logger: { debug },
        maxRetries: 4,
        coerce: false,
        retryDelayMs: 100,
      }),
    );
    const backoffCalls = debug.mock.calls
      .map((c) => c[0] as string)
      .filter((m) => m.includes('retry backoff'));
    expect(backoffCalls.some((m) => m.includes('100ms'))).toBe(true);
    expect(backoffCalls.some((m) => m.includes('200ms'))).toBe(true);
  });

  it('uses fixed delay when retryBackoffMultiplier is 1', async () => {
    const debug = vi.fn();
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"answer":"a"}')
        .mockResolvedValueOnce('{"answer":"b"}')
        .mockResolvedValueOnce('{"answer": 1}'),
    };
    await executeWithRetry(
      opts({
        provider,
        logger: { debug },
        maxRetries: 4,
        coerce: false,
        retryDelayMs: 50,
        retryBackoffMultiplier: 1,
      }),
    );
    const backoffCalls = debug.mock.calls
      .map((c) => c[0] as string)
      .filter((m) => m.includes('retry backoff'));
    expect(backoffCalls.every((m) => m.includes('50ms'))).toBe(true);
    expect(backoffCalls.length).toBe(2);
  });

  it('calls onAttempt with empty errors on success', async () => {
    const onAttempt = vi.fn();
    const provider = {
      complete: vi.fn().mockResolvedValue('{"answer": 42}'),
    };
    await executeWithRetry(opts({ provider, onAttempt }));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(1, []);
  });

  it('calls onAttempt per attempt with validation errors then empty on success', async () => {
    const onAttempt = vi.fn();
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"answer": "bad"}')
        .mockResolvedValueOnce('{"answer": 1}'),
    };
    await executeWithRetry(opts({ provider, maxRetries: 3, coerce: false, onAttempt }));
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[0]).toEqual([
      1,
      [expect.stringContaining('field "answer"')],
    ]);
    expect(onAttempt.mock.calls[1]).toEqual([2, []]);
  });

  it('calls onAttempt before throwing on provider failure', async () => {
    const onAttempt = vi.fn();
    const provider = {
      complete: vi.fn().mockRejectedValue(new Error('network')),
    };
    await expect(executeWithRetry(opts({ provider, maxRetries: 1, onAttempt }))).rejects.toThrow(
      ProviderError,
    );
    expect(onAttempt).toHaveBeenCalledWith(1, [expect.stringContaining('network')]);
  });

  it('retries when query-level validate fails then succeeds', async () => {
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('{"start":"2024-01-02","end":"2024-01-01"}')
        .mockResolvedValueOnce('{"start":"2024-01-01","end":"2024-01-02"}'),
    };
    const schema: Schema = {
      start: { type: 'string', required: true, format: 'date' },
      end: { type: 'string', required: true, format: 'date' },
    };
    const result = await executeWithRetry(
      opts({
        provider,
        schema,
        maxRetries: 3,
        validate: (data) => {
          const s = data.start as string;
          const e = data.end as string;
          if (s >= e) return 'end must be after start';
          return null;
        },
      }),
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('runs query validate on array root', async () => {
    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('[1,2,3]')
        .mockResolvedValueOnce('[1,2]'),
    };
    const result = await executeWithRetry({
      prompt: 'x',
      provider,
      rootType: 'array',
      arraySchema: { type: 'array', required: true, itemType: 'number' },
      maxRetries: 3,
      validate: (arr) => (arr.length <= 2 ? null : 'at most 2 items'),
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2]);
  });

  it('includes query-level validation in onAttempt errors', async () => {
    const onAttempt = vi.fn();
    const provider = {
      complete: vi.fn().mockResolvedValue('{"a":1,"b":1}'),
    };
    await expect(
      executeWithRetry(
        opts({
          provider,
          schema: {
            a: { type: 'number', required: true },
            b: { type: 'number', required: true },
          },
          maxRetries: 1,
          coerce: false,
          onAttempt,
          validate: (d) => ((d.a as number) < (d.b as number) ? null : 'a must be less than b'),
        }),
      ),
    ).rejects.toThrow(QueryRetriesExhaustedError);
    const errors = onAttempt.mock.calls[0][1] as string[];
    expect(errors[0]).toMatch(/\(query\)/);
    expect(errors[0]).toMatch(/a must be less than b/);
  });
});
