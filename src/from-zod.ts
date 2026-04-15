import { z } from 'zod';

import type {
  AnyOfBranchSchema,
  FieldSchema,
  Schema,
  SimpleFieldSchema,
  UnionFieldSchema,
} from './types.js';

/**
 * Core field shape while mapping Zod (before attaching `required` / `nullable` / `default` / `validate` / `examples`).
 * Keeps `description` from `.describe()`.
 */
type FieldBody = Omit<SimpleFieldSchema, 'required' | 'nullable' | 'default' | 'validate' | 'examples'>;

export class ZodAdapterError extends Error {
  constructor(message: string) {
    super(`[llm-schema-validator] fromZod: ${message}`);
    this.name = 'ZodAdapterError';
  }
}

type ZodTypeAny = z.ZodTypeAny;

function getTypeName(schema: ZodTypeAny): string {
  return (schema._def as { typeName?: string }).typeName ?? '';
}

type Peeled = {
  inner: ZodTypeAny;
  required: boolean;
  nullable: boolean;
  defaultValue?: unknown;
};

const PEEL_MAX = 64;

/** Strip Zod wrappers (optional, nullable, default, readonly, branded) down to a core type. */
export function peelZodType(schema: ZodTypeAny): Peeled {
  let required = true;
  let nullable = false;
  let defaultValue: unknown = undefined;
  let cur: ZodTypeAny = schema;

  for (let i = 0; i < PEEL_MAX; i++) {
    const tn = getTypeName(cur);
    if (tn === 'ZodOptional') {
      required = false;
      cur = (cur._def as { innerType: ZodTypeAny }).innerType;
      continue;
    }
    if (tn === 'ZodNullable') {
      nullable = true;
      cur = (cur._def as { innerType: ZodTypeAny }).innerType;
      continue;
    }
    if (tn === 'ZodDefault') {
      const def = cur._def as { innerType: ZodTypeAny; defaultValue: unknown | (() => unknown) };
      const dv = def.defaultValue;
      defaultValue = typeof dv === 'function' ? (dv as () => unknown)() : dv;
      cur = def.innerType;
      continue;
    }
    if (tn === 'ZodReadonly') {
      cur = (cur._def as { innerType: ZodTypeAny }).innerType;
      continue;
    }
    if (tn === 'ZodBranded') {
      cur = (cur._def as { type: ZodTypeAny }).type;
      continue;
    }
    if (tn === 'ZodEffects') {
      throw new ZodAdapterError(
        'ZodEffects (.refine, .superRefine, .transform, etc.) is not supported — use a plain schema',
      );
    }
    if (tn === 'ZodCatch') {
      throw new ZodAdapterError('.catch() is not supported');
    }
    if (tn === 'ZodPipeline') {
      throw new ZodAdapterError('ZodPipeline (.pipe) is not supported');
    }
    if (tn === 'ZodPromise') {
      throw new ZodAdapterError('ZodPromise is not supported');
    }
    if (tn === 'ZodLazy') {
      throw new ZodAdapterError('ZodLazy is not supported');
    }
    break;
  }

  return { inner: cur, required, nullable, defaultValue };
}

function getDescription(schema: ZodTypeAny): string | undefined {
  const d = (schema._def as { description?: string }).description;
  return typeof d === 'string' && d.length > 0 ? d : undefined;
}

function zodStringToBody(inner: ZodTypeAny): FieldBody {
  const checks = ((inner._def as { checks?: { kind: string; [k: string]: unknown }[] }).checks ??
    []) as { kind: string; regex?: RegExp; value?: number }[];

  const body: FieldBody = { type: 'string' };

  for (const c of checks) {
    if (c.kind === 'min') (body as { minLength?: number }).minLength = c.value as number;
    if (c.kind === 'max') (body as { maxLength?: number }).maxLength = c.value as number;
    if (c.kind === 'email') (body as { format?: 'email' }).format = 'email';
    if (c.kind === 'url') (body as { format?: 'url' }).format = 'url';
    if (c.kind === 'date') (body as { format?: 'date' }).format = 'date';
    if (c.kind === 'regex' && c.regex) (body as { pattern?: string }).pattern = c.regex.source;
  }

  return body;
}

function zodNumberToBody(inner: ZodTypeAny): FieldBody {
  const checks = ((inner._def as { checks?: { kind: string; inclusive?: boolean; value?: number }[] }).checks ??
    []) as { kind: string; inclusive?: boolean; value?: number }[];

  const body: FieldBody = { type: 'number' };

  for (const c of checks) {
    if (c.kind === 'min' && typeof c.value === 'number') (body as { minimum?: number }).minimum = c.value;
    if (c.kind === 'max' && typeof c.value === 'number') (body as { maximum?: number }).maximum = c.value;
    if (c.kind === 'int') (body as { integer?: boolean }).integer = true;
  }
  return body;
}

/** One arm of a Zod union → `anyOf` branch (unwraps `.optional()` / `.nullable()` on that arm). */
function zodInnerToAnyOfBranch(option: ZodTypeAny): AnyOfBranchSchema {
  const p = peelZodType(option);
  return mapSimpleInner(p.inner) as AnyOfBranchSchema;
}

function zodArrayToBody(arr: ZodTypeAny, element: ZodTypeAny): FieldBody {
  const def = arr._def as {
    minLength?: { value: number } | null;
    maxLength?: { value: number } | null;
  };
  const elTn = getTypeName(element);
  const base: FieldBody =
    elTn === 'ZodObject'
      ? {
          type: 'array',
          itemType: 'object',
          itemProperties: fromZodObject(element as z.ZodObject<z.ZodRawShape>),
        }
      : elTn === 'ZodString'
        ? { type: 'array', itemType: 'string' }
        : elTn === 'ZodNumber'
          ? { type: 'array', itemType: 'number' }
          : elTn === 'ZodBoolean'
            ? { type: 'array', itemType: 'boolean' }
            : elTn === 'ZodArray'
              ? { type: 'array', itemType: 'array' }
              : (() => {
                  throw new ZodAdapterError(`unsupported Zod array element type: ${elTn}`);
                })();

  if (def.minLength?.value !== undefined) (base as { minItems?: number }).minItems = def.minLength.value;
  if (def.maxLength?.value !== undefined) (base as { maxItems?: number }).maxItems = def.maxLength.value;
  return base;
}

function mapUnionToAnyOf(inner: ZodTypeAny): UnionFieldSchema['anyOf'] {
  const tn = getTypeName(inner);
  const options =
    tn === 'ZodDiscriminatedUnion'
      ? (inner._def as { options: ZodTypeAny[] }).options
      : (inner._def as { options: ZodTypeAny[] }).options;
  if (!options?.length) {
    throw new ZodAdapterError('empty Zod union');
  }
  return options.map((opt) => zodInnerToAnyOfBranch(opt));
}

function mapSimpleInner(inner: ZodTypeAny): FieldBody {
  const tn = getTypeName(inner);
  const desc = getDescription(inner);

  if (tn === 'ZodUnion' || tn === 'ZodDiscriminatedUnion') {
    throw new ZodAdapterError('internal: union must be handled before mapSimpleInner');
  }

  let base: FieldBody;

  switch (tn) {
    case 'ZodString':
      base = zodStringToBody(inner);
      break;
    case 'ZodNumber':
      base = zodNumberToBody(inner);
      break;
    case 'ZodBoolean':
      base = { type: 'boolean' };
      break;
    case 'ZodArray': {
      const el = (inner._def as { type: ZodTypeAny }).type;
      base = zodArrayToBody(inner, el);
      break;
    }
    case 'ZodObject': {
      const o = inner as z.ZodObject<z.ZodRawShape>;
      base = {
        type: 'object',
        properties: fromZodObject(o),
      };
      break;
    }
    case 'ZodLiteral': {
      const v = (inner._def as { value: unknown }).value;
      if (v === null) {
        throw new ZodAdapterError('z.literal(null) is not supported — use .nullable() on a typed field instead');
      }
      if (typeof v === 'string') {
        base = { type: 'string', const: v };
        break;
      }
      if (typeof v === 'number') {
        base = { type: 'number', const: v };
        break;
      }
      if (typeof v === 'boolean') {
        base = { type: 'boolean', const: v };
        break;
      }
      throw new ZodAdapterError(`ZodLiteral value ${String(v)} is not supported`);
    }
    case 'ZodEnum': {
      const values = (inner._def as { values: string[] }).values;
      base = { type: 'string', enum: values };
      break;
    }
    case 'ZodNativeEnum': {
      const valuesObj = (inner._def as { values: Record<string, string | number> }).values;
      const vals = [...new Set(Object.values(valuesObj))].filter(
        (x) => typeof x === 'string' || typeof x === 'number',
      ) as (string | number)[];
      const allNum = vals.every((x) => typeof x === 'number');
      const allStr = vals.every((x) => typeof x === 'string');
      if (allStr) base = { type: 'string', enum: vals as string[] };
      else if (allNum) base = { type: 'number', enum: vals as number[] };
      else throw new ZodAdapterError('ZodNativeEnum with mixed string/number values is not supported');
      break;
    }
    case 'ZodDate':
      throw new ZodAdapterError('ZodDate is not supported — use z.string() with .date() or ISO format');
    case 'ZodRecord':
      throw new ZodAdapterError('ZodRecord is not supported');
    case 'ZodMap':
    case 'ZodSet':
      throw new ZodAdapterError(`${tn} is not supported`);
    case 'ZodTuple':
      throw new ZodAdapterError('ZodTuple is not supported');
    case 'ZodNever':
    case 'ZodUndefined':
    case 'ZodVoid':
    case 'ZodNull':
      throw new ZodAdapterError(`${tn} is not supported as a field value`);
    default:
      throw new ZodAdapterError(`unsupported Zod type: ${tn}`);
  }

  if (desc !== undefined) {
    return { ...base, description: desc };
  }

  return base;
}

/** Type helper: inferred output shape of a root `z.object({ ... })` (same as `z.infer`). */
export type InferFromZod<Z extends z.ZodObject<z.ZodRawShape>> = z.infer<Z>;

/**
 * Convert a {@link z.ZodObject} (root object schema) into a {@link Schema} for use with {@link query}, {@link validate}, etc.
 *
 * Requires the `zod` package (peer dependency). Unsupported Zod features throw {@link ZodAdapterError}.
 */
export function fromZod<S extends z.ZodRawShape>(schema: z.ZodObject<S>): Schema {
  return fromZodObject(schema);
}

function fromZodObject(schema: z.ZodObject<z.ZodRawShape>): Schema {
  const shape = schema.shape;
  const out: Schema = {};
  for (const key of Object.keys(shape)) {
    out[key] = zodFieldToFieldSchema(shape[key]!);
  }
  return out;
}

function zodFieldToFieldSchema(z: ZodTypeAny): FieldSchema {
  const p = peelZodType(z);
  const description = getDescription(z) ?? getDescription(p.inner);
  const tn = getTypeName(p.inner);

  if (tn === 'ZodUnion' || tn === 'ZodDiscriminatedUnion') {
    const unionField: UnionFieldSchema = {
      required: p.required,
      nullable: p.nullable || undefined,
      default: p.defaultValue,
      description,
      anyOf: mapUnionToAnyOf(p.inner),
    };
    return unionField;
  }

  const simple = mapSimpleInner(p.inner);
  const merged: SimpleFieldSchema = {
    ...simple,
    required: p.required,
    nullable: p.nullable || undefined,
    default: p.defaultValue,
    description: description ?? simple.description,
  };
  return merged;
}
