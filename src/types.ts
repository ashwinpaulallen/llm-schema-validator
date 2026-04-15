/**
 * Shared metadata on every field (single `type` or {@link UnionFieldSchema#anyOf}).
 */
export interface FieldSchemaBase {
  required: boolean;
  description?: string;
  /**
   * Example values included in the schema outline sent to the model (illustrative vocabulary).
   * Not enforced by validation — use {@link SimpleFieldSchema.enum} or {@link SimpleFieldSchema.const} for strict values.
   */
  examples?: readonly string[];
  /**
   * When `true`, an explicit JSON `null` is valid (no further type checks on that value).
   * When `false` or omitted, `null` is invalid for typed fields.
   */
  nullable?: boolean;
  default?: unknown;
  /**
   * Optional check after a matching `anyOf` branch succeeds (or after single-type validation).
   * Return `null` if the value is valid, or a short error message string otherwise.
   */
  validate?: (value: unknown) => string | null;
}

/**
 * A single-type field. Use `properties` when `type` is `'object'` to express a nested schema.
 */
export interface SimpleFieldSchema extends FieldSchemaBase {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  format?: 'email' | 'url' | 'date';
  /**
   * Exact value (after coercion), like JSON Schema `const` — useful for discriminators, e.g.
   * `{ type: 'string', const: 'invoice' }`.
   */
  const?: string | number | boolean | null;
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
 * Field that matches one of several alternative shapes (JSON Schema `anyOf`-style).
 * Branches are tried **in order** during coercion; validation succeeds if **any** branch fully matches.
 */
export interface UnionFieldSchema extends FieldSchemaBase {
  anyOf: readonly AnyOfBranchSchema[];
}

/**
 * One alternative inside {@link UnionFieldSchema#anyOf}. Inherits `required` / `nullable` / `default` / parent `validate` from the enclosing field only (do not set `required` here).
 */
export type AnyOfBranchSchema = Omit<SimpleFieldSchema, keyof FieldSchemaBase> & {
  type: SimpleFieldSchema['type'];
};

/** A schema field: either a single `type` or an `anyOf` union of branches. */
export type FieldSchema = SimpleFieldSchema | UnionFieldSchema;

/** Root array queries use a single `type: 'array'` field (not `anyOf`). */
export type ArrayRootFieldSchema = SimpleFieldSchema & { type: 'array' };

/**
 * A flat map of field names to {@link FieldSchema}, with nesting expressed via
 * {@link FieldSchema.properties} on object-typed fields.
 */
export type Schema = Record<string, FieldSchema>;

/** Optional arguments for {@link LLMProvider.complete} (forwarded to HTTP clients when supported). */
export interface CompleteOptions {
  /** When aborted, the in-flight request should be cancelled where the SDK supports it. */
  signal?: AbortSignal;
  /**
   * System / developer instructions, separate from the user message (`prompt` passed to `complete`).
   * Built-in OpenAI and Anthropic adapters map this to the system role / `system` parameter.
   */
  systemPrompt?: string;
}

/** Adapter interface that any LLM provider must implement. */
export interface LLMProvider {
  complete(prompt: string, init?: CompleteOptions): Promise<string>;
}

/** Optional structured logging for {@link query} diagnostics (used when set, or when `debug` falls back to `console`). */
export interface QueryLogger {
  debug(message: string, ...optionalParams: unknown[]): void;
}

/**
 * One few-shot pair: free-text {@link FewShotExample#input} and the expected root JSON
 * {@link FewShotExample#output} (object or array, matching the query’s root shape).
 */
export interface FewShotExample {
  /** Example user/task input the model should treat as analogous to the real prompt. */
  input: string;
  /**
   * Expected JSON at the **root** — a plain object for default object-root queries, or a JSON array
   * when using {@link QueryArrayOptions}.
   */
  output: unknown;
}

/** Shared options for {@link query} (both object-root and array-root). */
export interface QueryOptionsBase {
  prompt: string;
  provider: LLMProvider;
  /**
   * Optional system-level instructions (persona, rules). Sent separately from the built user message
   * (task + JSON/schema instructions) to providers that support it.
   */
  systemPrompt?: string;
  /** @default 3 */
  maxRetries?: number;
  /**
   * Base delay in milliseconds before each **retry** after a failed attempt (parse/validation failure).
   * Omitted or non-positive: no delay (immediate retries). When set, delays scale by {@link QueryOptionsBase.retryBackoffMultiplier}
   * (default exponential doubling) to reduce rate-limit pressure.
   */
  retryDelayMs?: number;
  /**
   * Multiplier applied per retry after the first when {@link QueryOptionsBase.retryDelayMs} is set.
   * Delay before attempt `n` (for `n` ≥ 2) is `retryDelayMs * multiplier^(n-2)`.
   * @default 2 (exponential backoff). Use `1` for a fixed delay between every retry.
   */
  retryBackoffMultiplier?: number;
  /** @default true */
  coerce?: boolean;
  /** @default false */
  fallbackToPartial?: boolean;
  /** Log each attempt and validation outcome to `console` when `logger` is not set. */
  debug?: boolean;
  /** When set, diagnostic messages go here instead of `console` (you may omit `debug` if you always provide a logger). */
  logger?: QueryLogger;
  /**
   * Called after each **`provider.complete()`** finishes: **`attempt`** is 1-based; **`errors`** is empty on success,
   * otherwise human-readable messages for that attempt only (no `Attempt N:` prefix — use **`attempt`** for indexing).
   */
  onAttempt?: (attempt: number, errors: string[]) => void;
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
  /**
   * Optional full **input → output** examples injected into the user message (after `prompt`, before JSON rules).
   * Improves adherence on complex schemas; each `output` must match the root shape (object vs array).
   * On **retries**, a shorter few-shot block is placed **after** “Previous reply” / “Correct:” so validation context stays prominent.
   */
  fewShot?: readonly FewShotExample[];
  /**
   * When `true`, the prompt asks the model to **reason in plain text first**, then output the final JSON.
   * Improves accuracy on hard extractions; uses more tokens.
   * **`extractJSON`** prefers the **last** top-level JSON value when several appear (see parser docs).
   * @default false
   */
  chainOfThought?: boolean;
  /**
   * Optional transform applied to the **fully built** user message (task + few-shot + JSON/schema instructions)
   * immediately before each `provider.complete()` call. Use for house-style wrappers or prefixes/suffixes.
   * Receives {@link PromptTemplateContext} so you can vary the wrapper by attempt, retry vs first try, etc.
   */
  promptTemplate?: (context: PromptTemplateContext) => string;
}

/**
 * Metadata passed to {@link QueryOptionsBase.promptTemplate} for each `complete()` call.
 */
export interface PromptTemplateContext {
  /** Full user message from the library (task + few-shot + CoT + schema outline, or retry text). */
  builtPrompt: string;
  /** Same as {@link QueryOptionsBase.prompt} — your task string only (not the library additions). */
  taskPrompt: string;
  /** 1-based index of this `complete()` call (matches {@link QueryOptionsBase.onAttempt}). */
  attempt: number;
  /** Maximum total attempts for this query (same as `maxRetries`). */
  maxAttempts: number;
  /** Expected root JSON shape for this query. */
  rootKind: 'object' | 'array';
  /** `true` when this is not the first attempt (`attempt > 1`). */
  isRetry: boolean;
}

/**
 * Root JSON is a **plain object** whose keys match `schema` (default).
 * `S` is inferred from `schema` when you pass a {@link defineSchema} literal.
 */
export type QueryObjectOptions<S extends Schema = Schema> = QueryOptionsBase & {
  /** @default 'object' when omitted */
  rootType?: 'object';
  schema: S;
  /**
   * After per-field validation passes on the coerced object, run cross-field or dependent rules
   * (e.g. `endDate > startDate`, or required `subtype` when `type === 'x'`).
   * Return `null` if valid, or a short error message (shown in retries).
   */
  validate?: (data: Record<string, unknown>) => string | null;
};

/**
 * Root JSON is a **JSON array** (e.g. a list of items). Use `arraySchema` with `type: 'array'`.
 */
export type QueryArrayOptions<F extends ArrayRootFieldSchema = ArrayRootFieldSchema> = QueryOptionsBase & {
  rootType: 'array';
  arraySchema: F;
  /**
   * After per-item validation passes on the coerced root array, run whole-array rules.
   * Return `null` if valid, or a short error message (shown in retries).
   */
  validate?: (data: unknown[]) => string | null;
};

/** Options for a schema-guided LLM query: either an object root or an array root. */
export type QueryOptions<S extends Schema = Schema> =
  | QueryObjectOptions<S>
  | QueryArrayOptions<ArrayRootFieldSchema>;

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
