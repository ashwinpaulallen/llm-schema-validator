import { isPlainObject, toLabel } from './utils.js';
import type {
  AnyOfBranchSchema,
  ArrayRootFieldSchema,
  FieldSchema,
  Schema,
  SimpleFieldSchema,
  UnionFieldSchema,
  ValidationError,
} from './types.js';

/** Build a {@link ValidationError} with a consistent `received` label. */
function issue(field: string, expected: string, received: unknown, message: string): ValidationError {
  return { field, expected, received: toLabel(received), message };
}

/** Lightweight email check: single `@`, non-empty local/domain, domain has labels and a TLD ≥2 chars. Not full RFC 5322. */
function isPlausibleEmail(value: string): boolean {
  if (value !== value.trim()) return false;
  if (/[\s]/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0) return false;
  if (value.indexOf('@', at + 1) !== -1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || !domain) return false;
  if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (!domain.includes('.')) return false;
  const labels = domain.split('.');
  if (labels.some((l) => l.length === 0)) return false;
  const tld = labels[labels.length - 1]!;
  return tld.length >= 2;
}

function validateEmail(value: string, path: string): ValidationError[] {
  if (isPlausibleEmail(value)) return [];
  return [
    issue(
      path,
      'string in a simple email shape (local@domain.tld)',
      value,
      `[llm-schema-validator] Field "${path}" must look like a valid email (e.g. name@example.com)`,
    ),
  ];
}

/** `http:` or `https:` URL with a host (uses the WHATWG URL parser). */
function isHttpOrHttpsUrl(value: string): boolean {
  if (value !== value.trim()) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.length > 0;
  } catch {
    return false;
  }
}

function validateUrl(value: string, path: string): ValidationError[] {
  if (isHttpOrHttpsUrl(value)) return [];
  return [
    issue(
      path,
      'absolute http(s) URL (e.g. https://example.com/path)',
      value,
      `[llm-schema-validator] Field "${path}" must be a valid http(s) URL`,
    ),
  ];
}

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date `YYYY-MM-DD` (UTC), rejects ambiguous `Date.parse` inputs like `"2"`. */
function isIsoCalendarDate(value: string): boolean {
  if (value !== value.trim()) return false;
  const m = value.match(ISO_DATE_ONLY);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function validateDate(value: string, path: string): ValidationError[] {
  if (isIsoCalendarDate(value)) return [];
  return [
    issue(
      path,
      'calendar date string YYYY-MM-DD',
      value,
      `[llm-schema-validator] Field "${path}" must be a calendar date in YYYY-MM-DD form`,
    ),
  ];
}

function validateStringFormat(
  value: string,
  format: NonNullable<SimpleFieldSchema['format']>,
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

const patternRegexCache = new Map<string, RegExp | null>();

function compilePattern(source: string): RegExp | null {
  const hit = patternRegexCache.get(source);
  if (hit !== undefined) return hit;
  try {
    const r = new RegExp(source);
    patternRegexCache.set(source, r);
    return r;
  } catch {
    patternRegexCache.set(source, null);
    return null;
  }
}

/** JSON `const`: value must be exactly `field.const` (after coercion). Uses `Object.is` for primitives. */
function validateConst(value: unknown, field: SimpleFieldSchema, path: string): ValidationError[] {
  if (field.const === undefined) return [];
  if (Object.is(value, field.const)) return [];
  return [
    issue(
      path,
      `literal ${JSON.stringify(field.const)}`,
      value,
      `[llm-schema-validator] Field "${path}" must be exactly ${JSON.stringify(field.const)}`,
    ),
  ];
}

function validateAllowedEnum(value: unknown, field: SimpleFieldSchema, path: string): ValidationError[] {
  const allowed = field.enum;
  if (!allowed || allowed.length === 0) return [];
  const ok = allowed.some((v) => Object.is(v, value));
  if (ok) return [];
  return [
    issue(
      path,
      `one of: ${allowed.map((v) => JSON.stringify(v)).join(', ')}`,
      value,
      `[llm-schema-validator] Field "${path}" must be one of the allowed values`,
    ),
  ];
}

function validateNumberConstraints(value: number, field: SimpleFieldSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (field.integer === true && !Number.isInteger(value)) {
    errors.push(
      issue(path, 'integer', value, `[llm-schema-validator] Field "${path}" must be an integer`),
    );
  }
  if (
    typeof field.minimum === 'number' &&
    Number.isFinite(field.minimum) &&
    value < field.minimum
  ) {
    errors.push(
      issue(
        path,
        `number >= ${field.minimum}`,
        value,
        `[llm-schema-validator] Field "${path}" is below minimum ${field.minimum}`,
      ),
    );
  }
  if (
    typeof field.maximum === 'number' &&
    Number.isFinite(field.maximum) &&
    value > field.maximum
  ) {
    errors.push(
      issue(
        path,
        `number <= ${field.maximum}`,
        value,
        `[llm-schema-validator] Field "${path}" is above maximum ${field.maximum}`,
      ),
    );
  }
  return errors;
}

function validateStringConstraints(value: string, field: SimpleFieldSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const len = value.length;
  if (typeof field.minLength === 'number' && Number.isInteger(field.minLength) && field.minLength >= 0) {
    if (len < field.minLength) {
      errors.push(
        issue(
          path,
          `string length >= ${field.minLength}`,
          value,
          `[llm-schema-validator] Field "${path}" is shorter than minLength ${field.minLength}`,
        ),
      );
    }
  }
  if (typeof field.maxLength === 'number' && Number.isInteger(field.maxLength) && field.maxLength >= 0) {
    if (len > field.maxLength) {
      errors.push(
        issue(
          path,
          `string length <= ${field.maxLength}`,
          value,
          `[llm-schema-validator] Field "${path}" is longer than maxLength ${field.maxLength}`,
        ),
      );
    }
  }
  if (field.pattern !== undefined && field.pattern !== '') {
    const re = compilePattern(field.pattern);
    if (re === null) {
      errors.push(
        issue(
          path,
          'valid regular expression in schema',
          field.pattern,
          `[llm-schema-validator] Field "${path}" schema has an invalid pattern`,
        ),
      );
    } else if (!re.test(value)) {
      errors.push(
        issue(
          path,
          `string matching /${field.pattern}/`,
          value,
          `[llm-schema-validator] Field "${path}" does not match the required pattern`,
        ),
      );
    }
  }
  return errors;
}

/** Runs {@link FieldSchema.validate} when set; only after built-in checks reported no errors for this value. */
export function runCustomValidate(value: unknown, field: FieldSchema, path: string): ValidationError[] {
  const fn = field.validate;
  if (fn === undefined) return [];
  try {
    const msg = fn(value);
    if (msg === null || msg === undefined) return [];
    if (typeof msg !== 'string') {
      return [
        issue(
          path,
          '(custom validation)',
          value,
          `[llm-schema-validator] Field "${path}" custom validate must return string | null`,
        ),
      ];
    }
    const message =
      msg.length > 0
        ? msg.startsWith('[llm-schema-validator]')
          ? msg
          : `[llm-schema-validator] Field "${path}": ${msg}`
        : `[llm-schema-validator] Field "${path}" failed custom validation`;
    return [issue(path, '(custom validation)', value, message)];
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return [
      issue(
        path,
        '(custom validation)',
        value,
        `[llm-schema-validator] Field "${path}" custom validate threw: ${detail}`,
      ),
    ];
  }
}

function validateArrayBounds(arr: unknown[], field: SimpleFieldSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const n = arr.length;
  if (typeof field.minItems === 'number' && Number.isInteger(field.minItems) && field.minItems >= 0) {
    if (n < field.minItems) {
      errors.push(
        issue(
          path,
          `array length >= ${field.minItems}`,
          arr,
          `[llm-schema-validator] Field "${path}" must have at least ${field.minItems} item(s)`,
        ),
      );
    }
  }
  if (typeof field.maxItems === 'number' && Number.isInteger(field.maxItems) && field.maxItems >= 0) {
    if (n > field.maxItems) {
      errors.push(
        issue(
          path,
          `array length <= ${field.maxItems}`,
          arr,
          `[llm-schema-validator] Field "${path}" must have at most ${field.maxItems} item(s)`,
        ),
      );
    }
  }
  return errors;
}

function typeExpectedLabel(field: SimpleFieldSchema): string {
  if (field.const !== undefined) {
    return `literal ${JSON.stringify(field.const)}`;
  }
  if (field.type === 'string' && field.format) {
    return `string (format: ${field.format})`;
  }
  if (field.enum && field.enum.length > 0) {
    return `${field.type} (enum)`;
  }
  return field.type;
}

function validatePrimitiveItemType(
  item: unknown,
  itemType: NonNullable<SimpleFieldSchema['itemType']>,
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
  field: SimpleFieldSchema,
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

export function isUnionField(field: FieldSchema): field is UnionFieldSchema {
  return 'anyOf' in field && Array.isArray(field.anyOf) && field.anyOf.length > 0;
}

function branchSummaryLabel(branch: AnyOfBranchSchema): string {
  let s = branch.type;
  if (branch.const !== undefined) s += `=${JSON.stringify(branch.const)}`;
  if (branch.type === 'string' && branch.format) s += `:${branch.format}`;
  if (branch.enum && branch.enum.length > 0) s += ' (enum)';
  return s;
}

/** Merge a union branch with parent metadata for validation/coercion of that alternative. */
export function syntheticFieldFromUnionBranch(
  parent: UnionFieldSchema,
  branch: AnyOfBranchSchema,
): SimpleFieldSchema {
  const { anyOf: _anyOf, ...parentRest } = parent;
  return {
    ...parentRest,
    ...branch,
    type: branch.type,
    required: true,
  } as SimpleFieldSchema;
}

function validateAnyOf(value: unknown, field: UnionFieldSchema, path: string): ValidationError[] {
  if (value === null && field.nullable) return [];

  const branches = field.anyOf;
  if (!branches || branches.length === 0) {
    return [
      issue(
        path,
        'non-empty anyOf',
        value,
        '[llm-schema-validator] anyOf must list at least one branch',
      ),
    ];
  }

  for (const branch of branches) {
    const synthetic = syntheticFieldFromUnionBranch(field, branch);
    const errs = validateSimpleFieldTypeAndNested(value, synthetic, path);
    if (errs.length === 0) {
      if (field.validate) {
        return runCustomValidate(value, { validate: field.validate } as FieldSchema, path);
      }
      return [];
    }
  }

  const summary = branches.map((b) => branchSummaryLabel(b)).join(' | ');
  return [
    issue(
      path,
      `anyOf(${summary})`,
      value,
      `[llm-schema-validator] Field "${path}" must match one of the anyOf alternatives`,
    ),
  ];
}

/**
 * Validate `value` against `field` at `path`, including nested object/array rules.
 */
export function validateTypeAndNested(value: unknown, field: FieldSchema, path: string): ValidationError[] {
  if (isUnionField(field)) {
    return validateAnyOf(value, field, path);
  }
  return validateSimpleFieldTypeAndNested(value, field, path);
}

function validateSimpleFieldTypeAndNested(
  value: unknown,
  field: SimpleFieldSchema,
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
      errors.push(...validateConst(value, field, path));
      if (errors.length > 0) return errors;
      if (field.format) {
        errors.push(...validateStringFormat(value, field.format, path));
      }
      errors.push(...validateAllowedEnum(value, field, path));
      errors.push(...validateStringConstraints(value, field, path));
      if (errors.length === 0) {
        errors.push(...runCustomValidate(value, field, path));
      }
      return errors;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(issue(path, 'number', value, `[llm-schema-validator] Field "${path}" must be a number`));
        return errors;
      }
      errors.push(...validateConst(value, field, path));
      if (errors.length > 0) return errors;
      errors.push(...validateNumberConstraints(value, field, path));
      errors.push(...validateAllowedEnum(value, field, path));
      if (errors.length === 0) {
        errors.push(...runCustomValidate(value, field, path));
      }
      return errors;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push(issue(path, 'boolean', value, `[llm-schema-validator] Field "${path}" must be a boolean`));
        return errors;
      }
      errors.push(...validateConst(value, field, path));
      if (errors.length > 0) return errors;
      errors.push(...validateAllowedEnum(value, field, path));
      if (errors.length === 0) {
        errors.push(...runCustomValidate(value, field, path));
      }
      return errors;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(issue(path, 'array', value, `[llm-schema-validator] Field "${path}" must be an array`));
        return errors;
      }
      errors.push(...validateArrayBounds(value, field, path));
      errors.push(...validateArrayItems(value, field, path));
      if (errors.length === 0) {
        errors.push(...runCustomValidate(value, field, path));
      }
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
      if (errors.length === 0) {
        errors.push(...runCustomValidate(value, field, path));
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
      if (!hasKey) {
        errors.push(
          issue(
            path,
            'required (key must be present)',
            undefined,
            `[llm-schema-validator] Field "${path}" is required`,
          ),
        );
        continue;
      }
      if (value === null) {
        if (field.nullable) continue;
        errors.push(
          issue(
            path,
            'non-null value',
            value,
            `[llm-schema-validator] Field "${path}" cannot be null`,
          ),
        );
        continue;
      }
      if (value === undefined) {
        errors.push(
          issue(
            path,
            'required',
            value,
            `[llm-schema-validator] Field "${path}" is required`,
          ),
        );
        continue;
      }
    } else {
      if (!hasKey || value === undefined) {
        continue;
      }
      if (value === null) {
        if (field.nullable) continue;
        errors.push(
          issue(
            path,
            'non-null value',
            value,
            `[llm-schema-validator] Field "${path}" cannot be null`,
          ),
        );
        continue;
      }
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

/**
 * Validate a root JSON array against an array {@link FieldSchema} (`type: 'array'`).
 */
export function validateRootArray(
  data: unknown[],
  field: ArrayRootFieldSchema,
): ValidationError[] {
  if (!Array.isArray(data)) {
    throw new TypeError('[llm-schema-validator] validateRootArray: data must be an array');
  }
  const errors: ValidationError[] = [];
  errors.push(...validateArrayBounds(data, field, '(root)'));
  errors.push(...validateArrayItems(data, field, '(root)'));
  if (errors.length === 0) {
    errors.push(...runCustomValidate(data, field, '(root)'));
  }
  return errors;
}
