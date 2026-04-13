import { describe, expect, it } from 'vitest';

import { validate } from '../src/validator.js';

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
    expect(validate({ e: 'bad' }, schema).length).toBeGreaterThan(0);
  });

  it('validates string format url', () => {
    const schema = {
      u: { type: 'string' as const, required: true, format: 'url' as const },
    };
    expect(validate({ u: 'https://x.com' }, schema)).toEqual([]);
    expect(validate({ u: 'ftp://x' }, schema).length).toBeGreaterThan(0);
  });

  it('validates string format date', () => {
    const schema = {
      d: { type: 'string' as const, required: true, format: 'date' as const },
    };
    expect(validate({ d: '2024-01-01' }, schema)).toEqual([]);
    expect(validate({ d: 'not a date' }, schema).length).toBeGreaterThan(0);
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
});
