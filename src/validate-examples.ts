import type { FieldSchema, Schema, SimpleFieldSchema } from './types.js';
import { isPatternSourceDisallowed } from './regex-pattern-guard.js';
import { isUnionField } from './validator.js';

/**
 * Result of validating examples against field constraints.
 */
export interface ExampleValidationResult {
  /** Whether all examples are valid. */
  valid: boolean;
  /** List of invalid examples with details. */
  errors: ExampleValidationError[];
}

/**
 * Details about an invalid example.
 */
export interface ExampleValidationError {
  /** The field path where the invalid example was found. */
  field: string;
  /** The invalid example value. */
  example: string;
  /** Why the example is invalid. */
  reason: string;
}

function validateExampleAgainstField(
  example: string,
  field: SimpleFieldSchema,
  path: string,
): ExampleValidationError | null {
  switch (field.type) {
    case 'string': {
      if (field.enum && field.enum.length > 0) {
        const ok = field.enum.some((v) => typeof v === 'string' && Object.is(v, example));
        if (!ok) {
          return {
            field: path,
            example,
            reason: `Example "${example}" is not in enum: [${field.enum.map((v) => JSON.stringify(v)).join(', ')}]`,
          };
        }
      }

      if (field.const !== undefined && !Object.is(example, field.const)) {
        return {
          field: path,
          example,
          reason: `Example "${example}" does not match const value: ${JSON.stringify(field.const)}`,
        };
      }

      if (typeof field.minLength === 'number' && example.length < field.minLength) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is shorter than minLength ${field.minLength}`,
        };
      }

      if (typeof field.maxLength === 'number' && example.length > field.maxLength) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is longer than maxLength ${field.maxLength}`,
        };
      }

      if (field.pattern) {
        if (isPatternSourceDisallowed(field.pattern)) {
          return {
            field: path,
            example,
            reason: `Pattern is not allowed (too long or nested-quantifier ReDoS risk): ${field.pattern.slice(0, 80)}${field.pattern.length > 80 ? '…' : ''}`,
          };
        }
        try {
          const regex = new RegExp(field.pattern);
          if (!regex.test(example)) {
            return {
              field: path,
              example,
              reason: `Example "${example}" does not match pattern /${field.pattern}/`,
            };
          }
        } catch {
          return {
            field: path,
            example,
            reason: `Invalid pattern in schema: ${field.pattern}`,
          };
        }
      }

      return null;
    }
    case 'number': {
      const trimmed = example.trim();
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is not a valid finite number`,
        };
      }

      if (field.const !== undefined && !Object.is(n, field.const)) {
        return {
          field: path,
          example,
          reason: `Example "${example}" does not match const value: ${JSON.stringify(field.const)}`,
        };
      }

      if (field.integer === true && !Number.isInteger(n)) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is not an integer`,
        };
      }

      if (typeof field.minimum === 'number' && Number.isFinite(field.minimum) && n < field.minimum) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is below minimum ${field.minimum}`,
        };
      }

      if (typeof field.maximum === 'number' && Number.isFinite(field.maximum) && n > field.maximum) {
        return {
          field: path,
          example,
          reason: `Example "${example}" is above maximum ${field.maximum}`,
        };
      }

      if (
        typeof field.multipleOf === 'number' &&
        Number.isFinite(field.multipleOf) &&
        field.multipleOf > 0
      ) {
        const quotient = n / field.multipleOf;
        const tolerance = 1e-10;
        if (Math.abs(quotient - Math.round(quotient)) >= tolerance) {
          return {
            field: path,
            example,
            reason: `Example "${example}" is not a multiple of ${field.multipleOf}`,
          };
        }
      }

      if (field.enum && field.enum.length > 0) {
        const ok = field.enum.some((v) => typeof v === 'number' && Object.is(v, n));
        if (!ok) {
          return {
            field: path,
            example,
            reason: `Example "${example}" is not in enum: [${field.enum.map((v) => JSON.stringify(v)).join(', ')}]`,
          };
        }
      }

      return null;
    }
    case 'boolean': {
      const t = example.trim().toLowerCase();
      if (t !== 'true' && t !== 'false') {
        return {
          field: path,
          example,
          reason: `Example "${example}" is not a valid boolean (use true or false)`,
        };
      }
      const b = t === 'true';

      if (field.const !== undefined && !Object.is(b, field.const)) {
        return {
          field: path,
          example,
          reason: `Example "${example}" does not match const value: ${JSON.stringify(field.const)}`,
        };
      }

      if (field.enum && field.enum.length > 0) {
        const ok = field.enum.some((v) => typeof v === 'boolean' && Object.is(v, b));
        if (!ok) {
          return {
            field: path,
            example,
            reason: `Example "${example}" is not in enum: [${field.enum.map((v) => JSON.stringify(v)).join(', ')}]`,
          };
        }
      }

      return null;
    }
    default:
      return null;
  }
}

function validateFieldExamples(
  field: FieldSchema,
  path: string,
  errors: ExampleValidationError[],
): void {
  if (!field.examples || field.examples.length === 0) {
    return;
  }

  if (isUnionField(field)) {
    for (const example of field.examples) {
      let validForAnyBranch = false;
      for (const branch of field.anyOf) {
        const syntheticField: SimpleFieldSchema = {
          ...branch,
          required: true,
          examples: [example],
        };
        const error = validateExampleAgainstField(example, syntheticField, path);
        if (!error) {
          validForAnyBranch = true;
          break;
        }
      }
      if (!validForAnyBranch) {
        errors.push({
          field: path,
          example,
          reason: `Example "${example}" does not match any anyOf branch`,
        });
      }
    }
    return;
  }

  const simpleField = field as SimpleFieldSchema;
  for (const example of field.examples) {
    const error = validateExampleAgainstField(example, simpleField, path);
    if (error) {
      errors.push(error);
    }
  }

  if (simpleField.type === 'object' && simpleField.properties) {
    validateSchemaExamplesInternal(simpleField.properties, path, errors);
  }

  if (simpleField.type === 'array' && simpleField.itemType === 'object' && simpleField.itemProperties) {
    validateSchemaExamplesInternal(simpleField.itemProperties, `${path}[]`, errors);
  }
}

function validateSchemaExamplesInternal(
  schema: Schema,
  prefix: string,
  errors: ExampleValidationError[],
): void {
  for (const [key, field] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    validateFieldExamples(field, path, errors);
  }
}

/**
 * Validate that all examples in a schema satisfy their field constraints.
 * This catches documentation drift where examples become stale or invalid.
 *
 * @example
 * const result = validateExamples(schema);
 * if (!result.valid) {
 *   console.error('Invalid examples:', result.errors);
 * }
 *
 * @remarks
 * This validates:
 * - String examples: `enum`, `const`, `minLength`/`maxLength`, `pattern`
 * - Number examples: parse as finite number; `enum`, `const`, `integer`, `minimum`/`maximum`, `multipleOf`
 * - Boolean examples: `true`/`false` (case-insensitive); `enum`, `const`
 * - Union field examples match at least one branch
 */
export function validateExamples(schema: Schema): ExampleValidationResult {
  const errors: ExampleValidationError[] = [];
  validateSchemaExamplesInternal(schema, '', errors);
  return {
    valid: errors.length === 0,
    errors,
  };
}
