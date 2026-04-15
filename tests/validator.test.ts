import { describe, expect, it } from 'vitest';

import { validate, validateRootArray } from '../src/validator.js';

describe('validate', () => {
  it('throws TypeError for non-object data', () => {
    const schema = {
      name: { type: 'string' as const, required: true },
    };
    expect(() => validate(null as any, schema)).toThrow(TypeError);
    expect(() => validate([] as any, schema)).toThrow(TypeError);
  });

  it('throws TypeError for invalid schema', () => {
    expect(() => validate({}, null as any)).toThrow(TypeError);
    expect(() => validate({}, [] as any)).toThrow(TypeError);
  });

  it('returns empty array when data matches schema', () => {
    const schema = {
      name: { type: 'string' as const, required: true },
    };
    expect(validate({ name: 'Ada' }, schema)).toEqual([]);
  });

  it('reports missing required fields', () => {
    const schema = {
      id: { type: 'string' as const, required: true },
    };
    const errs = validate({}, schema);
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('id');
    expect(errs[0].message).toMatch(/required/i);
  });

  it('reports null for required field', () => {
    const schema = {
      id: { type: 'string' as const, required: true },
    };
    const errs = validate({ id: null }, schema);
    expect(errs.some((e) => e.field === 'id')).toBe(true);
  });

  it('skips optional missing fields', () => {
    const schema = {
      opt: { type: 'string' as const, required: false },
    };
    expect(validate({}, schema)).toEqual([]);
  });

  it('validates string format email', () => {
    const schema = {
      e: { type: 'string' as const, required: true, format: 'email' as const },
    };
    expect(validate({ e: 'a@b.co' }, schema)).toEqual([]);
    expect(validate({ e: 'user@sub.example.com' }, schema)).toEqual([]);
    expect(validate({ e: 'bad' }, schema).length).toBeGreaterThan(0);
    expect(validate({ e: 'a@b' }, schema).length).toBeGreaterThan(0);
    expect(validate({ e: '@@.' }, schema).length).toBeGreaterThan(0);
    expect(validate({ e: 'a @b.co' }, schema).length).toBeGreaterThan(0);
  });

  it('validates string format url', () => {
    const schema = {
      u: { type: 'string' as const, required: true, format: 'url' as const },
    };
    expect(validate({ u: 'https://x.com' }, schema)).toEqual([]);
    expect(validate({ u: 'http://localhost/path' }, schema)).toEqual([]);
    expect(validate({ u: 'ftp://x' }, schema).length).toBeGreaterThan(0);
    expect(validate({ u: 'http' }, schema).length).toBeGreaterThan(0);
    expect(validate({ u: 'not a url' }, schema).length).toBeGreaterThan(0);
  });

  it('validates string format date', () => {
    const schema = {
      d: { type: 'string' as const, required: true, format: 'date' as const },
    };
    expect(validate({ d: '2024-01-01' }, schema)).toEqual([]);
    expect(validate({ d: '2024-02-29' }, schema)).toEqual([]);
    expect(validate({ d: 'not a date' }, schema).length).toBeGreaterThan(0);
    expect(validate({ d: '2' }, schema).length).toBeGreaterThan(0);
    expect(validate({ d: '2024-02-30' }, schema).length).toBeGreaterThan(0);
    expect(validate({ d: '2023-02-29' }, schema).length).toBeGreaterThan(0);
    expect(validate({ d: '2024-13-01' }, schema).length).toBeGreaterThan(0);
  });

  it('validates nested object properties', () => {
    const schema = {
      user: {
        type: 'object' as const,
        required: true,
        properties: {
          id: { type: 'number' as const, required: true },
        },
      },
    };
    expect(validate({ user: { id: 1 } }, schema)).toEqual([]);
    const errs = validate({ user: { id: 'x' } }, schema);
    expect(errs.some((e) => e.field === 'user.id')).toBe(true);
  });

  it('validates array itemType', () => {
    const schema = {
      tags: { type: 'array' as const, required: true, itemType: 'string' as const },
    };
    expect(validate({ tags: ['a', 'b'] }, schema)).toEqual([]);
    expect(validate({ tags: [1, 2] }, schema).some((e) => e.field.startsWith('tags['))).toBe(true);
  });

  it('validates array of objects with itemProperties', () => {
    const schema = {
      items: {
        type: 'array' as const,
        required: true,
        itemType: 'object' as const,
        itemProperties: {
          id: { type: 'number' as const, required: true },
        },
      },
    };
    expect(validate({ items: [{ id: 1 }] }, schema)).toEqual([]);
    const errs = validate({ items: [{ id: 'nope' }] }, schema);
    expect(errs.some((e) => e.field === 'items[0].id')).toBe(true);
  });

  it('validates const literal string', () => {
    const schema = {
      kind: { type: 'string' as const, required: true, const: 'invoice' as const },
    };
    expect(validate({ kind: 'invoice' }, schema)).toEqual([]);
    const errs = validate({ kind: 'receipt' }, schema);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/exactly/);
  });

  it('validates const number and boolean', () => {
    expect(
      validate({ n: 42 }, { n: { type: 'number' as const, required: true, const: 42 } }),
    ).toEqual([]);
    expect(
      validate({ n: 41 }, { n: { type: 'number' as const, required: true, const: 42 } }).length,
    ).toBeGreaterThan(0);
    expect(
      validate({ ok: true }, { ok: { type: 'boolean' as const, required: true, const: true } }),
    ).toEqual([]);
    expect(
      validate({ ok: false }, { ok: { type: 'boolean' as const, required: true, const: true } }).length,
    ).toBeGreaterThan(0);
  });

  it('validates string enum', () => {
    const schema = {
      status: {
        type: 'string' as const,
        required: true,
        enum: ['active', 'inactive', 'pending'] as const,
      },
    };
    expect(validate({ status: 'active' }, schema)).toEqual([]);
    expect(validate({ status: 'nope' }, schema).length).toBeGreaterThan(0);
  });

  it('validates number min, max, and integer', () => {
    const schema = {
      age: { type: 'number' as const, required: true, minimum: 0, maximum: 120, integer: true },
    };
    expect(validate({ age: 42 }, schema)).toEqual([]);
    expect(validate({ age: 121 }, schema).length).toBeGreaterThan(0);
    expect(validate({ age: -1 }, schema).length).toBeGreaterThan(0);
    expect(validate({ age: 3.5 }, schema).length).toBeGreaterThan(0);
  });

  it('validates string length and pattern', () => {
    const schema = {
      code: {
        type: 'string' as const,
        required: true,
        minLength: 3,
        maxLength: 6,
        pattern: '^[A-Z0-9]+$',
      },
    };
    expect(validate({ code: 'ABC' }, schema)).toEqual([]);
    expect(validate({ code: 'AB' }, schema).length).toBeGreaterThan(0);
    expect(validate({ code: 'ABCDEFG' }, schema).length).toBeGreaterThan(0);
    expect(validate({ code: 'ab' }, schema).length).toBeGreaterThan(0);
  });

  it('validates array minItems and maxItems', () => {
    const schema = {
      tags: { type: 'array' as const, required: true, itemType: 'string' as const, minItems: 1, maxItems: 3 },
    };
    expect(validate({ tags: ['a'] }, schema)).toEqual([]);
    expect(validate({ tags: [] }, schema).length).toBeGreaterThan(0);
    expect(validate({ tags: ['a', 'b', 'c', 'd'] }, schema).length).toBeGreaterThan(0);
  });

  it('allows null when nullable is true', () => {
    const schema = {
      note: { type: 'string' as const, required: true, nullable: true },
      opt: { type: 'string' as const, required: false, nullable: true },
    };
    expect(validate({ note: null, opt: null }, schema)).toEqual([]);
  });

  it('rejects null on optional field when nullable is false', () => {
    const schema = {
      opt: { type: 'string' as const, required: false },
    };
    expect(validate({ opt: null }, schema).length).toBeGreaterThan(0);
  });

  it('reports invalid regex in schema pattern', () => {
    const schema = {
      x: { type: 'string' as const, required: true, pattern: '[' },
    };
    const errs = validate({ x: 'a' }, schema);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.message.includes('invalid pattern'))).toBe(true);
  });

  it('validateRootArray validates elements like nested array fields', () => {
    const field = {
      type: 'array' as const,
      required: true,
      itemType: 'string' as const,
      minItems: 1,
    };
    expect(validateRootArray([], field).length).toBeGreaterThan(0);
    expect(validateRootArray(['a'], field)).toEqual([]);
  });

  it('validates anyOf string | number', () => {
    const schema = {
      id: {
        required: true,
        anyOf: [{ type: 'string' as const }, { type: 'number' as const }],
      },
    };
    expect(validate({ id: 'x' }, schema)).toEqual([]);
    expect(validate({ id: 1 }, schema)).toEqual([]);
    expect(validate({ id: true }, schema).length).toBeGreaterThan(0);
  });

  it('validates anyOf with per-branch constraints', () => {
    const schema = {
      id: {
        required: true,
        anyOf: [
          { type: 'string' as const, minLength: 2 },
          { type: 'number' as const, integer: true },
        ],
      },
    };
    expect(validate({ id: 'ab' }, schema)).toEqual([]);
    expect(validate({ id: 3 }, schema)).toEqual([]);
    expect(validate({ id: 'a' }, schema).length).toBeGreaterThan(0);
    expect(validate({ id: 3.5 }, schema).length).toBeGreaterThan(0);
  });

  it('runs custom validate when built-in checks pass', () => {
    const schema = {
      score: {
        type: 'number' as const,
        required: true,
        validate: (v: unknown) =>
          typeof v === 'number' && v % 5 === 0 ? null : 'Must be a multiple of 5',
      },
    };
    expect(validate({ score: 10 }, schema)).toEqual([]);
    const errs = validate({ score: 7 }, schema);
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('score');
    expect(errs[0].message).toContain('Must be a multiple of 5');
  });

  it('skips custom validate when type or built-in constraints fail', () => {
    const schema = {
      score: {
        type: 'number' as const,
        required: true,
        minimum: 0,
        validate: () => 'custom should not run',
      },
    };
    const errs = validate({ score: -1 }, schema);
    expect(errs.some((e) => e.message.includes('minimum'))).toBe(true);
    expect(errs.some((e) => e.message.includes('custom should not run'))).toBe(false);
  });

  it('reports when custom validate throws', () => {
    const schema = {
      x: {
        type: 'string' as const,
        required: true,
        validate: () => {
          throw new Error('boom');
        },
      },
    };
    const errs = validate({ x: 'ok' }, schema);
    expect(errs.some((e) => e.message.includes('custom validate threw'))).toBe(true);
    expect(errs.some((e) => e.message.includes('boom'))).toBe(true);
  });

  it('validateRootArray runs custom validate on the root array', () => {
    const field = {
      type: 'array' as const,
      required: true,
      itemType: 'number' as const,
      validate: (v: unknown) =>
        Array.isArray(v) && v.length === 2 ? null : 'exactly two items',
    };
    expect(validateRootArray([1, 2], field)).toEqual([]);
    expect(validateRootArray([1], field).some((e) => e.message.includes('exactly two'))).toBe(true);
  });
});
