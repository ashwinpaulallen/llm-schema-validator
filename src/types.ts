/**
 * Describes a single field. Use `properties` when `type` is `'object'` to express a nested schema.
 */
export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  format?: 'email' | 'url' | 'date';
  default?: unknown;
  description?: string;
  /**
   * When `true`, an explicit JSON `null` is valid (no further type checks on that value).
   * When `false` or omitted, `null` is invalid for typed fields.
   */
  nullable?: boolean;
  /**
   * Allowed values for `string` or `number` fields (exact match after coercion).
   * @example { enum: ['active', 'inactive', 'pending'] }
   */
  enum?: readonly (string | number)[];
  /** Inclusive lower bound for `number` (finite). */
  minimum?: number;
  /** Inclusive upper bound for `number` (finite). */
  maximum?: number;
  /** When `true`, value must be an integer (no fractional part). */
  integer?: boolean;
  /** Minimum string length (Unicode code units). */
  minLength?: number;
  /** Maximum string length (Unicode code units). */
  maxLength?: number;
  /**
   * ECMAScript regular expression pattern (no delimiters), e.g. `^\\d{5}$` for US ZIP.
   * Invalid patterns fail validation for that field at runtime.
   */
  pattern?: string;
  /** Minimum array length (after parsing as array). */
  minItems?: number;
  /** Maximum array length. */
  maxItems?: number;
  /** Child field definitions for nested objects (`type: 'object'`). */
  properties?: Schema;
  /** When `type` is `'array'`, optional uniform type for each element. */
  itemType?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** When `itemType` is `'object'`, optional schema for each array element. */
  itemProperties?: Schema;
}

/**
 * A flat map of field names to {@link FieldSchema}, with nesting expressed via
 * {@link FieldSchema.properties} on object-typed fields.
 */
export type Schema = Record<string, FieldSchema>;

/** Optional arguments for {@link LLMProvider.complete} (forwarded to HTTP clients when supported). */
export interface CompleteOptions {
  /** When aborted, the in-flight request should be cancelled where the SDK supports it. */
  signal?: AbortSignal;
}

/** Adapter interface that any LLM provider must implement. */
export interface LLMProvider {
  complete(prompt: string, init?: CompleteOptions): Promise<string>;
}

/** Optional structured logging for {@link query} diagnostics (used when set, or when `debug` falls back to `console`). */
export interface QueryLogger {
  debug(message: string, ...optionalParams: unknown[]): void;
}

/** Options for a schema-guided LLM query. `S` is inferred from `schema` when you pass a {@link defineSchema} literal. */
export interface QueryOptions<S extends Schema = Schema> {
  prompt: string;
  schema: S;
  provider: LLMProvider;
  /** @default 3 */
  maxRetries?: number;
  /** @default true */
  coerce?: boolean;
  /** @default false */
  fallbackToPartial?: boolean;
  /** Log each attempt and validation outcome to `console` when `logger` is not set. */
  debug?: boolean;
  /** When set, diagnostic messages go here instead of `console` (you may omit `debug` if you always provide a logger). */
  logger?: QueryLogger;
  /**
   * Abort the current attempt (and any in-flight provider request that respects `signal`).
   * Applies to each `provider.complete()` call; a new attempt uses the same outer signal state.
   */
  signal?: AbortSignal;
  /**
   * Maximum time in milliseconds for **each** `provider.complete()` call. Uses `AbortSignal` under the hood
   * and races the promise so `query` returns even if the provider ignores cancellation.
   * @default undefined (no timeout)
   */
  providerTimeoutMs?: number;
}

/** Result of validating and parsing an LLM response against a schema. */
export interface QueryResult<T> {
  data: T;
  success: boolean;
  attempts: number;
  errors: string[];
}

/** A single validation failure against the expected schema. */
export interface ValidationError {
  field: string;
  expected: string;
  received: string;
  message: string;
}
