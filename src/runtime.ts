/**
 * Runtime environment detection and compatibility utilities.
 *
 * The core validation, coercion, and parsing functionality works in any modern JavaScript
 * environment that supports ES2020+. The built-in providers (OpenAI, Anthropic) require
 * the `fetch` API and may have additional runtime requirements.
 */

/**
 * Detected runtime environment.
 */
export type RuntimeEnvironment =
  | 'node'
  | 'deno'
  | 'bun'
  | 'cloudflare-workers'
  | 'browser'
  | 'unknown';

/**
 * Detect the current JavaScript runtime environment.
 */
export function detectRuntime(): RuntimeEnvironment {
  if (typeof globalThis !== 'undefined') {
    if (typeof (globalThis as Record<string, unknown>).Deno !== 'undefined') {
      return 'deno';
    }
    if (typeof (globalThis as Record<string, unknown>).Bun !== 'undefined') {
      return 'bun';
    }
    if (typeof (globalThis as Record<string, unknown>).caches !== 'undefined' &&
        typeof (globalThis as Record<string, unknown>).navigator === 'undefined') {
      return 'cloudflare-workers';
    }
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  if (
    typeof (globalThis as Record<string, unknown>).window !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).document !== 'undefined'
  ) {
    return 'browser';
  }

  return 'unknown';
}

/**
 * Runtime compatibility information.
 */
export interface RuntimeCompatibility {
  /** The detected runtime environment. */
  runtime: RuntimeEnvironment;
  /** Whether the core library features are supported. */
  coreSupported: boolean;
  /** Whether structuredClone is available (used for default value cloning). */
  hasStructuredClone: boolean;
  /** Whether the URL API is available (used for URL format validation). */
  hasUrlApi: boolean;
  /** Whether fetch is available (required for built-in providers). */
  hasFetch: boolean;
  /** Whether AbortController is available (used for timeouts/cancellation). */
  hasAbortController: boolean;
  /** Any warnings about the current runtime. */
  warnings: string[];
}

/**
 * Check the current runtime for compatibility with llm-schema-validator features.
 *
 * @example
 * const compat = checkRuntimeCompatibility();
 * if (!compat.coreSupported) {
 *   console.error('Runtime not supported:', compat.warnings);
 * }
 */
export function checkRuntimeCompatibility(): RuntimeCompatibility {
  const runtime = detectRuntime();
  const warnings: string[] = [];

  const hasStructuredClone = typeof structuredClone === 'function';
  if (!hasStructuredClone) {
    warnings.push('structuredClone not available; default values will be cloned via JSON serialization');
  }

  const hasUrlApi = typeof URL === 'function';
  if (!hasUrlApi) {
    warnings.push('URL API not available; URL format validation will not work');
  }

  const hasFetch = typeof fetch === 'function';
  if (!hasFetch) {
    warnings.push('fetch API not available; built-in providers (OpenAI, Anthropic) will not work');
  }

  const hasAbortController = typeof AbortController === 'function';
  if (!hasAbortController) {
    warnings.push('AbortController not available; timeout and cancellation features will not work');
  }

  const coreSupported =
    typeof JSON !== 'undefined' &&
    typeof Map !== 'undefined' &&
    typeof Set !== 'undefined' &&
    typeof Promise !== 'undefined' &&
    typeof RegExp !== 'undefined';

  if (!coreSupported) {
    warnings.push('Core JavaScript APIs missing; library will not function correctly');
  }

  return {
    runtime,
    coreSupported,
    hasStructuredClone,
    hasUrlApi,
    hasFetch,
    hasAbortController,
    warnings,
  };
}

/**
 * Assert that the current runtime supports the core library features.
 * Throws an error if critical features are missing.
 */
export function assertRuntimeCompatible(): void {
  const compat = checkRuntimeCompatibility();
  if (!compat.coreSupported) {
    throw new Error(
      `[llm-schema-validator] Runtime not supported: ${compat.warnings.join('; ')}`,
    );
  }
}
