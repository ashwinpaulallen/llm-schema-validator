import { LOG_PREFIX } from './constants.js';

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
 * Thrown when {@link query} exhausts retries without a valid response (unless `fallbackToPartial` applies).
 */
export class QueryRetriesExhaustedError extends Error {
  override readonly name = 'QueryRetriesExhaustedError';

  constructor(
    readonly attempts: number,
    readonly collectedErrors: readonly string[],
    readonly lastRawSnippet: string,
  ) {
    super(`${QUERY_PREFIX} Failed after ${attempts} attempt(s).`);
  }
}
