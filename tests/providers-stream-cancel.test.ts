import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeminiProvider } from '../src/providers/gemini.js';
import { createOllamaProvider } from '../src/providers/ollama.js';
import type { StreamingLLMProvider } from '../src/types.js';

describe('streaming providers cancel reader on early exit', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Gemini: calls reader.cancel() when consumer stops iterating', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const geminiChunk = {
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    };
    const sseLine = `data: ${JSON.stringify(geminiChunk)}\n`;
    const encoder = new TextEncoder();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({ done: false, value: encoder.encode(sseLine) })
            .mockResolvedValue({ done: true, value: undefined }),
          cancel,
        }),
      },
    });

    const provider = createGeminiProvider('test-key', { stream: true }) as StreamingLLMProvider;
    for await (const chunk of provider.stream('prompt')) {
      if (chunk.text === 'x') break;
    }

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('Ollama: calls reader.cancel() when consumer stops iterating', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const line = `${JSON.stringify({ message: { content: 'y' }, done: false })}\n`;
    const encoder = new TextEncoder();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({ done: false, value: encoder.encode(line) })
            .mockResolvedValue({ done: true, value: undefined }),
          cancel,
        }),
      },
    });

    const provider = createOllamaProvider({ stream: true }) as StreamingLLMProvider;
    for await (const chunk of provider.stream('prompt')) {
      if (chunk.text === 'y') break;
    }

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
