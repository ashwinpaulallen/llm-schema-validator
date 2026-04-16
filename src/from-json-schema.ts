import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from 'json-schema';

import type {
  AnyOfBranchSchema,
  FieldSchema,
  Schema,
  SimpleFieldSchema,
  UnionFieldSchema,
} from './types.js';

export class JsonSchemaAdapterError extends Error {
  constructor(message: string) {
    super(`[llm-schema-validator] fromJsonSchema: ${message}`);
    this.name = 'JsonSchemaAdapterError';
  }
}

type FieldBody = Omit<SimpleFieldSchema, 'required' | 'nullable' | 'default' | 'validate' | 'examples'>;

type RootDoc = JSONSchema7 & { definitions?: Record<string, JSONSchema7Definition> };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function decodePointerToken(s: string): string {
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Resolve `#/definitions/Name` or `#/$defs/Name` (draft-07) against the root document. */
function resolveLocalRef(ref: string, root: RootDoc): JSONSchema7 {
  if (!ref.startsWith('#')) {
    throw new JsonSchemaAdapterError(`only same-document refs are supported (got ${JSON.stringify(ref)})`);
  }
  const parts = ref.slice(1).split('/').filter(Boolean);
  let cur: unknown = root;
  for (const raw of parts) {
    const key = decodePointerToken(raw);
    if (!isObj(cur) || !(key in cur)) {
      throw new JsonSchemaAdapterError(`unresolved $ref ${ref}`);
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === true) {
    return {};
  }
  if (cur === false) {
    throw new JsonSchemaAdapterError(`$ref ${ref} points to false (unsatisfiable schema)`);
  }
  if (!isObj(cur)) {
    throw new JsonSchemaAdapterError(`$ref ${ref} did not resolve to an object schema`);
  }
  return cur as JSONSchema7;
}

function parseTypeKeyword(
  type: JSONSchema7['type'],
): { primitives: JSONSchema7TypeName[]; nullable: boolean } {
  if (type === undefined) {
    return { primitives: [], nullable: false };
  }
  if (typeof type === 'string') {
    if (type === 'null') return { primitives: [], nullable: true };
    return { primitives: [type], nullable: false };
  }
  if (!Array.isArray(type)) {
    return { primitives: [], nullable: false };
  }
  const nullable = type.includes('null');
  const primitives = type.filter((t): t is JSONSchema7TypeName => t !== 'null') as JSONSchema7TypeName[];
  return { primitives, nullable };
}

function mergeDescription(node: JSONSchema7): string | undefined {
  const t = node.title;
  const d = node.description;
  if (t && d) return `${t}: ${d}`;
  if (t) return t;
  if (d) return d;
  return undefined;
}

function attachNumberExclusives(node: JSONSchema7, base: SimpleFieldSchema): void {
  const checks: ((v: unknown) => string | null)[] = [];
  if (typeof node.exclusiveMinimum === 'number') {
    const em = node.exclusiveMinimum;
    checks.push((v) => (typeof v === 'number' && v > em ? null : `must be strictly greater than ${em}`));
  }
  if (typeof node.exclusiveMaximum === 'number') {
    const ex = node.exclusiveMaximum;
    checks.push((v) => (typeof v === 'number' && v < ex ? null : `must be strictly less than ${ex}`));
  }
  if (checks.length === 0) return;
  const prev = base.validate;
  base.validate = (value: unknown) => {
    for (const c of checks) {
      const msg = c(value);
      if (msg !== null) return msg;
    }
    return prev ? prev(value) : null;
  };
}

function mapStringFormat(fmt: string | undefined): SimpleFieldSchema['format'] | undefined {
  if (!fmt) return undefined;
  if (fmt === 'email') return 'email';
  if (fmt === 'uri' || fmt === 'uri-reference') return 'url';
  if (fmt === 'date') return 'date';
  return undefined;
}

function jsonSchemaToFieldBody(
  node: JSONSchema7,
  root: RootDoc,
  depth: number,
): FieldBody | { anyOf: readonly AnyOfBranchSchema[] } {
  if (depth > 64) {
    throw new JsonSchemaAdapterError('schema nesting is too deep');
  }

  let n: JSONSchema7 = node;
  if (node.$ref) {
    n = resolveLocalRef(node.$ref, root);
  }

  if (n.if !== undefined || n.then !== undefined || n.else !== undefined) {
    throw new JsonSchemaAdapterError('if/then/else is not supported');
  }
  if (n.not !== undefined) {
    throw new JsonSchemaAdapterError('not is not supported');
  }
  if (Array.isArray(n.allOf) && n.allOf.length > 0) {
    throw new JsonSchemaAdapterError('allOf is not supported — use a single schema or anyOf/oneOf');
  }

  const branches = n.anyOf ?? n.oneOf;
  if (Array.isArray(branches) && branches.length > 0) {
    const anyOf = branches.map((def, i) => {
      const sub = unwrapDefinition(def, root);
      if (!isObj(sub)) {
        throw new JsonSchemaAdapterError(`anyOf/oneOf branch ${i} must be an object`);
      }
      return jsonSchemaToAnyOfBranch(sub as JSONSchema7, root, depth + 1);
    });
    return { anyOf };
  }

  if (n.const !== undefined) {
    const c = n.const;
    if (c === null) {
      throw new JsonSchemaAdapterError('const null is not supported — use type: ["string","null"]');
    }
    if (typeof c === 'string') return { type: 'string', const: c };
    if (typeof c === 'number') return { type: 'number', const: c };
    if (typeof c === 'boolean') return { type: 'boolean', const: c };
    throw new JsonSchemaAdapterError('const must be string, number, or boolean');
  }

  if (Array.isArray(n.enum) && n.enum.length > 0) {
    const vals = n.enum.filter((x) => typeof x === 'string' || typeof x === 'number') as (string | number)[];
    if (vals.length !== n.enum.length) {
      throw new JsonSchemaAdapterError('enum must contain only string or number values');
    }
    const allStr = vals.every((x) => typeof x === 'string');
    const allNum = vals.every((x) => typeof x === 'number');
    const { primitives } = parseTypeKeyword(n.type);
    const t = primitives[0];
    if (allStr && (t === undefined || t === 'string')) {
      return { type: 'string', enum: vals as string[] };
    }
    if (allNum && (t === undefined || t === 'number' || t === 'integer')) {
      return { type: 'number', enum: vals as number[] };
    }
    throw new JsonSchemaAdapterError('enum with mixed types is not supported');
  }

  const { primitives } = parseTypeKeyword(n.type);

  if (primitives.length > 1) {
    const anyOf: AnyOfBranchSchema[] = primitives.map((p) => {
      const fake: JSONSchema7 = { ...n, type: p };
      const body = jsonSchemaToFieldBody(fake, root, depth + 1);
      if ('anyOf' in body) {
        throw new JsonSchemaAdapterError('nested anyOf from multi-type is not supported');
      }
      return body as AnyOfBranchSchema;
    });
    return { anyOf };
  }

  const single = primitives[0];

  if (single === 'string' || (!single && n.pattern !== undefined)) {
    const body: FieldBody = { type: 'string' };
    if (typeof n.minLength === 'number') body.minLength = n.minLength;
    if (typeof n.maxLength === 'number') body.maxLength = n.maxLength;
    if (typeof n.pattern === 'string') body.pattern = n.pattern;
    const mf = mapStringFormat(n.format);
    if (mf) body.format = mf;
    return body;
  }

  if (single === 'number' || single === 'integer') {
    const body: FieldBody = { type: 'number' };
    if (typeof n.minimum === 'number') body.minimum = n.minimum;
    if (typeof n.maximum === 'number') body.maximum = n.maximum;
    if (single === 'integer') {
      body.integer = true;
    }
    return body;
  }

  if (single === 'boolean') {
    return { type: 'boolean' };
  }

  if (single === 'object' || (!single && n.properties)) {
    if (!n.properties || !isObj(n.properties)) {
      throw new JsonSchemaAdapterError('object type requires properties');
    }
    const req = new Set(
      Array.isArray(n.required) ? n.required.filter((x): x is string => typeof x === 'string') : [],
    );
    const props: Schema = {};
    for (const key of Object.keys(n.properties)) {
      const def = n.properties[key];
      props[key] = convertProperty(def, key, req.has(key), root, depth + 1);
    }
    return { type: 'object', properties: props };
  }

  if (single === 'array' || (!single && n.items !== undefined && !n.properties)) {
    if (n.items === undefined) {
      throw new JsonSchemaAdapterError('array type requires items');
    }
    if (Array.isArray(n.items)) {
      throw new JsonSchemaAdapterError('tuple items (items as array of schemas) is not supported');
    }
    const it = unwrapDefinition(n.items, root);
    if (!isObj(it)) {
      throw new JsonSchemaAdapterError('items must resolve to an object schema');
    }
    const items = it as JSONSchema7;
    const itTypes = parseTypeKeyword(items.type).primitives;
    const itType = itTypes[0];
    const base: FieldBody = { type: 'array' };
    if (typeof n.minItems === 'number') base.minItems = n.minItems;
    if (typeof n.maxItems === 'number') base.maxItems = n.maxItems;

    if (itType === 'object' || items.properties) {
      if (!items.properties || !isObj(items.properties)) {
        throw new JsonSchemaAdapterError('array of objects requires items.properties');
      }
      const req = new Set(
        Array.isArray(items.required)
          ? items.required.filter((x): x is string => typeof x === 'string')
          : [],
      );
      const itemProps: Schema = {};
      for (const key of Object.keys(items.properties)) {
        const def = items.properties[key];
        itemProps[key] = convertProperty(def, key, req.has(key), root, depth + 1);
      }
      base.itemType = 'object';
      base.itemProperties = itemProps;
      return base;
    }
    if (itType === 'string') {
      base.itemType = 'string';
      return base;
    }
    if (itType === 'number' || itType === 'integer') {
      base.itemType = 'number';
      return base;
    }
    if (itType === 'boolean') {
      base.itemType = 'boolean';
      return base;
    }
    if (itType === 'array') {
      base.itemType = 'array';
      return base;
    }
    throw new JsonSchemaAdapterError(`unsupported array items type: ${String(itType)}`);
  }

  throw new JsonSchemaAdapterError(
    `unsupported or incomplete schema (type: ${String(n.type)}, keys: ${Object.keys(n).join(', ')})`,
  );
}

function jsonSchemaToAnyOfBranch(node: JSONSchema7, root: RootDoc, depth: number): AnyOfBranchSchema {
  const body = jsonSchemaToFieldBody(node, root, depth);
  if ('anyOf' in body) {
    throw new JsonSchemaAdapterError('nested anyOf inside anyOf is not supported');
  }
  return body as AnyOfBranchSchema;
}

function unwrapDefinition(def: JSONSchema7Definition, root: RootDoc): JSONSchema7 | boolean {
  if (def === true) return {};
  if (def === false) {
    throw new JsonSchemaAdapterError('schema false is not supported here');
  }
  if (def.$ref) {
    return resolveLocalRef(def.$ref, root);
  }
  return def;
}

function convertProperty(
  def: JSONSchema7Definition,
  _key: string,
  required: boolean,
  root: RootDoc,
  depth: number,
): FieldSchema {
  const node = unwrapDefinition(def, root);
  if (typeof node === 'boolean') {
    if (node === false) {
      throw new JsonSchemaAdapterError('property schema `false` is not supported');
    }
    return { type: 'string', required };
  }

  if (node.if !== undefined || node.allOf !== undefined) {
    throw new JsonSchemaAdapterError('unsupported keyword on property (if/then/else/allOf)');
  }

  const description = mergeDescription(node);
  const defaultValue = node.default;

  const body = jsonSchemaToFieldBody(node, root, depth);

  if ('anyOf' in body) {
    const u: UnionFieldSchema = {
      required,
      nullable: parseTypeKeyword(node.type).nullable || undefined,
      default: defaultValue,
      description,
      anyOf: body.anyOf,
    };
    return u;
  }

  const simpleBody = body as FieldBody;
  const simple: SimpleFieldSchema = {
    ...simpleBody,
    required,
    nullable: parseTypeKeyword(node.type).nullable || undefined,
    default: defaultValue,
    description,
  };

  if (simple.type === 'number') {
    attachNumberExclusives(node, simple);
  }

  return simple;
}

/**
 * Convert a **JSON Schema draft-07** object schema (`type: "object"` with `properties`) into a {@link Schema}
 * for use with {@link query}, {@link validate}, etc.
 *
 * Supported: `properties`, `required`, string/number/integer/boolean/object/array types, `enum`, `const`,
 * `anyOf` / `oneOf`, `format` (email, uri, date), string length, `pattern`, number min/max,
 * `exclusiveMinimum` / `exclusiveMaximum` (as extra validation), arrays of primitives or objects,
 * and same-document `$ref` to `#/definitions/...` or `#/$defs/...`.
 *
 * Not supported: `allOf`, `not`, `if`/`then`/`else`, tuple `items`, external `$ref`, `patternProperties`, etc.
 *
 * @remarks
 * For full TypeScript type inference on the `input` parameter, install `@types/json-schema` as a dev or
 * peer dependency: `npm install -D @types/json-schema`. Without it, the parameter type falls back to `unknown`.
 */
export function fromJsonSchema(input: JSONSchema7): Schema {
  if (!isObj(input)) {
    throw new JsonSchemaAdapterError('root schema must be a non-null object');
  }
  const schema = input as RootDoc;

  if (schema.$ref) {
    throw new JsonSchemaAdapterError('root $ref is not supported');
  }

  const t = parseTypeKeyword(schema.type as JSONSchema7['type']).primitives;
  const rootType = t[0] ?? (schema.properties ? 'object' : undefined);
  if (rootType !== 'object') {
    throw new JsonSchemaAdapterError('root schema must have type: "object" (or properties implying object)');
  }
  if (!schema.properties || !isObj(schema.properties)) {
    throw new JsonSchemaAdapterError('object schema must include a properties object');
  }

  const req = new Set(
    Array.isArray(schema.required) ? schema.required.filter((x): x is string => typeof x === 'string') : [],
  );

  const out: Schema = {};
  for (const key of Object.keys(schema.properties)) {
    out[key] = convertProperty(schema.properties[key]!, key, req.has(key), schema, 0);
  }
  return out;
}
