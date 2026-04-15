import { LOG_PREFIX } from './constants.js';
import type { CompletionUsage } from './types.js';

const JSON_PREFIX = `${LOG_PREFIX} json:`;
const PROVIDER_PREFIX = `${LOG_PREFIX} provider:`;
const QUERY_PREFIX = `${LOG_PREFIX} query:`;

/**
 * Thrown when {@link extractJSON} cannot parse any JSON from the model output.
 */
export class JSONExtractionError extends Error {
  override readonly name = 'JSONExtractionError';

  /** Short preview of the raw text included in the message (for debugging). */
  readonly rawPreview: string;

  constructor(message: string, rawPreview: string, options?: ErrorOptions) {
    super(`${JSON_PREFIX} ${message}`, options);
    this.rawPreview = rawPreview;
  }
}

/**
 * Thrown when an LLM provider’s `complete()` fails (network, SDK, or HTTP error).
 */
export class ProviderError extends Error {
  override readonly name = 'ProviderError';

  constructor(message: string, cause?: unknown) {
    super(`${PROVIDER_PREFIX} ${message}`, cause !== undefined ? { cause } : undefined);
  }
}

/**
 * Thrown when the package’s **`query()`** exhausts retries without a valid response (unless **`fallbackToPartial`** applies).
 *
 * **Do not rely on constructing this class in application code** — it exists so callers can **`catch`** and read
 * **`attempts`**, **`collectedErrors`**, **`lastRawSnippet`**, **`durationMs`**, and **`usage`**. Manual
 * **`new QueryRetriesExhaustedError(...)`** is only for tests or advanced tooling; the constructor is not a
 * stable extension point, and **argument order is easy to get wrong in plain JavaScript** (see parameters).
 */
export class QueryRetriesExhaustedError extends Error {
  override readonly name = 'QueryRetriesExhaustedError';

  /**
   * Prefer catching the error from **`query()`** rather than calling this from app code (see class docs).
   *
   * @param attempts — How many `complete()` calls ran before exhaustion.
   * @param collectedErrors — Human-readable messages per failed attempt.
   * @param lastRawSnippet — Truncated raw model text from the last attempt.
   * @param durationMs — Total wall-clock time for this query (same meaning as `QueryResult.durationMs`).
   * @param usage — Aggregated token usage when the provider reported it.
   */
  constructor(
    readonly attempts: number,
    readonly collectedErrors: readonly string[],
    readonly lastRawSnippet: string,
    readonly durationMs: number,
    readonly usage?: CompletionUsage,
  ) {
    super(`${QUERY_PREFIX} Failed after ${attempts} attempt(s).`);
  }
}
