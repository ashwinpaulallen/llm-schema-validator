import { beforeEach, describe, expect, it, vi } from 'vitest';

const { messagesCreate } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: messagesCreate,
    };

    constructor(_opts: unknown) {}
  },
}));

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"a":1}' }],
    });
  });

  it('calls messages.create and returns joined text blocks', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('key', 'claude-test');
    const out = await provider.complete('prompt');
    expect(out).toBe('{"a":1}');
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-test',
        max_tokens: 8192,
        messages: [{ role: 'user', content: 'prompt' }],
      }),
    );
  });

  it('uses default model when omitted', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('k');
    await provider.complete('z');
    expect(messagesCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
    expect(messagesCreate.mock.calls[0][0].max_tokens).toBe(8192);
  });

  it('accepts maxTokens in options object', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('k', { maxTokens: 1024 });
    await provider.complete('z');
    expect(messagesCreate.mock.calls[0][0].max_tokens).toBe(1024);
  });

  it('accepts model and maxTokens together', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('k', {
      model: 'claude-opus-test',
      maxTokens: 32000,
    });
    await provider.complete('z');
    const arg = messagesCreate.mock.calls[0][0];
    expect(arg.model).toBe('claude-opus-test');
    expect(arg.max_tokens).toBe(32000);
  });

  it('passes systemPrompt as the system parameter', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('k');
    await provider.complete('hello', { systemPrompt: 'You are a helpful assistant.' });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );
  });

  it('passthrough sampling options on the factory options object', async () => {
    const { createAnthropicProvider } = await import('../../src/providers/anthropic.js');
    const provider = createAnthropicProvider('k', {
      model: 'claude-custom',
      temperature: 0.4,
      top_p: 0.9,
      top_k: 5,
    });
    await provider.complete('z');
    expect(messagesCreate.mock.calls[0][0]).toMatchObject({
      model: 'claude-custom',
      max_tokens: 8192,
      temperature: 0.4,
      top_p: 0.9,
      top_k: 5,
    });
  });
});
