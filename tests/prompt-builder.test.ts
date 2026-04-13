import { describe, expect, it } from 'vitest';

import { buildInitialPrompt, buildRetryPrompt } from '../src/prompt-builder.js';

describe('prompt-builder', () => {
  const schema = {
    title: { type: 'string' as const, required: true, description: 'The title' },
    count: { type: 'number' as const, required: false },
  };

  it('buildInitialPrompt includes user text and JSON-only instructions', () => {
    const p = buildInitialPrompt('Summarize the text.', schema);
    expect(p).toContain('Summarize the text.');
    expect(p).toMatch(/ONLY one JSON object/i);
    expect(p).toContain('title');
    expect(p).toContain('The title');
  });

  it('buildRetryPrompt includes previous response and validation errors', () => {
    const prev = '{"title": 1}';
    const errors = [
      {
        field: 'title',
        expected: 'string',
        received: 'number',
        message: 'Field "title" must be a string',
      },
    ];
    const p = buildRetryPrompt('Task here.', schema, prev, errors);
    expect(p).toContain('Task here.');
    expect(p).toContain(prev);
    expect(p).toContain('title');
    expect(p).toMatch(/Correct:/);
  });

  it('buildRetryPrompt handles empty errors array with fallback hint', () => {
    const p = buildRetryPrompt('T', schema, '{}', []);
    expect(p).toMatch(/no structured errors/i);
  });
});
