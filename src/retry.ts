import {
  LOG_PREFIX,
  MAX_FINAL_ERROR_RAW_LENGTH,
  MAX_PARSE_ERROR_RAW_LENGTH,
} from './constants.js';
import { QueryRetriesExhaustedError, ProviderError } from './errors.js';
import { coerce } from './coercer.js';
import { buildInitialPrompt, buildRetryPrompt } from './prompt-builder.js';
import { extractJSON } from './parser.js';
import type { QueryOptions, QueryResult, ValidationError } from './types.js';
import { isPlainObject } from './utils.js';
import { validate } from './validator.js';

function parseFailureErrors(message: string, raw: string): ValidationError[] {
  return [
    {
      field: '(parse)',
      expected: 'single JSON object',
      received: raw.length > MAX_PARSE_ERROR_RAW_LENGTH ? `${raw.slice(0, MAX_PARSE_ERROR_RAW_LENGTH)}…` : raw,
      message,
    },
  ];
}

function rootTypeError(parsed: unknown): ValidationError[] {
  const received =
    parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
  return [
    {
      field: '(root)',
      expected: 'object',
      received,
      message: '[llm-schema-validator] Root value must be a plain JSON object (not an array or primitive).',
    },
  ];
}

function createDiagLog(options: QueryOptions): (msg: string, ...args: unknown[]) => void {
  const { logger, debug } = options;
  if (logger?.debug) {
    return (msg, ...args) => logger.debug(`${LOG_PREFIX} ${msg}`, ...args);
  }
  if (debug) {
    return (msg, ...args) => console.log(`${LOG_PREFIX} ${msg}`, ...args);
  }
  return () => {};
}

/**
 * Run the LLM with schema-aware prompts, parse/coerce/validate, and retry on failure.
 */
export async function executeWithRetry<T>(options: QueryOptions): Promise<QueryResult<T>> {
  const maxAttempts = Math.max(1, options.maxRetries ?? 3);
  const coerceEnabled = options.coerce ?? true;
  const fallbackToPartial = options.fallbackToPartial ?? false;
  const log = createDiagLog(options);

  const allErrors: string[] = [];
  let prompt = buildInitialPrompt(options.prompt, options.schema);
  let lastCoerced: Record<string, unknown> | null = null;
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`attempt ${attempt}/${maxAttempts}`);

    let raw: string;
    try {
      raw = await options.provider.complete(prompt);
    } catch (e) {
      const wrapped = new ProviderError(
        `provider.complete() failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
      allErrors.push(`Attempt ${attempt}: ${wrapped.message}`);
      throw wrapped;
    }

    lastRaw = raw;
    log('raw response:', raw);

    let parsed: unknown;
    try {
      parsed = extractJSON(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      allErrors.push(`Attempt ${attempt}: could not extract JSON — ${msg}`);
      log('extractJSON error:', msg);

      if (attempt < maxAttempts) {
        prompt = buildRetryPrompt(
          options.prompt,
          options.schema,
          raw,
          parseFailureErrors(msg, raw),
        );
      }
      continue;
    }

    if (!isPlainObject(parsed)) {
      const msg = '[llm-schema-validator] Root value must be a JSON object (not an array or primitive).';
      allErrors.push(`Attempt ${attempt}: ${msg}`);
      log('validation skipped:', msg);
      if (attempt < maxAttempts) {
        prompt = buildRetryPrompt(
          options.prompt,
          options.schema,
          raw,
          rootTypeError(parsed),
        );
      }
      continue;
    }

    let data: Record<string, unknown> = parsed;
    if (coerceEnabled) {
      data = coerce(data, options.schema);
    }
    lastCoerced = data;

    const validationErrors = validate(data, options.schema);

    if (validationErrors.length === 0) {
      log('validation: ok');
    } else {
      log('validation errors:', validationErrors);
    }

    if (validationErrors.length === 0) {
      return {
        data: data as T,
        success: true,
        attempts: attempt,
        errors: [],
      };
    }

    for (const err of validationErrors) {
      allErrors.push(
        `Attempt ${attempt}: field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
      );
    }

    if (attempt < maxAttempts) {
      prompt = buildRetryPrompt(
        options.prompt,
        options.schema,
        raw,
        validationErrors,
      );
    }
  }

  if (fallbackToPartial && lastCoerced !== null) {
    return {
      data: lastCoerced as T,
      success: false,
      attempts: maxAttempts,
      errors: allErrors,
    };
  }

  const snippet =
    lastRaw.length > MAX_FINAL_ERROR_RAW_LENGTH
      ? `${lastRaw.slice(0, MAX_FINAL_ERROR_RAW_LENGTH)}…`
      : lastRaw;

  throw new QueryRetriesExhaustedError(maxAttempts, allErrors, snippet);
}
