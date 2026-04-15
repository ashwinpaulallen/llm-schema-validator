import {
  MAX_DEFAULT_VALUE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_EXAMPLES_PROMPT_LENGTH,
  MAX_PREVIOUS_RESPONSE_LENGTH,
} from './constants.js';
import { truncate } from './utils.js';
import type { ArrayRootFieldSchema, FieldSchema, Schema, SimpleFieldSchema, ValidationError } from './types.js';
import { isUnionField, syntheticFieldFromUnionBranch } from './validator.js';

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

  if (isUnionField(field)) {
    const parts: string[] = [`${pad}${name}: anyOf (${req})`];
    const tail: string[] = [];
    if (field.nullable) tail.push('nullable');
    if (field.description) {
      tail.push(`"${trunc(field.description, MAX_DESCRIPTION_LENGTH)}"`);
    }
    if (field.validate) tail.push('custom validate');
    const def = fmtDefault(field.default);
    if (def !== undefined) tail.push(`default=${def}`);
    if (tail.length) parts[0] += ` · ${tail.join(' · ')}`;
    for (let i = 0; i < field.anyOf.length; i++) {
      const b = field.anyOf[i]!;
      const sub = syntheticFieldFromUnionBranch(field, b);
      parts.push(...describeField(`∙[${i}]`, sub, depth + 1));
    }
    return parts;
  }

  const sf = field as SimpleFieldSchema;
  const parts: string[] = [`${pad}${name}: ${sf.type} (${req})`];
  const tail: string[] = [];

  if (sf.format) tail.push(`fmt=${sf.format}`);
  if (sf.const !== undefined) tail.push(`const=${JSON.stringify(sf.const)}`);
  if (sf.nullable) tail.push('nullable');
  if (sf.enum && sf.enum.length > 0) {
    tail.push(`enum=${sf.enum.map((v) => JSON.stringify(v)).join('|')}`);
  }
  if (sf.examples && sf.examples.length > 0) {
    const ex = sf.examples.map((v) => JSON.stringify(v)).join(', ');
    tail.push(`e.g. ${trunc(ex, MAX_EXAMPLES_PROMPT_LENGTH)}`);
  }
  if (sf.type === 'number') {
    if (sf.integer) tail.push('integer');
    if (sf.minimum !== undefined) tail.push(`min=${sf.minimum}`);
    if (sf.maximum !== undefined) tail.push(`max=${sf.maximum}`);
  }
  if (sf.type === 'string') {
    if (sf.minLength !== undefined) tail.push(`minLen=${sf.minLength}`);
    if (sf.maxLength !== undefined) tail.push(`maxLen=${sf.maxLength}`);
    if (sf.pattern) tail.push(`pattern=${trunc(sf.pattern, 40)}`);
  }
  if (sf.type === 'array') {
    if (sf.minItems !== undefined) tail.push(`minItems=${sf.minItems}`);
    if (sf.maxItems !== undefined) tail.push(`maxItems=${sf.maxItems}`);
  }
  if (sf.description) {
    tail.push(`"${trunc(sf.description, MAX_DESCRIPTION_LENGTH)}"`);
  }
  if (sf.validate) {
    tail.push('custom validate');
  }
  const def = fmtDefault(sf.default);
  if (def !== undefined) tail.push(`default=${def}`);

  if (tail.length) parts[0] += ` · ${tail.join(' · ')}`;

  if (sf.type === 'object' && sf.properties && Object.keys(sf.properties).length > 0) {
    for (const [k, v] of Object.entries(sf.properties)) {
      parts.push(...describeField(k, v, depth + 1));
    }
  }

  if (sf.type === 'array') {
    const ip = sf.itemProperties;
    const it = sf.itemType;
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

function describeArrayRootOutline(field: ArrayRootFieldSchema): string {
  return describeField('[root array]', field, 0).join('\n');
}

/** What the model must emit at the top level: a JSON object or a JSON array. */
export type RootPromptShape =
  | { kind: 'object'; schema: Schema }
  | { kind: 'array'; arraySchema: ArrayRootFieldSchema };

function describeRootShape(shape: RootPromptShape): string {
  return shape.kind === 'object'
    ? describeSchemaShape(shape.schema)
    : describeArrayRootOutline(shape.arraySchema);
}

/**
 * First-turn prompt: task + strict JSON-only rule + compact schema outline (types, req/opt, descriptions).
 */
export function buildInitialPrompt(userPrompt: string, shape: RootPromptShape): string {
  const outline = describeRootShape(shape);
  const jsonKind = shape.kind === 'object' ? 'object' : 'array';
  return `${userPrompt.trim()}

Output: ONLY one JSON ${jsonKind} (valid JSON). No markdown, no \`\`\`, no explanation before or after.

Match this shape:
${outline}`;
}

/**
 * Retry prompt: original task + verbatim previous reply + numbered fixes from validation errors.
 */
export function buildRetryPrompt(
  userPrompt: string,
  shape: RootPromptShape,
  previousResponse: string,
  errors: ValidationError[],
): string {
  const outline = describeRootShape(shape);
  const prev = trunc(previousResponse, MAX_PREVIOUS_RESPONSE_LENGTH);
  const emptyHint =
    shape.kind === 'object'
      ? '(no structured errors — ensure the reply is a single JSON object.)'
      : '(no structured errors — ensure the reply is a single JSON array.)';
  const fixes = errors.length
    ? errors
        .map(
          (e, i) =>
            `${i + 1}. ${e.field}: ${e.message} (want ${e.expected}; got ${e.received})`,
        )
        .join('\n')
    : emptyHint;

  const jsonKind = shape.kind === 'object' ? 'object' : 'array';
  return `${userPrompt.trim()}

Previous reply (invalid):
${prev}

Correct:
${fixes}

Output: ONLY one JSON ${jsonKind}. No markdown or extra text.

Match:
${outline}`;
}
