import { describe, expect, it } from 'vitest';

import { validateExamples } from '../src/validate-examples.js';

describe('validateExamples', () => {
  it('validates string examples (enum, const, length, pattern)', () => {
    expect(
      validateExamples({
        a: {
          type: 'string',
          required: true,
          enum: ['x'],
          examples: ['x'],
        },
      }).valid,
    ).toBe(true);

    expect(
      validateExamples({
        a: { type: 'string', required: true, enum: ['x'], examples: ['y'] },
      }).valid,
    ).toBe(false);
  });

  it('validates number examples (enum, bounds, integer, multipleOf)', () => {
    expect(
      validateExamples({
        n: { type: 'number', required: true, minimum: 0, examples: ['0', ' 2 '] },
      }).valid,
    ).toBe(true);

    expect(
      validateExamples({
        n: { type: 'number', required: true, minimum: 0, examples: ['-1'] },
      }).valid,
    ).toBe(false);

    expect(
      validateExamples({
        n: { type: 'number', required: true, integer: true, examples: ['3.14'] },
      }).valid,
    ).toBe(false);

    expect(
      validateExamples({
        n: { type: 'number', required: true, multipleOf: 0.5, examples: ['1.5'] },
      }).valid,
    ).toBe(true);

    expect(
      validateExamples({
        n: { type: 'number', required: true, multipleOf: 0.5, examples: ['1.3'] },
      }).valid,
    ).toBe(false);

    expect(
      validateExamples({
        n: { type: 'number', required: true, enum: [1, 2], examples: ['2'] },
      }).valid,
    ).toBe(true);

    expect(
      validateExamples({
        n: { type: 'number', required: true, enum: [1, 2], examples: ['3'] },
      }).valid,
    ).toBe(false);
  });

  it('validates boolean examples (const, enum)', () => {
    expect(
      validateExamples({
        b: { type: 'boolean', required: true, const: true, examples: ['true', 'TRUE'] },
      }).valid,
    ).toBe(true);

    expect(
      validateExamples({
        b: { type: 'boolean', required: true, const: true, examples: ['false'] },
      }).valid,
    ).toBe(false);

    expect(
      validateExamples({
        b: { type: 'boolean', required: true, examples: ['maybe'] },
      }).valid,
    ).toBe(false);
  });
});
