/**
 * Centralized configuration constants.
 */

/** Prefix for log lines and user-facing error messages (consistent diagnostics). */
export const LOG_PREFIX = '[llm-schema-validator]';

/** Maximum length of raw LLM response to include in error messages. */
export const MAX_ERROR_SNIPPET = 500;

/** Max length of a field `pattern` string before it is rejected (mitigates ReDoS / compile cost). */
export const MAX_SCHEMA_PATTERN_SOURCE_LENGTH = 512;

/** Max characters of model output logged at `debug` unless `logFullRawResponses` is enabled. */
export const MAX_DEBUG_RAW_RESPONSE_PREVIEW = 256;

/** Maximum length of field description in schema prompts. */
export const MAX_DESCRIPTION_LENGTH = 120;

/** Maximum length of serialized `examples` text in schema prompts. */
export const MAX_EXAMPLES_PROMPT_LENGTH = 120;

/** Maximum length of previous response to include in retry prompts. */
export const MAX_PREVIOUS_RESPONSE_LENGTH = 1800;

/** Maximum length of raw response for parse error received field. */
export const MAX_PARSE_ERROR_RAW_LENGTH = 240;

/** Maximum length of raw response in final error message. */
export const MAX_FINAL_ERROR_RAW_LENGTH = 2000;

/** Maximum default value string length in prompt. */
export const MAX_DEFAULT_VALUE_LENGTH = 40;

/** Max length of each few-shot `input` when serialized into prompts. */
export const MAX_FEWSHOT_INPUT_LENGTH = 4000;

/** Max length of each few-shot stringified JSON `output` in prompts. */
export const MAX_FEWSHOT_OUTPUT_JSON_LENGTH = 8000;

/** Max total length of the few-shot block appended to the user message. */
export const MAX_FEWSHOT_BLOCK_LENGTH = 12000;

/** Max number of few-shot pairs included (additional entries are ignored). */
export const MAX_FEWSHOT_EXAMPLES = 32;

/** Stricter caps when embedding few-shot on **retry** prompts (keep fixes + previous reply prominent). */
export const MAX_FEWSHOT_RETRY_EXAMPLES = 6;

export const MAX_FEWSHOT_RETRY_INPUT_LENGTH = 1500;

export const MAX_FEWSHOT_RETRY_OUTPUT_JSON_LENGTH = 4000;

/** Max total few-shot size on retries (smaller than {@link MAX_FEWSHOT_BLOCK_LENGTH}). */
export const MAX_FEWSHOT_RETRY_BLOCK_LENGTH = 4500;
