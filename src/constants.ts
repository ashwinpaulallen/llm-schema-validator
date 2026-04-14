/**
 * Centralized configuration constants.
 */

/** Prefix for log lines and user-facing error messages (consistent diagnostics). */
export const LOG_PREFIX = '[llm-schema-validator]';

/** Maximum length of raw LLM response to include in error messages. */
export const MAX_ERROR_SNIPPET = 500;

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
