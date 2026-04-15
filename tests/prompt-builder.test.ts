import { describe, expect, it } from 'vitest';

import { buildInitialPrompt, buildRetryPrompt } from '../src/prompt-builder.js';

describe('prompt-builder', () => {
  const schema = {
    title: { type: 'string' as const, required: true, description: 'The title' },
    count: { type: 'number' as const, required: false },
  };

  it('buildInitialPrompt includes user text and JSON-only instructions', () => {
    const p = buildInitialPrompt('Summarize the text.', { kind: 'object', schema });
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
    const p = buildRetryPrompt('Task here.', { kind: 'object', schema }, prev, errors);
    expect(p).toContain('Task here.');
    expect(p).toContain(prev);
    expect(p).toContain('title');
    expect(p).toMatch(/Correct:/);
  });

  it('buildRetryPrompt handles empty errors array with fallback hint', () => {
    const p = buildRetryPrompt('T', { kind: 'object', schema }, '{}', []);
    expect(p).toMatch(/no structured errors/i);
  });

  it('includes examples in the schema shape for the model', () => {
    const schemaWithExamples = {
      status: {
        type: 'string' as const,
        required: true,
        examples: ['active', 'pending', 'closed'],
      },
    };
    const p = buildInitialPrompt('Return status.', { kind: 'object', schema: schemaWithExamples });
    expect(p).toMatch(/e\.g\.\s/);
    expect(p).toContain('active');
    expect(p).toContain('pending');
    expect(p).toContain('closed');
  });

  it('includes const in the schema outline', () => {
    const schema = {
      kind: { type: 'string' as const, required: true, const: 'invoice' as const },
    };
    const p = buildInitialPrompt('Task.', { kind: 'object', schema });
    expect(p).toMatch(/const="invoice"/);
  });

  it('describes anyOf branches in the schema outline', () => {
    const schema = {
      id: {
        required: true,
        anyOf: [{ type: 'string' as const }, { type: 'number' as const }],
      },
    };
    const p = buildInitialPrompt('Task.', { kind: 'object', schema });
    expect(p).toMatch(/anyOf/);
    expect(p).toMatch(/∙\[0\]/);
    expect(p).toMatch(/∙\[1\]/);
  });

  it('mentions custom validate in schema outline when set', () => {
    const schemaWithCustom = {
      n: {
        type: 'number' as const,
        required: true,
        validate: (_v: unknown) => null,
      },
    };
    const p = buildInitialPrompt('Task.', { kind: 'object', schema: schemaWithCustom });
    expect(p).toMatch(/custom validate/);
  });

  it('buildInitialPrompt for array root asks for a JSON array', () => {
    const arraySchema = {
      type: 'array' as const,
      required: true,
      itemType: 'string' as const,
    };
    const p = buildInitialPrompt('List tags.', { kind: 'array', arraySchema });
    expect(p).toMatch(/ONLY one JSON array/i);
    expect(p).toContain('[root array]');
    expect(p).toContain('items:');
  });
});
