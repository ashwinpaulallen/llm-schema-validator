import { describe, expect, it } from 'vitest';

import { buildInitialPrompt, buildRetryPrompt, formatFewShotBlock } from '../src/prompt-builder.js';

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

  it('buildInitialPrompt includes fewShot input/output pairs before JSON rules', () => {
    const fewShot = [{ input: 'John Smith, 34', output: { name: 'John Smith', age: 34 } }];
    const p = buildInitialPrompt('Parse the next line.', { kind: 'object', schema }, fewShot);
    expect(p).toContain('Parse the next line.');
    expect(p).toMatch(/Examples \(input → JSON output/);
    expect(p).toContain('John Smith, 34');
    expect(p).toContain('"name"');
    expect(p).toContain('34');
    expect(p.indexOf('Examples')).toBeLessThan(p.indexOf('Output: ONLY one JSON object'));
  });

  it('formatFewShotBlock retry caps example count below initial', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      input: `line ${i}`,
      output: { n: i },
    }));
    const initial = formatFewShotBlock(many, 'initial');
    const retry = formatFewShotBlock(many, 'retry');
    expect(initial.match(/Example \d+/g)?.length).toBe(10);
    expect(retry.match(/Example \d+/g)?.length).toBe(6);
  });

  it('buildRetryPrompt puts Previous reply and Correct before abbreviated fewShot', () => {
    const fewShot = [{ input: 'a', output: { x: 1 } }];
    const p = buildRetryPrompt(
      'Task.',
      { kind: 'object', schema },
      '{}',
      [{ field: 'x', expected: 'n', received: 'm', message: 'm' }],
      fewShot,
    );
    expect(p).toMatch(/Few-shot reference \(abbreviated on retry/);
    expect(p.indexOf('Previous reply (invalid)')).toBeLessThan(p.indexOf('Few-shot reference'));
    expect(p.indexOf('Correct:')).toBeLessThan(p.indexOf('Few-shot reference'));
    expect(p.indexOf('Few-shot reference')).toBeLessThan(p.indexOf('Match:'));
  });

  it('buildInitialPrompt with chainOfThought asks for reasoning before JSON', () => {
    const p = buildInitialPrompt('Extract fields.', { kind: 'object', schema }, undefined, true);
    expect(p).toContain('Extract fields.');
    expect(p).toMatch(/Reasoning:/i);
    expect(p).toContain('Work through the task step by step');
    expect(p).not.toMatch(/ONLY one JSON object \(valid JSON\)\. No markdown.*no explanation before or after/s);
  });

  it('buildRetryPrompt with chainOfThought uses reasoning instructions after Correct', () => {
    const p = buildRetryPrompt(
      'Task.',
      { kind: 'object', schema },
      'bad',
      [{ field: 'title', expected: 'string', received: 'x', message: 'm' }],
      undefined,
      true,
    );
    expect(p).toMatch(/Correct:[\s\S]*Reasoning:/);
    expect(p).not.toMatch(/^[\s\S]*Output: ONLY one JSON object\. No markdown or extra text\.\s*$/m);
  });
});
