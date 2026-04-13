import { isPlainObject, toLabel } from './utils.js';
import type { FieldSchema, Schema, ValidationError } from './types.js';

/** Build a {@link ValidationError} with a consistent `received` label. */
function issue(field: string, expected: string, received: unknown, message: string): ValidationError {
  return { field, expected, received: toLabel(received), message };
}

function validateEmail(value: string, path: string): ValidationError[] {
  if (value.includes('@') && value.includes('.')) return [];
  return [
    issue(
      path,
      'string matching email format (must contain @ and .)',
      value,
      `[llm-schema-validator] Field "${path}" must be a string containing "@" and "."`,
    ),
  ];
}

function validateUrl(value: string, path: string): ValidationError[] {
  if (value.startsWith('http')) return [];
  return [
    issue(
      path,
      'string with URL starting with "http"',
      value,
      `[llm-schema-validator] Field "${path}" must be a string starting with "http"`,
    ),
  ];
}

function validateDate(value: string, path: string): ValidationError[] {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return [];
  return [
    issue(
      path,
      'string parseable as a date',
      value,
      `[llm-schema-validator] Field "${path}" must be a date string parseable by the Date constructor`,
    ),
  ];
}

function validateStringFormat(
  value: string,
  format: NonNullable<FieldSchema['format']>,
  path: string,
): ValidationError[] {
  switch (format) {
    case 'email':
      return validateEmail(value, path);
    case 'url':
      return validateUrl(value, path);
    case 'date':
      return validateDate(value, path);
    default:
      return [];
  }
}

function typeExpectedLabel(field: FieldSchema): string {
  if (field.type === 'string' && field.format) {
    return `string (format: ${field.format})`;
  }
  return field.type;
}

function validatePrimitiveItemType(
  item: unknown,
  itemType: NonNullable<FieldSchema['itemType']>,
  path: string,
): ValidationError[] {
  switch (itemType) {
    case 'string':
      if (typeof item === 'string') return [];
      return [issue(path, 'string', item, `[llm-schema-validator] Field "${path}" must be a string`)];
    case 'number':
      if (typeof item === 'number' && !Number.isNaN(item)) return [];
      return [issue(path, 'number', item, `[llm-schema-validator] Field "${path}" must be a number`)];
    case 'boolean':
      if (typeof item === 'boolean') return [];
      return [issue(path, 'boolean', item, `[llm-schema-validator] Field "${path}" must be a boolean`)];
    case 'array':
      if (Array.isArray(item)) return [];
      return [issue(path, 'array', item, `[llm-schema-validator] Field "${path}" must be an array`)];
    case 'object':
      if (isPlainObject(item)) return [];
      return [issue(path, 'object', item, `[llm-schema-validator] Field "${path}" must be a plain object`)];
    default:
      return [];
  }
}

function validateArrayItems(
  arr: unknown[],
  field: FieldSchema,
  path: string,
): ValidationError[] {
  if (!field.itemType) return [];

  const errors: ValidationError[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const itemPath = `${path}[${i}]`;

    if (field.itemType === 'object' && field.itemProperties) {
      if (!isPlainObject(item)) {
        errors.push(
          issue(
            itemPath,
            'object',
            item,
            `[llm-schema-validator] Field "${itemPath}" must be a plain object`,
          ),
        );
        continue;
      }
      errors.push(...validateRecord(item, field.itemProperties, itemPath));
      continue;
    }

    errors.push(...validatePrimitiveItemType(item, field.itemType, itemPath));
  }

  return errors;
}

/**
 * Validate `value` against `field` at `path`, including nested object/array rules.
 */
function validateTypeAndNested(
  value: unknown,
  field: FieldSchema,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(
          issue(path, typeExpectedLabel(field), value, `[llm-schema-validator] Field "${path}" must be a string`),
        );
        return errors;
      }
      if (field.format) {
        errors.push(...validateStringFormat(value, field.format, path));
      }
      return errors;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(issue(path, 'number', value, `[llm-schema-validator] Field "${path}" must be a number`));
      }
      return errors;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push(issue(path, 'boolean', value, `[llm-schema-validator] Field "${path}" must be a boolean`));
      }
      return errors;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(issue(path, 'array', value, `[llm-schema-validator] Field "${path}" must be an array`));
        return errors;
      }
      errors.push(...validateArrayItems(value, field, path));
      return errors;
    }
    case 'object': {
      if (!isPlainObject(value)) {
        errors.push(
          issue(path, 'object', value, `[llm-schema-validator] Field "${path}" must be a plain object`),
        );
        return errors;
      }
      if (field.properties && Object.keys(field.properties).length > 0) {
        errors.push(...validateRecord(value, field.properties, path));
      }
      return errors;
    }
    default:
      return errors;
  }
}

function validateRecord(
  data: Record<string, unknown>,
  schema: Schema,
  prefix: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const key of Object.keys(schema)) {
    const field = schema[key];
    const path = prefix ? `${prefix}.${key}` : key;
    const hasKey = Object.prototype.hasOwnProperty.call(data, key);
    const value = hasKey ? data[key] : undefined;

    if (field.required) {
      if (value === undefined || value === null) {
        errors.push(
          issue(
            path,
            'required (non-null, non-undefined)',
            value,
            `[llm-schema-validator] Field "${path}" is required`,
          ),
        );
        continue;
      }
    } else if (value === undefined || value === null) {
      continue;
    }

    errors.push(...validateTypeAndNested(value, field, path));
  }

  return errors;
}

/**
 * Validate a plain object against a {@link Schema}. Returns all validation errors, or an empty array if valid.
 */
export function validate(data: Record<string, unknown>, schema: Schema): ValidationError[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TypeError('[llm-schema-validator] validate: data must be a plain object');
  }
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new TypeError('[llm-schema-validator] validate: schema must be a plain object');
  }
  return validateRecord(data, schema, '');
}
