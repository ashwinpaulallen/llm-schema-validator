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
  CompletionUsage,
  DependentRequired,
  FewShotExample,
  PromptTemplateContext,
  QueryArrayOptions,
  QueryCompletionSummary,
  QueryLogLevel,
  QueryObjectOptions,
  QueryOptions,
  QueryResult,
  Schema,
  ValidationError,
} from './types.js';
import { isPlainObject, mergeCompletionUsage, normalizeCompletionResult, toLabel } from './utils.js';
import { validate, validateRootArray } from './validator.js';

function validateDependentRequired(
  data: Record<string, unknown>,
  dependentRequired: DependentRequired | undefined,
): ValidationError[] {
  if (!dependentRequired) return [];
  const errors: ValidationError[] = [];
  for (const [triggerField, requiredFields] of Object.entries(dependentRequired)) {
    const hasTrigger =
      Object.prototype.hasOwnProperty.call(data, triggerField) &&
      data[triggerField] !== undefined &&
      data[triggerField] !== null;
    if (!hasTrigger) continue;
    for (const reqField of requiredFields) {
      const hasRequired =
        Object.prototype.hasOwnProperty.call(data, reqField) &&
        data[reqField] !== undefined &&
        data[reqField] !== null;
      if (!hasRequired) {
        errors.push({
          field: reqField,
          expected: `required (when "${triggerField}" is present)`,
          received: toLabel(data[reqField]),
          message: `[llm-schema-validator] Field "${reqField}" is required when "${triggerField}" is present`,
        });
      }
    }
  }
  return errors;
}

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

function assertFewShotMatchesRoot(
  fewShot: readonly FewShotExample[] | undefined,
  rootKind: 'object' | 'array',
): void {
  if (!fewShot?.length) return;
  for (let i = 0; i < fewShot.length; i++) {
    const ex = fewShot[i]!;
    if (typeof ex.input !== 'string') {
      throw new TypeError(`[llm-schema-validator] fewShot[${i}].input must be a string`);
    }
    if (rootKind === 'object') {
      if (!isPlainObject(ex.output)) {
        throw new TypeError(
          `[llm-schema-validator] fewShot[${i}].output must be a plain object when rootType is 'object' (or omitted)`,
        );
      }
    } else if (!Array.isArray(ex.output)) {
      throw new TypeError(
        `[llm-schema-validator] fewShot[${i}].output must be an array when rootType is 'array'`,
      );
    }
  }
}

function effectiveRetryBackoffMultiplier(options: QueryOptions): number {
  const m = options.retryBackoffMultiplier;
  if (m === undefined) return 2;
  if (!Number.isFinite(m) || m < 1) return 1;
  return m;
}

/** Order for filtering: only levels at or below `config` (more severe first) are emitted. */
const LOG_LEVEL_ORDER: readonly QueryLogLevel[] = ['error', 'warn', 'info', 'debug'];

function effectiveQueryLogLevel(options: QueryOptions): QueryLogLevel {
  if (options.logLevel !== undefined) return options.logLevel;
  if (options.debug === true) return 'debug';
  if (options.logger?.log ?? options.logger?.debug) return 'debug';
  return 'silent';
}

function shouldEmitAtLevel(config: QueryLogLevel, messageLevel: QueryLogLevel): boolean {
  if (config === 'silent') return false;
  const ci = LOG_LEVEL_ORDER.indexOf(config);
  const mi = LOG_LEVEL_ORDER.indexOf(messageLevel);
  if (ci === -1 || mi === -1) return false;
  return mi <= ci;
}

function consoleSink(level: QueryLogLevel, full: string, ...args: unknown[]): void {
  switch (level) {
    case 'error':
      console.error(full, ...args);
      break;
    case 'warn':
      console.warn(full, ...args);
      break;
    case 'info':
      console.info(full, ...args);
      break;
    case 'debug':
    default:
      console.debug(full, ...args);
      break;
  }
}

/** Emits a diagnostic line when {@link effectiveQueryLogLevel} allows `messageLevel`. */
function createDiagLog(
  options: QueryOptions,
): (messageLevel: QueryLogLevel, msg: string, ...args: unknown[]) => void {
  const cfg = effectiveQueryLogLevel(options);
  const { logger } = options;

  return (messageLevel, msg, ...args) => {
    if (!shouldEmitAtLevel(cfg, messageLevel)) return;
    const full = `${LOG_PREFIX} ${msg}`;
    if (logger?.log) {
      logger.log(messageLevel, full, ...args);
      return;
    }
    if (logger?.debug) {
      logger.debug(full, ...args);
      return;
    }
    consoleSink(messageLevel, full, ...args);
  };
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

/** Invokes `onAttempt` in a try/catch so user hooks cannot break retries or mask library errors. */
function notifyAttempt(
  options: QueryOptions,
  attempt: number,
  errors: string[],
  attemptDurationMs: number,
): void {
  try {
    options.onAttempt?.(attempt, errors, { durationMs: attemptDurationMs });
  } catch {
    /* Observability hooks must not affect query flow */
  }
}

/** Invokes `onComplete` in a try/catch so user hooks cannot replace `ProviderError` / `QueryRetriesExhaustedError` / abort errors. */
function emitQueryComplete(options: QueryOptions, summary: QueryCompletionSummary): void {
  try {
    options.onComplete?.(summary);
  } catch {
    /* Observability hooks must not affect query flow */
  }
}

/** Apply optional `promptTemplate` after the library builds the user message. */
function finalizePrompt(
  builtPrompt: string,
  options: QueryOptions,
  attempt: number,
  rootKind: 'object' | 'array',
  maxAttempts: number,
): string {
  const fn = options.promptTemplate;
  if (fn === undefined) return builtPrompt;
  const ctx: PromptTemplateContext = {
    builtPrompt,
    taskPrompt: options.prompt,
    attempt,
    maxAttempts,
    rootKind,
    isRetry: attempt > 1,
  };
  const out = fn(ctx);
  if (typeof out !== 'string') {
    throw new TypeError('[llm-schema-validator] promptTemplate must return a string');
  }
  return out;
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
    if (options.provider.__usesJsonObjectMode === true) {
      const warnLog = createDiagLog(options);
      warnLog(
        'warn',
        'rootType "array" with OpenAI json_object mode may fail or produce wrapped output. ' +
          'OpenAI\'s json_object response format requires a top-level object. ' +
          'Consider using response_format: { type: "text" } or structured outputs instead.',
      );
    }
  }

  const queryT0 = Date.now();
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
  const rootKind = isArrayRoot ? 'array' : 'object';
  assertFewShotMatchesRoot(options.fewShot, rootKind);
  const fewShot = options.fewShot;
  const chainOfThought = options.chainOfThought === true;

  const allErrors: string[] = [];
  let cumulativeUsage: CompletionUsage | undefined;
  let prompt = finalizePrompt(
    buildInitialPrompt(options.prompt, rootShape, fewShot, chainOfThought),
    options,
    1,
    rootKind,
    maxAttempts,
  );
  let lastCoerced: Record<string, unknown> | unknown[] | null = null;
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1 && retryDelayBase !== undefined) {
      const waitMs = retryDelayBase * Math.pow(backoffMult, attempt - 2);
      log('debug', `retry backoff ${waitMs}ms before attempt ${attempt}`);
      try {
        await delayWithAbort(waitMs, options.signal);
      } catch (e) {
        const durationMs = Date.now() - queryT0;
        emitQueryComplete(options, {
          success: false,
          attempts: attempt - 1,
          durationMs,
          errors: allErrors,
          ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
        });
        throw e;
      }
    }
    const attemptStart = Date.now();
    log('info', `attempt ${attempt}/${maxAttempts}`);

    if (options.onPromptBuilt) {
      try {
        options.onPromptBuilt(prompt, attempt);
      } catch {
        /* ignore hook errors */
      }
    }

    let raw: string;
    let providerStartTime = 0;
    try {
      const attemptSignal = combineSignals(options.signal, options.providerTimeoutMs);
      const completeInit =
        attemptSignal === undefined && options.systemPrompt === undefined
          ? undefined
          : {
              ...(attemptSignal !== undefined ? { signal: attemptSignal } : {}),
              ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
            };
      if (options.onProviderStart) {
        try {
          options.onProviderStart(attempt);
        } catch {
          /* ignore hook errors */
        }
      }
      providerStartTime = Date.now();
      const task = options.provider.complete(prompt, completeInit);
      const completionRaw = await raceWithSignal(task, attemptSignal);
      const providerDurationMs = Date.now() - providerStartTime;
      const normalized = normalizeCompletionResult(completionRaw);
      raw = normalized.text;
      if (options.onProviderEnd) {
        try {
          options.onProviderEnd(attempt, providerDurationMs, raw);
        } catch {
          /* ignore hook errors */
        }
      }
      cumulativeUsage = mergeCompletionUsage(cumulativeUsage, normalized.usage);
    } catch (e) {
      if (options.onProviderEnd) {
        try {
          const providerDurationMs =
            providerStartTime === 0 ? 0 : Date.now() - providerStartTime;
          options.onProviderEnd(attempt, providerDurationMs, undefined);
        } catch {
          /* ignore hook errors */
        }
      }
      const wrapped = new ProviderError(
        `provider.complete() failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
      notifyAttempt(options, attempt, [wrapped.message], Date.now() - attemptStart);
      allErrors.push(`Attempt ${attempt}: ${wrapped.message}`);
      const durationMs = Date.now() - queryT0;
      emitQueryComplete(options, {
        success: false,
        attempts: attempt,
        durationMs,
        errors: allErrors,
        ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
      });
      throw wrapped;
    }

    lastRaw = raw;
    log('debug', 'raw response:', raw);

    let parsed: unknown;
    try {
      parsed = extractJSON(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const parseErr = `could not extract JSON — ${msg}`;
      notifyAttempt(options, attempt, [parseErr], Date.now() - attemptStart);
      allErrors.push(`Attempt ${attempt}: ${parseErr}`);
      log('warn', 'extractJSON error:', msg);

      if (attempt < maxAttempts) {
        prompt = finalizePrompt(
          buildRetryPrompt(
            options.prompt,
            rootShape,
            raw,
            parseFailureErrors(msg, raw, isArrayRoot ? 'array' : 'object'),
            fewShot,
            chainOfThought,
          ),
          options,
          attempt + 1,
          rootKind,
          maxAttempts,
        );
      }
      continue;
    }

    if (isArrayRoot) {
      if (!Array.isArray(parsed)) {
        const msg =
          '[llm-schema-validator] Root value must be a JSON array (not an object or primitive).';
        notifyAttempt(options, attempt, [msg], Date.now() - attemptStart);
        allErrors.push(`Attempt ${attempt}: ${msg}`);
        log('warn', 'validation skipped:', msg);
        if (attempt < maxAttempts) {
          prompt = finalizePrompt(
            buildRetryPrompt(
              options.prompt,
              rootShape,
              raw,
              rootArrayTypeError(parsed),
              fewShot,
              chainOfThought,
            ),
            options,
            attempt + 1,
            rootKind,
            maxAttempts,
          );
        }
        continue;
      }

      let data: unknown[] = parsed;
      if (coerceEnabled) {
        const beforeCoerce = parsed;
        data = coerceRootArray(data, arraySchema!);
        if (options.onCoercionApplied) {
          try {
            options.onCoercionApplied(beforeCoerce, data, attempt);
          } catch {
            /* ignore hook errors */
          }
        }
      }
      lastCoerced = data;

      let validationErrors = validateRootArray(data, arraySchema!);
      const arrayOpts = options as QueryArrayOptions<ArrayRootFieldSchema>;
      if (validationErrors.length === 0 && arrayOpts.validate) {
        validationErrors = runQueryLevelValidate(() => arrayOpts.validate!(data));
      }

      if (validationErrors.length === 0) {
        log('info', 'validation: ok');
      } else {
        log('warn', 'validation errors:', validationErrors);
      }

      if (validationErrors.length === 0) {
        const now = Date.now();
        notifyAttempt(options, attempt, [], now - attemptStart);
        const durationMs = now - queryT0;
        emitQueryComplete(options, {
          success: true,
          attempts: attempt,
          durationMs,
          errors: [],
          ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
        });
        return {
          data: data as T,
          success: true,
          attempts: attempt,
          errors: [],
          durationMs,
          ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
        };
      }

      notifyAttempt(options, attempt, formatValidationAttemptErrors(validationErrors), Date.now() - attemptStart);

      for (const err of validationErrors) {
        allErrors.push(
          `Attempt ${attempt}: field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
        );
      }

      if (attempt < maxAttempts) {
        prompt = finalizePrompt(
          buildRetryPrompt(options.prompt, rootShape, raw, validationErrors, fewShot, chainOfThought),
          options,
          attempt + 1,
          rootKind,
          maxAttempts,
        );
      }
      continue;
    }

    if (!isPlainObject(parsed)) {
      const msg = '[llm-schema-validator] Root value must be a JSON object (not an array or primitive).';
      notifyAttempt(options, attempt, [msg], Date.now() - attemptStart);
      allErrors.push(`Attempt ${attempt}: ${msg}`);
      log('warn', 'validation skipped:', msg);
      if (attempt < maxAttempts) {
        prompt = finalizePrompt(
          buildRetryPrompt(options.prompt, rootShape, raw, rootObjectTypeError(parsed), fewShot, chainOfThought),
          options,
          attempt + 1,
          rootKind,
          maxAttempts,
        );
      }
      continue;
    }

    const objectSchema = (options as QueryObjectOptions<Schema>).schema;
    const objectOpts = options as QueryObjectOptions<Schema>;
    let data: Record<string, unknown> = parsed;
    if (coerceEnabled) {
      const beforeCoerce = parsed;
      data = coerce(data, objectSchema);
      if (options.onCoercionApplied) {
        try {
          options.onCoercionApplied(beforeCoerce, data, attempt);
        } catch {
          /* ignore hook errors */
        }
      }
    }
    lastCoerced = data;

    let validationErrors = validate(data, objectSchema);
    if (validationErrors.length === 0 && objectOpts.dependentRequired) {
      validationErrors = validateDependentRequired(data, objectOpts.dependentRequired);
    }
    if (validationErrors.length === 0 && objectOpts.validate) {
      validationErrors = runQueryLevelValidate(() => objectOpts.validate!(data));
    }

    if (validationErrors.length === 0) {
      log('info', 'validation: ok');
    } else {
      log('warn', 'validation errors:', validationErrors);
    }

    if (validationErrors.length === 0) {
      const now = Date.now();
      notifyAttempt(options, attempt, [], now - attemptStart);
      const durationMs = now - queryT0;
      emitQueryComplete(options, {
        success: true,
        attempts: attempt,
        durationMs,
        errors: [],
        ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
      });
      return {
        data: data as T,
        success: true,
        attempts: attempt,
        errors: [],
        durationMs,
        ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
      };
    }

    notifyAttempt(options, attempt, formatValidationAttemptErrors(validationErrors), Date.now() - attemptStart);

    for (const err of validationErrors) {
      allErrors.push(
        `Attempt ${attempt}: field "${err.field}" — ${err.message} (expected ${err.expected}; received ${err.received})`,
      );
    }

    if (attempt < maxAttempts) {
      prompt = finalizePrompt(
        buildRetryPrompt(options.prompt, rootShape, raw, validationErrors, fewShot, chainOfThought),
        options,
        attempt + 1,
        rootKind,
        maxAttempts,
      );
    }
  }

  if (fallbackToPartial && lastCoerced !== null) {
    const durationMs = Date.now() - queryT0;
    emitQueryComplete(options, {
      success: false,
      attempts: maxAttempts,
      durationMs,
      errors: allErrors,
      ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
    });
    return {
      data: lastCoerced as T,
      success: false,
      attempts: maxAttempts,
      errors: allErrors,
      durationMs,
      ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
    };
  }

  const snippet =
    lastRaw.length > MAX_FINAL_ERROR_RAW_LENGTH
      ? `${lastRaw.slice(0, MAX_FINAL_ERROR_RAW_LENGTH)}…`
      : lastRaw;

  const durationMs = Date.now() - queryT0;
  emitQueryComplete(options, {
    success: false,
    attempts: maxAttempts,
    durationMs,
    errors: allErrors,
    ...(cumulativeUsage ? { usage: cumulativeUsage } : {}),
  });
  throw new QueryRetriesExhaustedError(maxAttempts, allErrors, snippet, durationMs, cumulativeUsage);
}
