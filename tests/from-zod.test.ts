import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { fromZod, type InferFromZod, ZodAdapterError } from '../src/from-zod.js';
import { validate } from '../src/validator.js';

describe('fromZod', () => {
  it('converts z.object with primitives', () => {
    const zod = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });
    const schema = fromZod(zod);
    expect(validate({ name: 'Ada', age: 42, active: true }, schema)).toEqual([]);
    expect(validate({ name: 'Ada', age: 'x' as unknown as number, active: true }, schema).length).toBeGreaterThan(0);
  });

  it('maps optional and nullable', () => {
    const zod = z.object({
      req: z.string(),
      opt: z.string().optional(),
      nul: z.string().nullable(),
    });
    const schema = fromZod(zod);
    expect(schema.opt?.required).toBe(false);
    expect(schema.nul?.nullable).toBe(true);
  });

  it('maps z.union to anyOf', () => {
    const zod = z.object({
      id: z.union([z.string(), z.number()]),
    });
    const schema = fromZod(zod);
    expect(schema.id).toMatchObject({ anyOf: expect.any(Array) });
    expect((schema.id as { anyOf: unknown[] }).anyOf).toHaveLength(2);
    expect(validate({ id: 'a' }, schema)).toEqual([]);
    expect(validate({ id: 1 }, schema)).toEqual([]);
  });

  it('maps z.discriminatedUnion to anyOf', () => {
    const zod = z.object({
      event: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('a'), x: z.string() }),
        z.object({ kind: z.literal('b'), y: z.number() }),
      ]),
    });
    const schema = fromZod(zod);
    expect(schema.event).toMatchObject({ anyOf: expect.any(Array) });
    expect((schema.event as { anyOf: unknown[] }).anyOf).toHaveLength(2);
    expect(validate({ event: { kind: 'a', x: 'hi' } }, schema)).toEqual([]);
    expect(validate({ event: { kind: 'b', y: 1 } }, schema)).toEqual([]);
  });

  it('maps z.literal to const', () => {
    const zod = z.object({ kind: z.literal('invoice') });
    const schema = fromZod(zod);
    expect(schema.kind).toMatchObject({ type: 'string', const: 'invoice', required: true });
    expect(validate({ kind: 'invoice' }, schema)).toEqual([]);
    expect(validate({ kind: 'other' }, schema).length).toBeGreaterThan(0);
  });

  it('maps z.enum to enum', () => {
    const zod = z.object({ status: z.enum(['a', 'b']) });
    const schema = fromZod(zod);
    expect(schema.status).toMatchObject({ type: 'string', enum: ['a', 'b'] });
  });

  it('throws ZodAdapterError for transform', () => {
    const zod = z.object({ x: z.string().transform((s) => s.length) });
    expect(() => fromZod(zod)).toThrow(ZodAdapterError);
  });

  it('maps z.string().datetime(), .uuid(), .time(), .ip()', () => {
    const zod = z.object({
      dt: z.string().datetime(),
      id: z.string().uuid(),
      t: z.string().time(),
      ip4: z.string().ip({ version: 'v4' }),
      ip6: z.string().ip({ version: 'v6' }),
      ip: z.string().ip(),
    });
    const schema = fromZod(zod);
    expect(schema.dt).toMatchObject({ type: 'string', format: 'datetime' });
    expect(schema.id).toMatchObject({ type: 'string', format: 'uuid' });
    expect(schema.t).toMatchObject({ type: 'string', format: 'time' });
    expect(schema.ip4).toMatchObject({ type: 'string', format: 'ipv4' });
    expect(schema.ip6).toMatchObject({ type: 'string', format: 'ipv6' });
    expect(schema.ip).toMatchObject({ type: 'string' });
    expect(schema.ip).not.toHaveProperty('format');
    expect(
      validate(
        {
          dt: '2024-01-01T12:00:00.000Z',
          id: '550e8400-e29b-41d4-a716-446655440000',
          t: '12:00:00',
          ip4: '192.0.2.1',
          ip6: '2001:db8::1',
          ip: '192.0.2.1',
        },
        schema,
      ),
    ).toEqual([]);
    expect(
      validate(
        {
          dt: '2024-01-01T12:00:00.000Z',
          id: '550e8400-e29b-41d4-a716-446655440000',
          t: '12:00:00',
          ip4: '192.0.2.1',
          ip6: '2001:db8::1',
          ip: 'not-an-ip',
        },
        schema,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('maps z.number().gt() / .lt() to exclusive bounds via validate', () => {
    const zod = z.object({
      a: z.number().gt(5),
      b: z.number().lt(10),
    });
    const schema = fromZod(zod);
    expect(validate({ a: 5, b: 5 }, schema).length).toBeGreaterThan(0);
    expect(validate({ a: 5.0001, b: 9 }, schema)).toEqual([]);
    expect(validate({ a: 6, b: 10 }, schema).length).toBeGreaterThan(0);
    expect(validate({ a: 6, b: 9.999 }, schema)).toEqual([]);
  });

  it('InferFromZod matches z.infer', () => {
    const zod = z.object({ n: z.number() });
    expect(zod.shape.n).toBeDefined();
    type A = InferFromZod<typeof zod>;
    type B = z.infer<typeof zod>;
    expectTypeOf<A>().toEqualTypeOf<B>();
  });
});
