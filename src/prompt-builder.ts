import {
  MAX_DEFAULT_VALUE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PREVIOUS_RESPONSE_LENGTH,
} from './constants.js';
import { truncate } from './utils.js';
import type { FieldSchema, Schema, ValidationError } from './types.js';

function trunc(s: string, max: number): string {
  return truncate(s, max);
}

function fmtDefault(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return 'null';
  if (typeof v === 'object') return undefined;
  const s = String(v);
  return s.length > MAX_DEFAULT_VALUE_LENGTH ? `${s.slice(0, MAX_DEFAULT_VALUE_LENGTH)}…` : s;
}

/**
 * Compact one-line summary of a field, then nested lines for object/array children.
 */
function describeField(name: string, field: FieldSchema, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const req = field.required ? 'req' : 'opt';
  const parts: string[] = [`${pad}${name}: ${field.type} (${req})`];
  const tail: string[] = [];

  if (field.format) tail.push(`fmt=${field.format}`);
  if (field.nullable) tail.push('nullable');
  if (field.enum && field.enum.length > 0) {
    tail.push(`enum=${field.enum.map((v) => JSON.stringify(v)).join('|')}`);
  }
  if (field.type === 'number') {
    if (field.integer) tail.push('integer');
    if (field.minimum !== undefined) tail.push(`min=${field.minimum}`);
    if (field.maximum !== undefined) tail.push(`max=${field.maximum}`);
  }
  if (field.type === 'string') {
    if (field.minLength !== undefined) tail.push(`minLen=${field.minLength}`);
    if (field.maxLength !== undefined) tail.push(`maxLen=${field.maxLength}`);
    if (field.pattern) tail.push(`pattern=${trunc(field.pattern, 40)}`);
  }
  if (field.type === 'array') {
    if (field.minItems !== undefined) tail.push(`minItems=${field.minItems}`);
    if (field.maxItems !== undefined) tail.push(`maxItems=${field.maxItems}`);
  }
  if (field.description) {
    tail.push(`"${trunc(field.description, MAX_DESCRIPTION_LENGTH)}"`);
  }
  const def = fmtDefault(field.default);
  if (def !== undefined) tail.push(`default=${def}`);

  if (tail.length) parts[0] += ` · ${tail.join(' · ')}`;

  if (field.type === 'object' && field.properties && Object.keys(field.properties).length > 0) {
    for (const [k, v] of Object.entries(field.properties)) {
      parts.push(...describeField(k, v, depth + 1));
    }
  }

  if (field.type === 'array') {
    const ip = field.itemProperties;
    const it = field.itemType;
    if (it) {
      parts.push(`${pad}  └ items: ${it}`);
      if (it === 'object' && ip && Object.keys(ip).length > 0) {
        for (const [k, v] of Object.entries(ip)) {
          parts.push(...describeField(k, v, depth + 2));
        }
      }
    }
  }

  return parts;
}

/** Human-readable schema outline (compact) for prompts. */
function describeSchemaShape(schema: Schema): string {
  const keys = Object.keys(schema);
  if (keys.length === 0) return '(empty object {})';
  const lines: string[] = [];
  for (const k of keys) {
    lines.push(...describeField(k, schema[k], 0));
  }
  return lines.join('\n');
}

/**
 * First-turn prompt: task + strict JSON-only rule + compact schema outline (types, req/opt, descriptions).
 */
export function buildInitialPrompt(userPrompt: string, schema: Schema): string {
  const shape = describeSchemaShape(schema);
  return `${userPrompt.trim()}

Output: ONLY one JSON object (valid JSON). No markdown, no \`\`\`, no explanation before or after.

Match this shape:
${shape}`;
}

/**
 * Retry prompt: original task + verbatim previous reply + numbered fixes from validation errors.
 */
export function buildRetryPrompt(
  userPrompt: string,
  schema: Schema,
  previousResponse: string,
  errors: ValidationError[],
): string {
  const shape = describeSchemaShape(schema);
  const prev = trunc(previousResponse, MAX_PREVIOUS_RESPONSE_LENGTH);
  const fixes = errors.length
    ? errors
        .map(
          (e, i) =>
            `${i + 1}. ${e.field}: ${e.message} (want ${e.expected}; got ${e.received})`,
        )
        .join('\n')
    : '(no structured errors — ensure the reply is a single JSON object.)';

  return `${userPrompt.trim()}

Previous reply (invalid):
${prev}

Correct:
${fixes}

Output: ONLY one JSON object. No markdown or extra text.

Match:
${shape}`;
}
