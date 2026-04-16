import type { AnyOfBranchSchema, FieldSchema, Schema, SimpleFieldSchema, UnionFieldSchema } from './types.js';

/**
 * Infer a TypeScript shape from a {@link Schema} definition (best-effort; not a full JSON Schema mapping).
 * Use with {@link defineSchema} so `type` fields stay literal.
 */
export type InferSchema<S extends Schema> = {
  [K in keyof S]: InferKeyWithOptionality<S[K]>;
};

/** Required / optional / nullable combinations for root field values. */
export type InferKeyWithOptionality<F extends FieldSchema> = F['required'] extends true
  ? F['nullable'] extends true
    ? InferFieldValue<F> | null
    : InferFieldValue<F>
  : F['nullable'] extends true
    ? InferFieldValue<F> | null | undefined
    : InferFieldValue<F> | undefined;

/** Infer the value type for a single-type {@link SimpleFieldSchema} (excluding null / undefined; see {@link InferKeyWithOptionality}). */
export type InferSimpleFieldValue<F extends SimpleFieldSchema> = F['type'] extends 'string'
  ? undefined extends F['const']
    ? F['enum'] extends readonly (infer E)[]
      ? E extends string
        ? E
        : string
      : string
    : F['const'] extends string
      ? F['const']
      : string
  : F['type'] extends 'number'
    ? undefined extends F['const']
      ? F['enum'] extends readonly (infer E)[]
        ? E extends number
          ? E
          : number
        : number
      : F['const'] extends number
        ? F['const']
        : number
    : F['type'] extends 'boolean'
      ? undefined extends F['const']
        ? boolean
        : F['const'] extends boolean
          ? F['const']
          : boolean
      : F['type'] extends 'object'
        ? F['properties'] extends Schema
          ? InferSchema<F['properties']>
          : Record<string, unknown>
        : F['type'] extends 'array'
          ? InferArrayElement<F>[]
          : unknown;

/**
 * Infer the type for a single anyOf branch.
 * Handles object branches with properties for discriminated unions.
 */
type InferAnyOfBranch<B extends AnyOfBranchSchema> = B['type'] extends 'object'
  ? B['properties'] extends Schema
    ? InferSchema<B['properties']>
    : Record<string, unknown>
  : InferSimpleFieldValue<SimpleFieldSchema & B>;

/**
 * Infer a discriminated union from anyOf branches.
 * Each branch is properly typed, preserving discriminator const values.
 */
type InferAnyOfUnion<A extends readonly AnyOfBranchSchema[]> = A[number] extends infer B
  ? B extends AnyOfBranchSchema
    ? InferAnyOfBranch<B>
    : never
  : never;

/** Infer the value type for a {@link FieldSchema} (excluding null / undefined; see {@link InferKeyWithOptionality}). */
export type InferFieldValue<F extends FieldSchema> = F extends UnionFieldSchema
  ? InferAnyOfUnion<F['anyOf']>
  : InferSimpleFieldValue<Extract<F, SimpleFieldSchema>>;

type InferArrayElement<F extends SimpleFieldSchema> = F['itemType'] extends 'object'
  ? F['itemProperties'] extends Schema
    ? InferSchema<F['itemProperties']>
    : Record<string, unknown>
  : F['itemType'] extends 'string'
    ? string
    : F['itemType'] extends 'number'
      ? number
      : F['itemType'] extends 'boolean'
        ? boolean
        : F['itemType'] extends 'array'
          ? unknown
          : unknown;

/**
 * Extract the discriminator field name from a union schema if it exists.
 * A discriminator is a string field with `const` values that differ across branches.
 */
export type ExtractDiscriminator<U extends UnionFieldSchema> =
  U['anyOf'][number] extends infer B
    ? B extends { type: 'object'; properties: infer P }
      ? P extends Schema
        ? keyof P extends infer K
          ? K extends string
            ? P[K] extends { type: 'string'; const: string }
              ? K
              : never
            : never
          : never
        : never
      : never
    : never;

/**
 * Narrow a union type by discriminator value.
 * Use this to get the specific branch type when you know the discriminator value.
 *
 * @example
 * type MyUnion = InferFieldValue<typeof myUnionField>;
 * type SpecificBranch = NarrowByDiscriminator<MyUnion, 'type', 'invoice'>;
 */
export type NarrowByDiscriminator<
  T,
  K extends string,
  V extends string,
> = T extends { [P in K]: V } ? T : never;
