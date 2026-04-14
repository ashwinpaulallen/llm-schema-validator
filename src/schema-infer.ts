import type { FieldSchema, Schema } from './types.js';

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

/** Infer the value type for a single {@link FieldSchema} (excluding null / undefined; see {@link InferKeyWithOptionality}). */
export type InferFieldValue<F extends FieldSchema> = F['type'] extends 'string'
  ? F['enum'] extends readonly (infer E)[]
    ? E extends string
      ? E
      : string
    : string
  : F['type'] extends 'number'
    ? F['enum'] extends readonly (infer E)[]
      ? E extends number
        ? E
        : number
      : number
    : F['type'] extends 'boolean'
      ? boolean
      : F['type'] extends 'object'
        ? F['properties'] extends Schema
          ? InferSchema<F['properties']>
          : Record<string, unknown>
        : F['type'] extends 'array'
          ? InferArrayElement<F>[]
          : unknown;

type InferArrayElement<F extends FieldSchema> = F['itemType'] extends 'object'
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
