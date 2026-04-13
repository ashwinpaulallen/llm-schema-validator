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
    });
  });

  it('calls chat.completions.create and returns message content', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('test-key', 'gpt-4o-mini');
    const out = await provider.complete('hi');
    expect(out).toBe('{"ok":true}');
    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('uses default model when omitted', async () => {
    const { createOpenAIProvider } = await import('../../src/providers/openai.js');
    const provider = createOpenAIProvider('k');
    await provider.complete('x');
    expect(createMock.mock.calls[0][0].model).toBe('gpt-4o');
  });
});
