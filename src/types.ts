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
  /**
   * String format validation. Supported formats:
   * - `email` - Simple email shape (local@domain.tld)
   * - `url` - Absolute http(s) URL
   * - `date` - ISO 8601 calendar date (YYYY-MM-DD)
   * - `datetime` - ISO 8601 datetime (YYYY-MM-DDTHH:MM:SSZ)
   * - `time` - ISO 8601 time (HH:MM:SS)
   * - `uuid` - UUID v4
   * - `ipv4` - IPv4 address
   * - `ipv6` - IPv6 address
   * - `hostname` - DNS hostname
   * - `phone` - E.164 phone number (+14155551234)
   */
  format?: 'email' | 'url' | 'date' | 'datetime' | 'time' | 'uuid' | 'ipv4' | 'ipv6' | 'hostname' | 'phone';
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
  /**
   * Value must be a multiple of this number. Useful for decimal precision constraints.
   * @example { type: 'number', multipleOf: 0.01 } // Two decimal places
   */
  multipleOf?: number;
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
  /**
   * When `true`, all array elements must be unique (compared by JSON stringification).
   * @example { type: 'array', uniqueItems: true }
   */
  uniqueItems?: boolean;
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

/**
 * Token usage reported by some providers (OpenAI Chat Completions, Anthropic Messages, etc.).
 * Omitted when the provider does not return counts.
 */
export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Rich completion result when the provider exposes {@link CompletionUsage}.
 * Custom providers may still return a plain `string` for backward compatibility.
 */
export interface LLMCompletion {
  text: string;
  usage?: CompletionUsage;
}

/** Return type of {@link LLMProvider.complete}. */
export type LLMProviderCompleteResult = string | LLMCompletion;

/**
 * A chunk emitted during streaming completion.
 */
export interface StreamChunk {
  /** The text delta for this chunk. */
  text: string;
  /** Whether this is the final chunk (stream complete). */
  done: boolean;
  /** Partial usage info (usually only available on final chunk). */
  usage?: CompletionUsage;
}

/**
 * Event types emitted during streaming.
 */
export type StreamEvent =
  | { type: 'chunk'; chunk: StreamChunk }
  | { type: 'error'; error: Error }
  | { type: 'done'; fullText: string; usage?: CompletionUsage };

/**
 * Extended provider interface that supports streaming responses.
 * Implement this for providers that support streaming (OpenAI, Anthropic, etc.).
 */
export interface StreamingLLMProvider extends LLMProvider {
  /**
   * Whether this provider supports streaming.
   */
  readonly supportsStreaming: true;

  /**
   * Stream a completion, yielding chunks as they arrive.
   * The final chunk has `done: true` and may include usage info.
   */
  stream(prompt: string, init?: CompleteOptions): AsyncIterable<StreamChunk>;
}

/**
 * Check if a provider supports streaming.
 */
export function isStreamingProvider(provider: LLMProvider): provider is StreamingLLMProvider {
  return 'supportsStreaming' in provider && provider.supportsStreaming === true;
}

/** Adapter interface that any LLM provider must implement. */
export interface LLMProvider {
  complete(prompt: string, init?: CompleteOptions): Promise<LLMProviderCompleteResult>;
  /**
   * Optional identifier for internal diagnostics (e.g., `'openai'`, `'anthropic'`).
   * Used to emit compatibility warnings when applicable.
   */
  readonly __providerId?: string;
  /**
   * When `true`, indicates the provider is using OpenAI's `json_object` response format,
   * which requires a top-level object (arrays are not supported).
   */
  readonly __usesJsonObjectMode?: boolean;
  /**
   * When `true`, indicates the provider is using OpenAI's native Structured Outputs,
   * which guarantees the response matches the provided JSON Schema.
   */
  readonly __usesStructuredOutputs?: boolean;
  /**
   * When `true` (and `__usesStructuredOutputs` is also true), validation can be skipped
   * since the output is guaranteed to match the schema.
   */
  readonly __skipValidation?: boolean;
}

/**
 * Library diagnostic verbosity for {@link QueryOptionsBase.logLevel}.
 * **`error` ≤ `warn` ≤ `info` ≤ `debug`** — setting **`info`** shows error, warn, and info lines, but not debug (e.g. raw model text).
 */
export type QueryLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/** Optional structured logging for {@link query} diagnostics. */
export interface QueryLogger {
  /**
   * Preferred sink: receives the severity, full message (including `[llm-schema-validator]` prefix), and any extra args.
   */
  log?(level: QueryLogLevel, message: string, ...optionalParams: unknown[]): void;
  /**
   * Legacy single-channel sink; used when {@link QueryLogger.log} is omitted.
   * Receives the same prefixed message as before (no level argument).
   */
  debug?(message: string, ...optionalParams: unknown[]): void;
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

/** Per-attempt metadata passed to {@link QueryOptionsBase.onAttempt}. */
export interface QueryAttemptMeta {
  /** Wall-clock milliseconds for this attempt (after any backoff before this attempt, until `onAttempt` runs). */
  durationMs: number;
}

/**
 * Custom error message templates for i18n/localization.
 * Each function generates a localized error message for a specific validation failure type.
 */
export interface ErrorMessageTemplates {
  /** Field is required but missing or undefined. */
  required?: (field: string) => string;
  /** Value is null but field is not nullable. */
  notNullable?: (field: string) => string;
  /** Value has wrong type. */
  typeMismatch?: (field: string, expected: string, received: string) => string;
  /** String does not match pattern. */
  patternMismatch?: (field: string, pattern: string) => string;
  /** String is too short. */
  minLength?: (field: string, minLength: number, actualLength: number) => string;
  /** String is too long. */
  maxLength?: (field: string, maxLength: number, actualLength: number) => string;
  /** Number is below minimum. */
  minimum?: (field: string, minimum: number, value: number) => string;
  /** Number is above maximum. */
  maximum?: (field: string, maximum: number, value: number) => string;
  /** Number is not a multiple of the specified value. */
  multipleOf?: (field: string, multipleOf: number, value: number) => string;
  /** Number is not an integer. */
  notInteger?: (field: string, value: number) => string;
  /** Value is not in the allowed enum values. */
  enumMismatch?: (field: string, allowed: readonly (string | number)[]) => string;
  /** Value does not match const. */
  constMismatch?: (field: string, expected: unknown) => string;
  /** Array has too few items. */
  minItems?: (field: string, minItems: number, actualItems: number) => string;
  /** Array has too many items. */
  maxItems?: (field: string, maxItems: number, actualItems: number) => string;
  /** Array contains duplicate items. */
  uniqueItems?: (field: string) => string;
  /** String format validation failed. */
  formatMismatch?: (field: string, format: string) => string;
  /** Custom validation failed. */
  customValidation?: (field: string, message: string) => string;
  /** Dependent field is required. */
  dependentRequired?: (field: string, triggerField: string) => string;
}

/**
 * Summary passed to {@link QueryOptionsBase.onComplete} — mirrors {@link QueryResult} fields except **`data`**.
 */
export interface QueryCompletionSummary {
  success: boolean;
  attempts: number;
  /**
   * Total wall-clock time for this `query` in milliseconds (same as {@link QueryResult#durationMs}).
   */
  durationMs: number;
  /** Human-readable failure messages; empty when **`success`** is **`true`**. */
  errors: readonly string[];
  /**
   * Aggregated token usage when reported (same as {@link QueryResult#usage}).
   */
  usage?: CompletionUsage;
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
  /**
   * Minimum diagnostic verbosity. **`silent`** by default unless **`debug: true`**, a **`logger`** is set, or **`logLevel`** is set explicitly.
   * Takes precedence over {@link QueryOptionsBase.debug} when both are set.
   */
  logLevel?: QueryLogLevel;
  /**
   * **DEPRECATED** — Use {@link QueryOptionsBase.logLevel | logLevel} instead.
   *
   * This option will be removed in a future major version.
   * Replace `debug: true` with `logLevel: 'debug'` for equivalent behavior.
   *
   * When **`true`** and **`logLevel`** is omitted, effective level is **`debug`**.
   *
   * @deprecated Since v1.2.0. Use `logLevel: 'debug'` (or `'info'`, `'warn'`, `'error'`) instead.
   * @see {@link QueryOptionsBase.logLevel} for the replacement option.
   */
  debug?: boolean;
  /**
   * When set, diagnostics go here (or to **`console`** with **`info`/`warn`/`debug`** when no logger).
   * If only **`logger.debug`** is provided (no **`logger.log`**), all emitted lines use that single method (level filtering still applies).
   */
  logger?: QueryLogger;
  /**
   * Called after each **`provider.complete()`** finishes: **`attempt`** is 1-based; **`errors`** is empty on success,
   * otherwise human-readable messages for that attempt only (no `Attempt N:` prefix — use **`attempt`** for indexing).
   * **`meta`** is optional in the type so **`(attempt, errors) => …`** handlers stay assignable; the library **always** passes **`meta`** with **`durationMs`** (wall-clock for that attempt after any inter-attempt backoff, until this callback).
   */
  onAttempt?: (attempt: number, errors: string[], meta?: QueryAttemptMeta) => void;
  /**
   * Called once when the `query` finishes: **success**, **validation exhausted**, or **provider failure**
   * (same shape as assembling from {@link QueryResult}, without `data`). Use for metrics without wrapping every call in try/catch.
   */
  onComplete?: (summary: QueryCompletionSummary) => void;
  /**
   * Called after the prompt is fully built but before `provider.complete()` is called.
   * Useful for logging, debugging, or modifying metrics. The prompt cannot be changed here; use `promptTemplate` for that.
   */
  onPromptBuilt?: (prompt: string, attempt: number) => void;
  /**
   * Called immediately before `provider.complete()` is invoked.
   * Useful for fine-grained timing and tracing.
   */
  onProviderStart?: (attempt: number) => void;
  /**
   * Called immediately after `provider.complete()` returns (success or failure).
   * Receives the raw response text (if successful) or undefined (if failed), plus timing info.
   */
  onProviderEnd?: (attempt: number, durationMs: number, rawText: string | undefined) => void;
  /**
   * Called after coercion is applied to the parsed data.
   * Useful for debugging coercion behavior — compare `before` and `after` to see what changed.
   */
  onCoercionApplied?: (before: unknown, after: unknown, attempt: number) => void;
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
  /**
   * Custom error message templates for i18n or branding. Each function receives the field path
   * and optionally additional context, and should return the full error message string.
   *
   * @example
   * errorMessages: {
   *   required: (field) => `El campo "${field}" es obligatorio`,
   *   typeMismatch: (field, expected, received) => `"${field}": esperado ${expected}, recibido ${received}`,
   * }
   */
  errorMessages?: ErrorMessageTemplates;
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
 * Conditional field requirements: if a key is present, the listed fields become required.
 * @example
 * { creditCard: ['billingAddress', 'expiryDate'] }
 * // If 'creditCard' is present, 'billingAddress' and 'expiryDate' are required
 */
export type DependentRequired = Record<string, readonly string[]>;

/**
 * Root JSON is a **plain object** whose keys match `schema` (default).
 * `S` is inferred from `schema` when you pass a {@link defineSchema} literal.
 */
export type QueryObjectOptions<S extends Schema = Schema> = QueryOptionsBase & {
  /** @default 'object' when omitted */
  rootType?: 'object';
  schema: S;
  /**
   * Conditional field requirements: if a key is present, the listed fields become required.
   * @example
   * { dependentRequired: { creditCard: ['billingAddress'] } }
   */
  dependentRequired?: DependentRequired;
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
  /**
   * Total wall-clock time for this `query` in milliseconds (setup, all `complete()` calls, parsing/validation, and inter-attempt backoff).
   */
  durationMs: number;
  /**
   * Aggregated token counts across **all** `complete()` calls for this `query` (including failed attempts),
   * when the provider reported usage. Omitted if no attempt returned usage data.
   */
  usage?: CompletionUsage;
}

/** A single validation failure against the expected schema. */
export interface ValidationError {
  field: string;
  expected: string;
  received: string;
  message: string;
}
