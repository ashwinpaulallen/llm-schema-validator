import { describe, expect, it, vi } from 'vitest';

import { delayWithAbort } from '../src/abort.js';

describe('delayWithAbort', () => {
  it('resolves immediately when ms is 0', async () => {
    await expect(delayWithAbort(0)).resolves.toBeUndefined();
  });

  it('rejects when signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(delayWithAbort(100, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects when signal aborts during wait', async () => {
    vi.useFakeTimers();
    try {
      const ac = new AbortController();
      const p = delayWithAbort(60_000, ac.signal);
      ac.abort();
      await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      vi.useRealTimers();
    }
  });
});
