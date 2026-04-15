import { combineSignals, delayWithAbort, raceWithSignal } from './abort.js';
import {
  LOG_PREFIX,
  MAX_FINAL_ERROR_RAW_LENGTH,
  MAX_PARSE_ERROR_RAW_LENGTH,
} from './constants.js';
import { QueryRetriesExhaustedError, ProviderError } from './errors.js';
import { coerce, coerceRootArray } from './coercer.js';
import { buildInitialPrompt, buildRetryPrompt, type RootPromptShape } from './prompt-builder.js';
import { extractJSON } from './parser.js';
import type {
  ArrayRootFieldSchema,
  QueryArrayOptions,
  QueryObjectOptions,
  QueryOptions,
  QueryResult,
  Schema,
  ValidationError,
} from './types.js';
import { isPlainObject, toLabel } from './utils.js';
import { validate, validateRootArray } from './validator.js';

function parseFailureErrors(message: string, raw: string, root: 'object' | 'array'): ValidationError[] {
  return [
    {
      field: '(parse)',
      expected: root === 'object' ? 'single JSON object' : 'single JSON array',
      received: raw.length > MAX_PARSE_ERROR_RAW_LENGTH ? `${raw.slice(0, MAX_PARSE_ERROR_RAW_LENGTH)}…` : raw,
      message,
    },
  ];
}

function rootObjectTypeError(parsed: unknown): ValidationError[] {
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

function rootArrayTypeError(parsed: unknown): ValidationError[] {
  const received =
    parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
  return [
    {
      field: '(root)',
      expected: 'array',
      received,
      message: '[llm-schema-validator] Root value must be a JSON array (not an object or primitive).',
    },
  ];
}

function isArrayRootQuery(
  options: QueryOptions,
): options is QueryArrayOptions<ArrayRootFieldSchema> {
  return options.rootType === 'array';
}

function rootShapeFromOptions(options: QueryOptions): RootPromptShape {
  if (isArrayRootQuery(options)) {
    return { kind: 'array', arraySchema: options.arraySchema };
  }
  return { kind: 'object', schema: options.schema };
}

function effectiveRetryBackoffMultiplier(options: QueryOptions): number {
  const m = options.retryBackoffMultiplier;
  if (m === undefined) return 2;
  if (!Number.isFinite(m) || m < 1) return 1;
  return m;
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

function formatValidationAttemptErrors(errors: ValidationError[]): string[] {
  return errors.map(
    (err) =>
      `field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
  );
}

/** Cross-field / query-level validate: same contract as {@link FieldSchema.validate} (`null` = ok). */
function runQueryLevelValidate(run: () => string | null): ValidationError[] {
  try {
    const msg = run();
    if (msg === null || msg === undefined) return [];
    if (typeof msg !== 'string') {
      return [
        {
          field: '(query)',
          expected: 'string | null from query validate',
          received: typeof msg,
          message: '[llm-schema-validator] query validate must return string | null',
        },
      ];
    }
    const message =
      msg.length > 0
        ? msg.startsWith('[llm-schema-validator]')
          ? msg
          : `[llm-schema-validator] ${msg}`
        : '[llm-schema-validator] Cross-field validation failed';
    return [
      {
        field: '(query)',
        expected: 'cross-field rules satisfied',
        received: 'constraint failed',
        message,
      },
    ];
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return [
      {
        field: '(query)',
        expected: 'cross-field validation',
        received: toLabel(e),
        message: `[llm-schema-validator] query validate threw: ${detail}`,
      },
    ];
  }
}

function notifyAttempt(
  options: QueryOptions,
  attempt: number,
  errors: string[],
): void {
  options.onAttempt?.(attempt, errors);
}

/**
 * Run the LLM with schema-aware prompts, parse/coerce/validate, and retry on failure.
 */
export async function executeWithRetry<T>(options: QueryOptions): Promise<QueryResult<T>> {
  if (isArrayRootQuery(options)) {
    const a = options.arraySchema;
    if (!a || a.type !== 'array') {
      throw new TypeError(
        '[llm-schema-validator] rootType "array" requires arraySchema with type: "array"',
      );
    }
  }

  const maxAttempts = Math.max(1, options.maxRetries ?? 3);
  const coerceEnabled = options.coerce ?? true;
  const fallbackToPartial = options.fallbackToPartial ?? false;
  const log = createDiagLog(options);
  const retryDelayBase =
    options.retryDelayMs !== undefined && options.retryDelayMs > 0 ? options.retryDelayMs : undefined;
  const backoffMult = effectiveRetryBackoffMultiplier(options);

  const rootShape = rootShapeFromOptions(options);
  const isArrayRoot = rootShape.kind === 'array';
  const arraySchema = isArrayRoot ? rootShape.arraySchema : undefined;

  const allErrors: string[] = [];
  let prompt = buildInitialPrompt(options.prompt, rootShape);
  let lastCoerced: Record<string, unknown> | unknown[] | null = null;
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1 && retryDelayBase !== undefined) {
      const waitMs = retryDelayBase * Math.pow(backoffMult, attempt - 2);
      log(`retry backoff ${waitMs}ms before attempt ${attempt}`);
      await delayWithAbort(waitMs, options.signal);
    }
    log(`attempt ${attempt}/${maxAttempts}`);

    let raw: string;
    try {
      const attemptSignal = combineSignals(options.signal, options.providerTimeoutMs);
      const completeInit =
        attemptSignal === undefined && options.systemPrompt === undefined
          ? undefined
          : {
              ...(attemptSignal !== undefined ? { signal: attemptSignal } : {}),
              ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
            };
      const task = options.provider.complete(prompt, completeInit);
      raw = await raceWithSignal(task, attemptSignal);
    } catch (e) {
      const wrapped = new ProviderError(
        `provider.complete() failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
      notifyAttempt(options, attempt, [wrapped.message]);
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
      const parseErr = `could not extract JSON — ${msg}`;
      notifyAttempt(options, attempt, [parseErr]);
      allErrors.push(`Attempt ${attempt}: ${parseErr}`);
      log('extractJSON error:', msg);

      if (attempt < maxAttempts) {
        prompt = buildRetryPrompt(
          options.prompt,
          rootShape,
          raw,
          parseFailureErrors(msg, raw, isArrayRoot ? 'array' : 'object'),
        );
      }
      continue;
    }

    if (isArrayRoot) {
      if (!Array.isArray(parsed)) {
        const msg =
          '[llm-schema-validator] Root value must be a JSON array (not an object or primitive).';
        notifyAttempt(options, attempt, [msg]);
        allErrors.push(`Attempt ${attempt}: ${msg}`);
        log('validation skipped:', msg);
        if (attempt < maxAttempts) {
          prompt = buildRetryPrompt(options.prompt, rootShape, raw, rootArrayTypeError(parsed));
        }
        continue;
      }

      let data: unknown[] = parsed;
      if (coerceEnabled) {
        data = coerceRootArray(data, arraySchema!);
      }
      lastCoerced = data;

      let validationErrors = validateRootArray(data, arraySchema!);
      const arrayOpts = options as QueryArrayOptions<ArrayRootFieldSchema>;
      if (validationErrors.length === 0 && arrayOpts.validate) {
        validationErrors = runQueryLevelValidate(() => arrayOpts.validate!(data));
      }

      if (validationErrors.length === 0) {
        log('validation: ok');
      } else {
        log('validation errors:', validationErrors);
      }

      if (validationErrors.length === 0) {
        notifyAttempt(options, attempt, []);
        return {
          data: data as T,
          success: true,
          attempts: attempt,
          errors: [],
        };
      }

      notifyAttempt(options, attempt, formatValidationAttemptErrors(validationErrors));

      for (const err of validationErrors) {
        allErrors.push(
          `Attempt ${attempt}: field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
        );
      }

      if (attempt < maxAttempts) {
        prompt = buildRetryPrompt(options.prompt, rootShape, raw, validationErrors);
      }
      continue;
    }

    if (!isPlainObject(parsed)) {
      const msg = '[llm-schema-validator] Root value must be a JSON object (not an array or primitive).';
      notifyAttempt(options, attempt, [msg]);
      allErrors.push(`Attempt ${attempt}: ${msg}`);
      log('validation skipped:', msg);
      if (attempt < maxAttempts) {
        prompt = buildRetryPrompt(options.prompt, rootShape, raw, rootObjectTypeError(parsed));
      }
      continue;
    }

    const objectSchema = (options as QueryObjectOptions<Schema>).schema;
    const objectOpts = options as QueryObjectOptions<Schema>;
    let data: Record<string, unknown> = parsed;
    if (coerceEnabled) {
      data = coerce(data, objectSchema);
    }
    lastCoerced = data;

    let validationErrors = validate(data, objectSchema);
    if (validationErrors.length === 0 && objectOpts.validate) {
      validationErrors = runQueryLevelValidate(() => objectOpts.validate!(data));
    }

    if (validationErrors.length === 0) {
      log('validation: ok');
    } else {
      log('validation errors:', validationErrors);
    }

    if (validationErrors.length === 0) {
      notifyAttempt(options, attempt, []);
      return {
        data: data as T,
        success: true,
        attempts: attempt,
        errors: [],
      };
    }

    notifyAttempt(options, attempt, formatValidationAttemptErrors(validationErrors));

    for (const err of validationErrors) {
      allErrors.push(
        `Attempt ${attempt}: field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
      );
    }

    if (attempt < maxAttempts) {
      prompt = buildRetryPrompt(options.prompt, rootShape, raw, validationErrors);
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
