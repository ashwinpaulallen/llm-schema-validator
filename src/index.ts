import type { QueryOptions, QueryResult, Schema } from './types.js';
import { executeWithRetry } from './retry.js';

export * from './types.js';
export * from './errors.js';
export * from './providers/index.js';

/**
 * Run a schema-guided LLM request: prompt → parse → coerce → validate, with retries.
 */
export function query<T = Record<string, unknown>>(
  options: QueryOptions,
): Promise<QueryResult<T>> {
  return executeWithRetry<T>(options);
}

/**
 * Pass-through helper so schema literals get editor autocomplete and stay typed as {@link Schema}.
 */
export function defineSchema<S extends Schema>(schema: S): S {
  return schema;
}
