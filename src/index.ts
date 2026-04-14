import type { InferFieldValue, InferSchema } from './schema-infer.js';
import type { FieldSchema, QueryArrayOptions, QueryObjectOptions, QueryOptions, QueryResult, Schema } from './types.js';
import { executeWithRetry } from './retry.js';

export * from './schema-infer.js';
export * from './types.js';
export * from './errors.js';
export * from './providers/index.js';

export { coerce, coerceRootArray } from './coercer.js';
export { validate, validateRootArray } from './validator.js';

/**
 * Run a schema-guided LLM request: prompt → parse → coerce → validate, with retries.
 * For an object root, `data` is inferred from `schema` when you use {@link defineSchema} (see {@link InferSchema}).
 * For {@link QueryArrayOptions}, `data` is inferred from `arraySchema` (see {@link InferFieldValue}).
 */
export function query<S extends Schema>(options: QueryObjectOptions<S>): Promise<QueryResult<InferSchema<S>>>;

export function query<F extends FieldSchema & { type: 'array' }>(
  options: QueryArrayOptions<F>,
): Promise<QueryResult<InferFieldValue<F>>>;

export function query(options: QueryOptions): Promise<QueryResult<unknown>> {
  return executeWithRetry(options);
}

/**
 * Pass-through helper so schema literals stay narrow-typed: use with {@link query} for inferred `QueryResult.data`.
 */
export function defineSchema<S extends Schema>(schema: S): S {
  return schema;
}
