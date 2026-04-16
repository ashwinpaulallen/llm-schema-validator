import type { InferFieldValue, InferSchema } from './schema-infer.js';
import type {
  ArrayRootFieldSchema,
  QueryArrayOptions,
  QueryObjectOptions,
  QueryOptions,
  QueryResult,
  Schema,
} from './types.js';
import { executeWithRetry } from './retry.js';

export * from './schema-infer.js';
export * from './types.js';
export * from './errors.js';
export * from './providers/index.js';

export { coerce, coerceRootArray } from './coercer.js';
export { defaultErrorMessages, createErrorMessageGenerator, type ErrorMessageGenerator } from './error-messages.js';
export { fromJsonSchema, JsonSchemaAdapterError } from './from-json-schema.js';
export { fromZod, type InferFromZod, ZodAdapterError } from './from-zod.js';
export { diffSchemas, generateMigrationGuide, type SchemaDiff, type FieldChange } from './schema-diff.js';
export { toJsonSchema } from './to-json-schema.js';
export {
  checkRuntimeCompatibility,
  detectRuntime,
  assertRuntimeCompatible,
  type RuntimeEnvironment,
  type RuntimeCompatibility,
} from './runtime.js';
export { validate, validateRootArray } from './validator.js';
export { validateExamples, type ExampleValidationResult, type ExampleValidationError } from './validate-examples.js';

/**
 * Run a schema-guided LLM request: prompt → parse → coerce → validate, with retries.
 * **`QueryResult.usage`** sums token counts from the provider when available (see **`CompletionUsage`**).
 * **`QueryResult.durationMs`** is total wall-clock time for the call (attempts, parsing, and inter-attempt backoff); **`onAttempt`** always receives **`meta.durationMs`** per attempt (**`meta`** is optional in the callback type for two-parameter handlers).
 * **`onComplete`** runs once at the end with **`QueryCompletionSummary`** (success or failure, including **`QueryRetriesExhaustedError`** and **`ProviderError`**) for metrics without wrapping every call in try/catch.
 * For an object root, `data` is inferred from `schema` when you use {@link defineSchema} (see {@link InferSchema}).
 * For {@link QueryArrayOptions}, `data` is inferred from `arraySchema` (see {@link InferFieldValue}).
 * Use **`validate`** on options for cross-field rules after per-field validation (object or array root).
 * Use **`fewShot`** for input → output example pairs injected into the user message (`FewShotExample` in `types`).
 * Set **`chainOfThought: true`** to ask for reasoning in plain text before the final JSON (more tokens, often better on hard extractions).
 * Use **`promptTemplate`** to post-process the fully built user message before each `complete()` — receives **`PromptTemplateContext`** (`builtPrompt`, `taskPrompt`, `attempt`, `maxAttempts`, `rootKind`, `isRetry`).
 * Set **`logLevel`** (or deprecated **`debug`**) for diagnostic verbosity; use **`logger.log(level, …)`** for a level-aware sink.
 */
export function query<S extends Schema>(options: QueryObjectOptions<S>): Promise<QueryResult<InferSchema<S>>>;

export function query<F extends ArrayRootFieldSchema>(
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
