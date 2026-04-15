import type { ArrayRootFieldSchema, FieldSchema, Schema, SimpleFieldSchema, UnionFieldSchema } from './types.js';
import {
  isUnionField,
  runCustomValidate,
  syntheticFieldFromUnionBranch,
  validateTypeAndNested,
} from './validator.js';
import { isPlainObject } from './utils.js';

function cloneDefault(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as unknown;
  }
}

function coerceNumber(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return value;
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
  }
  return value;
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return value;
}

function coerceString(value: unknown): unknown {
  if (typeof value === 'string') {
    // e.g. "2024-01-01" — keep as string; format is validated later
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value;
}

function coerceArray(value: unknown): unknown {
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(t);
        if (Array.isArray(parsed)) return [...parsed];
        return parsed;
      } catch {
        return value;
      }
    }
  }
  if (Array.isArray(value)) return [...value];
  return value;
}

function coerceObject(
  value: unknown,
  properties: Schema | undefined,
): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (properties && Object.keys(properties).length > 0) {
    return coerce(record, properties);
  }
  return { ...record };
}

function coerceAnyOf(value: unknown, field: UnionFieldSchema): unknown {
  const branches = field.anyOf;
  if (branches.length === 0) return value;
  for (const branch of branches) {
    const synthetic = syntheticFieldFromUnionBranch(field, branch);
    const coerced = coerceSimpleFieldValue(value, synthetic);
    const errs = validateTypeAndNested(coerced, synthetic, '');
    if (errs.length > 0) continue;
    if (field.validate) {
      const parentErrs = runCustomValidate(coerced, { validate: field.validate } as FieldSchema, '');
      if (parentErrs.length > 0) continue;
    }
    return coerced;
  }
  return coerceSimpleFieldValue(value, syntheticFieldFromUnionBranch(field, branches[0]!));
}

function coerceSimpleFieldValue(value: unknown, field: SimpleFieldSchema): unknown {
  switch (field.type) {
    case 'number':
      return coerceNumber(value);
    case 'boolean':
      return coerceBoolean(value);
    case 'string':
      return coerceString(value);
    case 'array':
      return coerceArray(value);
    case 'object':
      return coerceObject(value, field.properties);
    default:
      return value;
  }
}

function coerceValue(value: unknown, field: FieldSchema): unknown {
  if (isUnionField(field)) {
    return coerceAnyOf(value, field);
  }
  return coerceSimpleFieldValue(value, field);
}

/**
 * Apply schema-driven coercions to a plain object without mutating the input.
 * Nested `object` fields recurse using `FieldSchema.properties`.
 */
export function coerce(data: Record<string, unknown>, schema: Schema): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TypeError('[llm-schema-validator] coerce: data must be a plain object');
  }
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new TypeError('[llm-schema-validator] coerce: schema must be a plain object');
  }

  const out: Record<string, unknown> = { ...data };

  for (const key of Object.keys(schema)) {
    const field = schema[key];
    const hasKey = Object.prototype.hasOwnProperty.call(data, key);
    let value: unknown = hasKey ? data[key] : undefined;

    if (hasKey && value === null && field.nullable) {
      out[key] = null;
      continue;
    }

    if (value === null || value === undefined) {
      if (field.default !== undefined) {
        value = cloneDefault(field.default);
      }
    }

    out[key] = coerceValue(value, field);
  }

  return out;
}

function coerceArrayElement(
  item: unknown,
  itemType: NonNullable<SimpleFieldSchema['itemType']>,
  itemProperties: Schema | undefined,
): unknown {
  switch (itemType) {
    case 'object':
      if (!isPlainObject(item)) return item;
      return itemProperties && Object.keys(itemProperties).length > 0
        ? coerce(item, itemProperties)
        : { ...item };
    case 'string':
      return coerceString(item);
    case 'number':
      return coerceNumber(item);
    case 'boolean':
      return coerceBoolean(item);
    case 'array':
      return coerceArray(item);
    default:
      return item;
  }
}

/**
 * Apply schema-driven coercions to a root JSON array (per-element when `itemType` is set).
 */
export function coerceRootArray(data: unknown[], field: ArrayRootFieldSchema): unknown[] {
  const arr = [...data];
  const itemType = field.itemType;
  if (!itemType) return arr;
  return arr.map((el) => coerceArrayElement(el, itemType, field.itemProperties));
}
