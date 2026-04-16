import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import type { FieldSchema, Schema, SimpleFieldSchema, UnionFieldSchema } from './types.js';

function isUnionField(field: FieldSchema): field is UnionFieldSchema {
  return 'anyOf' in field && Array.isArray(field.anyOf);
}

function mapFormat(format: SimpleFieldSchema['format']): string | undefined {
  switch (format) {
    case 'email':
      return 'email';
    case 'url':
      return 'uri';
    case 'date':
      return 'date';
    case 'datetime':
      return 'date-time';
    case 'time':
      return 'time';
    case 'uuid':
      return 'uuid';
    case 'ipv4':
      return 'ipv4';
    case 'ipv6':
      return 'ipv6';
    case 'hostname':
      return 'hostname';
    case 'phone':
      return undefined;
    default:
      return undefined;
  }
}

function simpleFieldToJsonSchema(field: SimpleFieldSchema): JSONSchema7Definition {
  const schema: JSONSchema7 = {};

  if (field.description) {
    schema.description = field.description;
  }

  if (field.examples && field.examples.length > 0) {
    schema.examples = [...field.examples];
  }

  if (field.default !== undefined) {
    schema.default = field.default as JSONSchema7['default'];
  }

  if (field.const !== undefined) {
    schema.const = field.const as JSONSchema7['const'];
  }

  if (field.enum && field.enum.length > 0) {
    schema.enum = [...field.enum] as JSONSchema7['enum'];
  }

  switch (field.type) {
    case 'string': {
      schema.type = 'string';
      const format = mapFormat(field.format);
      if (format) {
        schema.format = format;
      }
      if (field.format === 'phone') {
        schema.pattern = '^\\+[1-9]\\d{1,14}$';
      }
      if (field.minLength !== undefined) {
        schema.minLength = field.minLength;
      }
      if (field.maxLength !== undefined) {
        schema.maxLength = field.maxLength;
      }
      if (field.pattern !== undefined) {
        schema.pattern = field.pattern;
      }
      break;
    }
    case 'number': {
      schema.type = field.integer ? 'integer' : 'number';
      if (field.minimum !== undefined) {
        schema.minimum = field.minimum;
      }
      if (field.maximum !== undefined) {
        schema.maximum = field.maximum;
      }
      if (field.multipleOf !== undefined) {
        schema.multipleOf = field.multipleOf;
      }
      break;
    }
    case 'boolean': {
      schema.type = 'boolean';
      break;
    }
    case 'array': {
      schema.type = 'array';
      if (field.minItems !== undefined) {
        schema.minItems = field.minItems;
      }
      if (field.maxItems !== undefined) {
        schema.maxItems = field.maxItems;
      }
      if (field.uniqueItems) {
        schema.uniqueItems = true;
      }
      if (field.itemType) {
        if (field.itemType === 'object' && field.itemProperties) {
          schema.items = schemaToJsonSchema(field.itemProperties);
        } else {
          schema.items = { type: field.itemType === 'array' ? 'array' : field.itemType };
        }
      }
      break;
    }
    case 'object': {
      schema.type = 'object';
      if (field.properties) {
        const nested = schemaToJsonSchema(field.properties);
        schema.properties = nested.properties;
        if (nested.required && nested.required.length > 0) {
          schema.required = nested.required;
        }
      }
      break;
    }
  }

  if (field.nullable) {
    if (schema.type) {
      schema.type = [schema.type as string, 'null'] as unknown as JSONSchema7['type'];
    }
  }

  return schema;
}

function fieldToJsonSchema(field: FieldSchema): JSONSchema7Definition {
  if (isUnionField(field)) {
    const schema: JSONSchema7 = {
      anyOf: field.anyOf.map((branch) =>
        simpleFieldToJsonSchema({
          ...branch,
          required: true,
          nullable: false,
        } as SimpleFieldSchema),
      ),
    };

    if (field.description) {
      schema.description = field.description;
    }

    if (field.nullable) {
      (schema.anyOf as JSONSchema7Definition[]).push({ type: 'null' });
    }

    return schema;
  }

  return simpleFieldToJsonSchema(field);
}

function schemaToJsonSchema(schema: Schema): JSONSchema7 {
  const properties: Record<string, JSONSchema7Definition> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    properties[key] = fieldToJsonSchema(field);
    if (field.required) {
      required.push(key);
    }
  }

  const result: JSONSchema7 = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

/**
 * Convert a {@link Schema} to JSON Schema draft-07 format.
 * Useful for generating documentation, OpenAPI specs, or interoperability with other tools.
 *
 * @example
 * const jsonSchema = toJsonSchema(mySchema);
 * // Use with OpenAPI, documentation generators, etc.
 *
 * @remarks
 * - The `phone` format is converted to a regex pattern (E.164) since JSON Schema doesn't have a phone format.
 * - Custom `validate` functions are not exported (they cannot be serialized).
 * - The output is a valid JSON Schema draft-07 document.
 */
export function toJsonSchema(schema: Schema): JSONSchema7 {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...schemaToJsonSchema(schema),
  };
}
