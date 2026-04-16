import type { FieldSchema, Schema, SimpleFieldSchema, UnionFieldSchema } from './types.js';

function isUnionField(field: FieldSchema): field is UnionFieldSchema {
  return 'anyOf' in field && Array.isArray(field.anyOf);
}

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
  if (field.type !== 'string') {
    return null;
  }

  if (field.enum && field.enum.length > 0) {
    if (!field.enum.includes(example)) {
      return {
        field: path,
        example,
        reason: `Example "${example}" is not in enum: [${field.enum.map((v) => JSON.stringify(v)).join(', ')}]`,
      };
    }
  }

  if (field.const !== undefined && example !== field.const) {
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
 * - String examples match `enum` values (if defined)
 * - String examples match `const` value (if defined)
 * - String examples satisfy `minLength`/`maxLength`
 * - String examples match `pattern` regex
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
