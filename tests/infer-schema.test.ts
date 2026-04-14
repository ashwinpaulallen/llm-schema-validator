import { describe, expect, expectTypeOf, it } from 'vitest';

import { defineSchema, type InferSchema } from '../src/index.js';

describe('InferSchema', () => {
  it('infers primitives and required flags from defineSchema', () => {
    const schema = defineSchema({
      name: { type: 'string', required: true },
      age: { type: 'number', required: true },
      nick: { type: 'string', required: false },
    });
    expect(schema.name).toBeDefined();
    type Out = InferSchema<typeof schema>;
    expectTypeOf<Out>().toEqualTypeOf<{
      name: string;
      age: number;
      nick: string | undefined;
    }>();
  });

  it('infers nested objects and arrays', () => {
    const schema = defineSchema({
      user: {
        type: 'object',
        required: true,
        properties: {
          id: { type: 'string', required: true },
        },
      },
      tags: { type: 'array', required: true, itemType: 'string' },
      items: {
        type: 'array',
        required: true,
        itemType: 'object',
        itemProperties: {
          n: { type: 'number', required: true },
        },
      },
    });
    expect(schema.user).toBeDefined();
    type Out = InferSchema<typeof schema>;
    expectTypeOf<Out['user']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<Out['tags']>().toEqualTypeOf<string[]>();
    expectTypeOf<Out['items']>().toEqualTypeOf<Array<{ n: number }>>();
  });

  it('infers string enum literals', () => {
    const schema = defineSchema({
      status: {
        type: 'string',
        required: true,
        enum: ['active', 'inactive', 'pending'] as const,
      },
    });
    expect(schema.status).toBeDefined();
    type Out = InferSchema<typeof schema>;
    expectTypeOf<Out['status']>().toEqualTypeOf<'active' | 'inactive' | 'pending'>();
  });
});
