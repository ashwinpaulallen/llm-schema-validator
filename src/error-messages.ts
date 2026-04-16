import type { ErrorMessageTemplates } from './types.js';

const LOG_PREFIX = '[llm-schema-validator]';

/**
 * Default English error message templates.
 */
export const defaultErrorMessages: Required<ErrorMessageTemplates> = {
  required: (field) => `${LOG_PREFIX} Field "${field}" is required`,
  notNullable: (field) => `${LOG_PREFIX} Field "${field}" cannot be null`,
  typeMismatch: (field, expected, _received) =>
    `${LOG_PREFIX} Field "${field}" must match: ${expected}`,
  patternMismatch: (field, _pattern) =>
    `${LOG_PREFIX} Field "${field}" does not match the required pattern`,
  minLength: (field, minLength, _actualLength) =>
    `${LOG_PREFIX} Field "${field}" is shorter than minLength ${minLength}`,
  maxLength: (field, maxLength, _actualLength) =>
    `${LOG_PREFIX} Field "${field}" is longer than maxLength ${maxLength}`,
  minimum: (field, minimum, _value) =>
    `${LOG_PREFIX} Field "${field}" is below minimum ${minimum}`,
  maximum: (field, maximum, _value) =>
    `${LOG_PREFIX} Field "${field}" is above maximum ${maximum}`,
  multipleOf: (field, multipleOf, _value) =>
    `${LOG_PREFIX} Field "${field}" must be a multiple of ${multipleOf}`,
  notInteger: (field, _value) =>
    `${LOG_PREFIX} Field "${field}" must be an integer`,
  enumMismatch: (field, _allowed) =>
    `${LOG_PREFIX} Field "${field}" must be one of the allowed values`,
  constMismatch: (field, expected) =>
    `${LOG_PREFIX} Field "${field}" must be exactly ${JSON.stringify(expected)}`,
  minItems: (field, minItems, _actualItems) =>
    `${LOG_PREFIX} Field "${field}" must have at least ${minItems} item(s)`,
  maxItems: (field, maxItems, _actualItems) =>
    `${LOG_PREFIX} Field "${field}" must have at most ${maxItems} item(s)`,
  uniqueItems: (field) =>
    `${LOG_PREFIX} Field "${field}" contains duplicate items`,
  formatMismatch: (field, format) =>
    `${LOG_PREFIX} Field "${field}" must be a valid ${format}`,
  customValidation: (field, message) =>
    message.startsWith(LOG_PREFIX) ? message : `${LOG_PREFIX} Field "${field}": ${message}`,
  dependentRequired: (field, triggerField) =>
    `${LOG_PREFIX} Field "${field}" is required when "${triggerField}" is present`,
};

/**
 * Merge custom error templates with defaults.
 */
export function mergeErrorTemplates(
  custom?: ErrorMessageTemplates,
): Required<ErrorMessageTemplates> {
  if (!custom) return defaultErrorMessages;
  return { ...defaultErrorMessages, ...custom };
}

/**
 * Merge custom templates with defaults (same as {@link mergeErrorTemplates}).
 */
export function createErrorMessageGenerator(
  templates?: ErrorMessageTemplates,
): Required<ErrorMessageTemplates> {
  return mergeErrorTemplates(templates);
}

export type ErrorMessageGenerator = Required<ErrorMessageTemplates>;
