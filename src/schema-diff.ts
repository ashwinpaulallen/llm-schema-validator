import type { FieldSchema, Schema, SimpleFieldSchema, UnionFieldSchema } from './types.js';

/**
 * Describes a change to a field in a schema.
 */
export interface FieldChange {
  /** The field path (e.g., 'user.address.city' for nested fields). */
  path: string;
  /** The type of change. */
  type: 'added' | 'removed' | 'changed';
  /** The old field schema (undefined for 'added'). */
  oldField?: FieldSchema;
  /** The new field schema (undefined for 'removed'). */
  newField?: FieldSchema;
  /** Human-readable description of the change. */
  description: string;
}

/**
 * Result of comparing two schemas.
 */
export interface SchemaDiff {
  /** Fields that were added in the new schema. */
  added: FieldChange[];
  /** Fields that were removed from the old schema. */
  removed: FieldChange[];
  /** Fields that changed between schemas. */
  changed: FieldChange[];
  /** Whether the schemas are identical. */
  isIdentical: boolean;
  /** Whether the new schema is backward compatible (no removed required fields, no type changes). */
  isBackwardCompatible: boolean;
}

function isUnionField(field: FieldSchema): field is UnionFieldSchema {
  return 'anyOf' in field && Array.isArray(field.anyOf);
}

function getFieldType(field: FieldSchema): string {
  if (isUnionField(field)) {
    return `anyOf(${field.anyOf.map((b) => b.type).join(' | ')})`;
  }
  return (field as SimpleFieldSchema).type;
}

/**
 * Deep equality for schema field objects: object key order is ignored at every level;
 * array element order is preserved (e.g. `anyOf` branch order matters).
 */
function deepEqualFieldSchema(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (!deepEqualFieldSchema(aa[i], bb[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).sort();
  const bKeys = Object.keys(bo).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (!deepEqualFieldSchema(ao[k], bo[k])) return false;
  }
  return true;
}

function fieldsAreEqual(a: FieldSchema, b: FieldSchema): boolean {
  return deepEqualFieldSchema(a, b);
}

function describeFieldChange(path: string, oldField: FieldSchema, newField: FieldSchema): string {
  const changes: string[] = [];

  const oldType = getFieldType(oldField);
  const newType = getFieldType(newField);
  if (oldType !== newType) {
    changes.push(`type changed from '${oldType}' to '${newType}'`);
  }

  if (oldField.required !== newField.required) {
    changes.push(newField.required ? 'became required' : 'became optional');
  }

  if (oldField.nullable !== newField.nullable) {
    changes.push(newField.nullable ? 'became nullable' : 'became non-nullable');
  }

  if (!isUnionField(oldField) && !isUnionField(newField)) {
    const oldSimple = oldField as SimpleFieldSchema;
    const newSimple = newField as SimpleFieldSchema;

    if (oldSimple.format !== newSimple.format) {
      changes.push(`format changed from '${oldSimple.format ?? 'none'}' to '${newSimple.format ?? 'none'}'`);
    }

    if (JSON.stringify(oldSimple.enum) !== JSON.stringify(newSimple.enum)) {
      changes.push('enum values changed');
    }
  }

  return changes.length > 0 ? changes.join('; ') : 'field definition changed';
}

function collectFieldPaths(
  schema: Schema,
  prefix: string = '',
): Map<string, FieldSchema> {
  const result = new Map<string, FieldSchema>();

  for (const [key, field] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.set(path, field);

    if (!isUnionField(field) && (field as SimpleFieldSchema).type === 'object') {
      const props = (field as SimpleFieldSchema).properties;
      if (props) {
        for (const [nestedPath, nestedField] of collectFieldPaths(props, path)) {
          result.set(nestedPath, nestedField);
        }
      }
    }
  }

  return result;
}

/**
 * Compare two schemas and return a detailed diff describing all changes.
 *
 * @example
 * const diff = diffSchemas(oldSchema, newSchema);
 * console.log(diff.added);   // Fields added in newSchema
 * console.log(diff.removed); // Fields removed from oldSchema
 * console.log(diff.changed); // Fields that changed
 */
export function diffSchemas(oldSchema: Schema, newSchema: Schema): SchemaDiff {
  const oldFields = collectFieldPaths(oldSchema);
  const newFields = collectFieldPaths(newSchema);

  const added: FieldChange[] = [];
  const removed: FieldChange[] = [];
  const changed: FieldChange[] = [];

  for (const [path, newField] of newFields) {
    const oldField = oldFields.get(path);
    if (!oldField) {
      added.push({
        path,
        type: 'added',
        newField,
        description: `Added ${newField.required ? 'required' : 'optional'} field '${path}' of type '${getFieldType(newField)}'`,
      });
    } else if (!fieldsAreEqual(oldField, newField)) {
      changed.push({
        path,
        type: 'changed',
        oldField,
        newField,
        description: describeFieldChange(path, oldField, newField),
      });
    }
  }

  for (const [path, oldField] of oldFields) {
    if (!newFields.has(path)) {
      removed.push({
        path,
        type: 'removed',
        oldField,
        description: `Removed ${oldField.required ? 'required' : 'optional'} field '${path}' of type '${getFieldType(oldField)}'`,
      });
    }
  }

  const isIdentical = added.length === 0 && removed.length === 0 && changed.length === 0;

  const hasBreakingChanges =
    removed.some((r) => r.oldField?.required) ||
    changed.some((c) => {
      if (!c.oldField || !c.newField) return false;
      const oldType = getFieldType(c.oldField);
      const newType = getFieldType(c.newField);
      if (oldType !== newType) return true;
      if (!c.oldField.required && c.newField.required) return true;
      if (c.oldField.nullable && !c.newField.nullable) return true;
      return false;
    });

  return {
    added,
    removed,
    changed,
    isIdentical,
    isBackwardCompatible: !hasBreakingChanges,
  };
}

/**
 * Generate a human-readable migration guide from a schema diff.
 */
export function generateMigrationGuide(diff: SchemaDiff): string {
  if (diff.isIdentical) {
    return 'No changes detected between schemas.';
  }

  const lines: string[] = ['# Schema Migration Guide', ''];

  if (!diff.isBackwardCompatible) {
    lines.push('⚠️ **BREAKING CHANGES DETECTED** - This migration is not backward compatible.', '');
  }

  if (diff.removed.length > 0) {
    lines.push('## Removed Fields', '');
    for (const change of diff.removed) {
      const severity = change.oldField?.required ? '🔴 BREAKING' : '🟡 Non-breaking';
      lines.push(`- ${severity}: ${change.description}`);
    }
    lines.push('');
  }

  if (diff.changed.length > 0) {
    lines.push('## Changed Fields', '');
    for (const change of diff.changed) {
      lines.push(`- \`${change.path}\`: ${change.description}`);
    }
    lines.push('');
  }

  if (diff.added.length > 0) {
    lines.push('## Added Fields', '');
    for (const change of diff.added) {
      const note = change.newField?.required ? '(required - ensure data provides this field)' : '(optional)';
      lines.push(`- \`${change.path}\`: ${change.description} ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
