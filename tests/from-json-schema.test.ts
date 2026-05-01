import { describe, expect, it } from 'vitest';

import { fromJsonSchema, JsonSchemaAdapterError } from '../src/from-json-schema.js';
import { validate } from '../src/validator.js';

describe('fromJsonSchema', () => {
  it('converts a minimal draft-07 object schema', () => {
    const schema = fromJsonSchema({
      type: 'object',
      required: ['name', 'age'],
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        opt: { type: 'string' },
      },
    });
    expect(schema.name?.required).toBe(true);
    expect(schema.age?.required).toBe(true);
    expect(schema.opt?.required).toBe(false);
    expect(validate({ name: 'Ada', age: 42 }, schema)).toEqual([]);
  });

  it('maps anyOf and oneOf', () => {
    const a = fromJsonSchema({
      type: 'object',
      properties: {
        id: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
    });
    expect(a.id).toMatchObject({ anyOf: expect.any(Array) });
    expect(validate({ id: 'x' }, a)).toEqual([]);
    expect(validate({ id: 1 }, a)).toEqual([]);
  });

  it('resolves #/definitions ref', () => {
    const schema = fromJsonSchema({
      type: 'object',
      definitions: {
        Name: { type: 'string', minLength: 1 },
      },
      properties: {
        title: { $ref: '#/definitions/Name' },
      },
    });
    expect(validate({ title: 'a' }, schema)).toEqual([]);
    expect(validate({ title: '' }, schema).length).toBeGreaterThan(0);
  });

  it('resolves #/$defs ref', () => {
    const schema = fromJsonSchema({
      type: 'object',
      $defs: {
        Positive: { type: 'number', minimum: 0 },
      },
      properties: {
        n: { $ref: '#/$defs/Positive' },
      },
    });
    expect(validate({ n: 1 }, schema)).toEqual([]);
    expect(validate({ n: -1 }, schema).length).toBeGreaterThan(0);
  });

  it('maps multipleOf on numbers', () => {
    const schema = fromJsonSchema({
      type: 'object',
      properties: {
        qty: { type: 'number', multipleOf: 0.5 },
      },
    });
    expect(schema.qty).toMatchObject({ type: 'number', multipleOf: 0.5 });
    expect(validate({ qty: 1.5 }, schema)).toEqual([]);
    expect(validate({ qty: 1.3 }, schema).length).toBeGreaterThan(0);
  });

  it('follows multi-hop $ref chain', () => {
    const schema = fromJsonSchema({
      type: 'object',
      definitions: {
        Inner: { type: 'string', minLength: 1 },
        Outer: { $ref: '#/definitions/Inner' },
      },
      properties: {
        title: { $ref: '#/definitions/Outer' },
      },
    });
    expect(validate({ title: 'a' }, schema)).toEqual([]);
    expect(validate({ title: '' }, schema).length).toBeGreaterThan(0);
  });

  it('throws on circular $ref', () => {
    expect(() =>
      fromJsonSchema({
        type: 'object',
        definitions: {
          A: { $ref: '#/definitions/B' },
          B: { $ref: '#/definitions/A' },
        },
        properties: {
          x: { $ref: '#/definitions/A' },
        },
      }),
    ).toThrow(/circular \$ref/);
  });

  it('throws on allOf', () => {
    expect(() =>
      fromJsonSchema({
        type: 'object',
        properties: {
          x: { allOf: [{ type: 'string' }, { minLength: 1 }] },
        },
      }),
    ).toThrow(JsonSchemaAdapterError);
  });
});
