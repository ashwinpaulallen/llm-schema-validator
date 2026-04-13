import { describe, expect, it } from 'vitest';

import { coerce } from '../src/coercer.js';

describe('coerce', () => {
  const schema = {
    n: { type: 'number' as const, required: true },
    b: { type: 'boolean' as const, required: true },
    s: { type: 'string' as const, required: true },
    arr: { type: 'array' as const, required: true },
    nested: {
      type: 'object' as const,
      required: true,
      properties: {
        x: { type: 'number' as const, required: true },
      },
    },
  };

  it('throws TypeError for non-object data', () => {
    expect(() => coerce(null as any, schema)).toThrow(TypeError);
    expect(() => coerce([] as any, schema)).toThrow(TypeError);
    expect(() => coerce('string' as any, schema)).toThrow(TypeError);
  });

  it('throws TypeError for invalid schema', () => {
    expect(() => coerce({}, null as any)).toThrow(TypeError);
    expect(() => coerce({}, [] as any)).toThrow(TypeError);
  });

  it('coerces numeric strings to numbers', () => {
    const data = { n: '42', b: true, s: 'hi', arr: [], nested: { x: 1 } };
    const out = coerce(data, schema);
    expect(out.n).toBe(42);
  });

  it('coerces boolean strings', () => {
    const data = { n: 1, b: 'false', s: 'x', arr: [], nested: { x: 0 } };
    expect(coerce(data, schema).b).toBe(false);
  });

  it('coerces numbers to strings when field is string', () => {
    const data = { n: 0, b: false, s: 99, arr: [], nested: { x: 2 } };
    expect(coerce(data, schema).s).toBe('99');
  });

  it('parses array from JSON string', () => {
    const data = { n: 1, b: true, s: 'a', arr: '[1,2,3]', nested: { x: 0 } };
    expect(coerce(data, schema).arr).toEqual([1, 2, 3]);
  });

  it('applies default when value is null or missing', () => {
    const sch = {
      a: { type: 'string' as const, required: false, default: 'fallback' },
    };
    expect(coerce({}, sch).a).toBe('fallback');
    expect(coerce({ a: null }, sch).a).toBe('fallback');
  });

  it('recurses into nested objects', () => {
    const data = { n: 0, b: true, s: '', arr: [], nested: { x: '3' } };
    expect(coerce(data, schema).nested).toEqual({ x: 3 });
  });

  it('does not mutate the input object', () => {
    const data = { n: '1', b: 'true', s: 'x', arr: [], nested: { x: 1 } };
    const copy = structuredClone(data);
    coerce(data, schema);
    expect(data).toEqual(copy);
  });
});
