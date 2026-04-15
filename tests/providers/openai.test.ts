import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };

    constructor(_opts: unknown) {}
  },
}));

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
    });
  });

  it('calls chat.completions.create and returns message content', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('test-key', 'gpt-4o-mini');
    const out = await provider.complete('hi');
    expect(out).toEqual({
      text: '{"ok":true}',
      usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 },
    });
    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });
  });

  it('uses default model when omitted', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k');
    await provider.complete('x');
    expect(createMock.mock.calls[0][0].model).toBe('gpt-4o');
  });

  it('sends systemPrompt as a system message before the user message', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('test-key');
    await provider.complete('user text', { systemPrompt: 'Be concise.' });
    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'user text' },
      ],
      response_format: { type: 'json_object' },
    });
  });

  it('merges OpenAIProviderOptions as the third argument', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k', 'gpt-4o', {
      temperature: 0.2,
      seed: 42,
      response_format: { type: 'json_object' },
    });
    await provider.complete('{}');
    expect(createMock.mock.calls[0][0]).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.2,
      seed: 42,
      response_format: { type: 'json_object' },
    });
  });

  it('accepts options-only object as the second argument', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k', { top_p: 0.95, temperature: 0 });
    await provider.complete('hi');
    expect(createMock.mock.calls[0][0]).toMatchObject({
      model: 'gpt-4o',
      top_p: 0.95,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
  });

  it('allows response_format text to opt out of default JSON mode', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k', { response_format: { type: 'text' } });
    await provider.complete('hi');
    expect(createMock.mock.calls[0][0]).toMatchObject({
      response_format: { type: 'text' },
    });
  });

  it('returns text only when the API omits usage', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{}' } }],
    });
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k');
    const out = await provider.complete('x');
    expect(out).toEqual({ text: '{}' });
  });
});
