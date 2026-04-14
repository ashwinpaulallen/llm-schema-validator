import type { InferSchema } from './schema-infer.js';
import type { QueryOptions, QueryResult, Schema } from './types.js';
import { executeWithRetry } from './retry.js';

export * from './schema-infer.js';
export * from './types.js';
export * from './errors.js';
export * from './providers/index.js';

/**
 * Run a schema-guided LLM request: prompt → parse → coerce → validate, with retries.
 * The result `data` shape is inferred from `schema` when you use {@link defineSchema} (see {@link InferSchema}).
 */
export function query<S extends Schema>(options: QueryOptions<S>): Promise<QueryResult<InferSchema<S>>> {
  return executeWithRetry<InferSchema<S>>(options);
}

/**
 * Pass-through helper so schema literals stay narrow-typed: use with {@link query} for inferred `QueryResult.data`.
 */
export function defineSchema<S extends Schema>(schema: S): S {
  return schema;
}
