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

  it('InferFromZod matches z.infer', () => {
    const zod = z.object({ n: z.number() });
    expect(zod.shape.n).toBeDefined();
    type A = InferFromZod<typeof zod>;
    type B = z.infer<typeof zod>;
    expectTypeOf<A>().toEqualTypeOf<B>();
  });
});
