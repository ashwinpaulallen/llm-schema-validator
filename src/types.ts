/**
 * Describes a single field. Use `properties` when `type` is `'object'` to express a nested schema.
 */
export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  format?: 'email' | 'url' | 'date';
  default?: unknown;
  description?: string;
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

/** Adapter interface that any LLM provider must implement. */
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

/** Optional structured logging for {@link query} diagnostics (used when set, or when `debug` falls back to `console`). */
export interface QueryLogger {
  debug(message: string, ...optionalParams: unknown[]): void;
}

/** Options for a schema-guided LLM query. */
export interface QueryOptions {
  prompt: string;
  schema: Schema;
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
