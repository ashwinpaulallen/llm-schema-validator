# llm-schema-validator

TypeScript-first structured outputs from LLMs: schema-aware prompts, JSON extraction, coercion, validation, and retries — works with OpenAI, Anthropic, and custom providers.

[![npm version](https://img.shields.io/npm/v/llm-schema-validator.svg)](https://www.npmjs.com/package/llm-schema-validator)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/ashwinpaulallen/llm-schema-validator/blob/main/LICENSE)
[![Security](https://img.shields.io/badge/security-reviewed-brightgreen)](#security-and-abuse)
![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-First-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)

**[Features](#features)** · **[Install](#installation)** · **[Quick start](#quick-start)** · **[API](#core-api)** · **[Providers](#built-in-providers)** · **[Schema](#schema-definition-guide)**

---

## What it does

Large language models often return JSON that is almost right: extra prose, markdown fences, wrong types, or small syntax issues. This library:

1. Sends your task plus a **compact description of the fields** you need.
2. **Extracts JSON** from the raw model text.
3. Optionally **coerces** common mismatches (for example string numbers → numbers).
4. **Validates** against your schema.
5. On failure, **retries** with a correction prompt that includes validation errors (until `maxRetries` is reached).

You call **`query()`** with a prompt, a **`Schema`** (see below), and an **`LLMProvider`**. You get either typed **`data`** with **`success: true`**, or **`success: false`** with **`errors`**, or a thrown error when the run cannot complete (see [Errors](#errors-and-exceptions)).

> **Note:** The `Schema` type is a **small TypeScript field map** used by this package. It is **not** the [JSON Schema](https://json-schema.org/) specification.

---

## Features

- **`query()`** — End-to-end flow: prompt → model → parse → coerce → validate → retry.
- **`defineSchema()`** — Typed helper so schema objects stay autocomplete-friendly.
- **Built-in providers** — `createOpenAIProvider` (Chat Completions), `createAnthropicProvider` (Messages API), `createCustomProvider` (any async `(prompt) => string`).
- **Coercion & validation** — Strings, numbers, booleans, nested objects, arrays, optional `format` checks (`email`, `url`, `date`).
- **Diagnostics** — `debug` or inject a **`logger`** for structured logs (avoid logging secrets in production).

---

## Requirements

- **Node.js** `>= 20` (see [`engines`](https://github.com/ashwinpaulallen/llm-schema-validator/blob/main/package.json) in the repo).
- A runtime where **`fetch`** is available (Node 18+ global `fetch`, or polyfilled in older environments), as used by the official OpenAI / Anthropic clients.

---

## Installation

```bash
npm install llm-schema-validator
```

The package lists **`openai`** and **`@anthropic-ai/sdk`** as dependencies so the built-in adapters work after a normal install. You only need API keys for the provider you use.

---

## Quick start

```typescript
import {
  query,
  defineSchema,
  createOpenAIProvider,
} from 'llm-schema-validator';

const provider = createOpenAIProvider(process.env.OPENAI_API_KEY!);

const schema = defineSchema({
  title: { type: 'string', required: true, description: 'A short headline' },
  sentiment: {
    type: 'string',
    required: true,
    description: 'positive | negative | neutral',
  },
  score: { type: 'number', required: true },
});

const result = await query<{
  title: string;
  sentiment: string;
  score: number;
}>({
  prompt: 'Summarize this review in JSON: "The food was great but the wait was long."',
  schema,
  provider,
});

if (result.success) {
  console.log(result.data.title, result.data.score);
} else {
  console.error(result.errors);
}
```

---

## Package exports (at a glance)

| Export | Role |
|--------|------|
| `query` | Main API: run a schema-guided request. |
| `defineSchema` | Typed pass-through for schema literals. |
| `createOpenAIProvider`, `createAnthropicProvider`, `createCustomProvider` | Ready-made `LLMProvider` implementations. |
| `LLMProvider`, `Schema`, `FieldSchema`, `QueryOptions`, `QueryResult`, `QueryLogger`, `ValidationError` | TypeScript types. |
| `JSONExtractionError`, `ProviderError`, `QueryRetriesExhaustedError` | Error classes (see [Errors](#errors-and-exceptions)). |

---

## Core API

### `query<T>(options: QueryOptions): Promise<QueryResult<T>>`

Runs the full pipeline. **`T`** is the expected shape of the root JSON object (defaults to `Record<string, unknown>`).

### `defineSchema<S extends Schema>(schema: S): S`

Use this when declaring schemas so keys and nesting stay well-typed in your editor.

### `QueryOptions`

| Field | Type | Description |
|--------|------|-------------|
| `prompt` | `string` | Your task; the library appends JSON-only and schema instructions. |
| `schema` | `Schema` | Root object: map of field names to `FieldSchema`. |
| `provider` | `LLMProvider` | Must implement `complete(prompt: string): Promise<string>`. |
| `maxRetries` | `number?` | **Default `3`.** Maximum **total** attempts (each attempt is one `complete` call). Minimum `1`. |
| `coerce` | `boolean?` | **Default `true`.** Coerce common mismatches before validation (see [Coercion](#coercion)). |
| `fallbackToPartial` | `boolean?` | **Default `false`.** If all attempts fail validation but a root object was parsed and coerced, return that object with `success: false` instead of throwing. |
| `debug` | `boolean?` | **Default `false`.** Log diagnostics to `console` when `logger` is not set. |
| `logger` | `QueryLogger?` | If set, diagnostic messages go to `logger.debug` instead of `console`. Prefer this in production to control log sinks and redaction. |

### `QueryResult<T>`

| Field | Type | Description |
|--------|------|-------------|
| `data` | `T` | When `success: true`, the validated root object. When `success: false` with `fallbackToPartial: true`, the last coerced root object (still failing validation). |
| `success` | `boolean` | `true` if validation passed on some attempt. |
| `attempts` | `number` | How many `complete` calls were made. |
| `errors` | `string[]` | Human-readable messages for failed attempts; empty when `success` is `true`. |

### `FieldSchema`

| Field | Type | Description |
|--------|------|-------------|
| `type` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'` | Expected JSON type after coercion. |
| `required` | `boolean` | If `true`, value must be present and not `null` / `undefined`. |
| `format` | `'email' \| 'url' \| 'date'?` | For `type: 'string'` only (see [Schema guide](#schema-definition-guide)). |
| `default` | `unknown?` | Applied during coercion when the field is missing or nullish. |
| `description` | `string?` | Included in prompts to steer the model. |
| `properties` | `Schema?` | For `type: 'object'`, nested fields. |
| `itemType` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'?` | For `type: 'array'`, element type. |
| `itemProperties` | `Schema?` | For `type: 'array'` with `itemType: 'object'`, schema per element. |

The root value must be a **plain object** (not a bare array or primitive).

---

## Errors and exceptions

| Error | When |
|--------|------|
| `ProviderError` | `provider.complete()` throws (network, SDK, HTTP). **Not** retried — the error propagates immediately. |
| `QueryRetriesExhaustedError` | All attempts failed validation (or could not yield a valid root object), `fallbackToPartial` is `false` or there was nothing to return. Carries `attempts`, `collectedErrors`, and `lastRawSnippet`. |
| `JSONExtractionError` | Used internally when parsing JSON from text; during `query()`, failed extractions trigger **retries** instead of surfacing this class directly. |

---

## Built-in providers

### OpenAI (Chat Completions)

```typescript
import { createOpenAIProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createOpenAIProvider(process.env.OPENAI_API_KEY!, 'gpt-4o');

await query({
  prompt: 'List two colors as JSON.',
  schema: defineSchema({
    colors: { type: 'array', required: true, itemType: 'string' },
  }),
  provider,
});
```

- **`createOpenAIProvider(apiKey, model?)`** — Default model: **`gpt-4o`**.

### Anthropic (Messages API)

```typescript
import { createAnthropicProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createAnthropicProvider(
  process.env.ANTHROPIC_API_KEY!,
  'claude-sonnet-4-20250514',
);

await query({
  prompt: 'Return a JSON object with keys a and b.',
  schema: defineSchema({
    a: { type: 'number', required: true },
    b: { type: 'boolean', required: true },
  }),
  provider,
});
```

- **`createAnthropicProvider(apiKey, model?)`** — Default model: **`claude-sonnet-4-20250514`**.

### Custom (any async function)

```typescript
import { createCustomProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createCustomProvider(async (prompt) => {
  const res = await fetch('https://api.example.com/v1/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json()) as { text: string };
  return data.text;
});

await query({
  prompt: 'Say hello in JSON: { "greeting": "..." }',
  schema: defineSchema({
    greeting: { type: 'string', required: true },
  }),
  provider,
});
```

### Implementing `LLMProvider` yourself

Return the **raw model text** (the library extracts JSON). You can pass an object directly or use `createCustomProvider`:

```typescript
import type { LLMProvider } from 'llm-schema-validator';

const myProvider: LLMProvider = {
  async complete(prompt) {
    const out = await callYourSdk(prompt);
    return out;
  },
};

await query({ prompt: '…', schema, provider: myProvider });
```

```typescript
const provider = createCustomProvider((prompt) => myClient.complete({ input: prompt }));
```

---

## Schema definition guide

**Root** — `Schema` is `Record<string, FieldSchema>`: top-level keys are your JSON object properties.

**Types**

- **`string`** — `typeof === 'string'`.
- **`number`** — Finite numbers (`NaN` fails).
- **`boolean`** — Strict booleans.
- **`array`** — `Array.isArray`. Use `itemType` for homogeneous elements; with `itemType: 'object'`, set `itemProperties`.
- **`object`** — Plain objects only (not arrays). Use `properties` for nested fields.

**String formats** (`type: 'string'` + `format`)

| `format` | Rule |
|----------|------|
| `email` | Contains both `@` and `.`. |
| `url` | Starts with `http` (e.g. `https://…`). |
| `date` | `new Date(value)` is valid (finite timestamp). |

**Nested object**

```typescript
const schema = defineSchema({
  user: {
    type: 'object',
    required: true,
    properties: {
      id: { type: 'string', required: true },
      email: { type: 'string', required: true, format: 'email' },
    },
  },
});
```

**Array of objects**

```typescript
const schema = defineSchema({
  items: {
    type: 'array',
    required: true,
    itemType: 'object',
    itemProperties: {
      id: { type: 'number', required: true },
      label: { type: 'string', required: true },
    },
  },
});
```

---

## Advanced usage

### Retries

`maxRetries` is the **maximum number of `complete` calls** (default **`3`**). Each retry sends a correction prompt with your original task, the previous raw reply, and validation errors.

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  maxRetries: 5,
});
```

### Coercion

With `coerce: true` (default), common quirks are fixed before validation (for example numeric strings → numbers, `"true"` / `"false"` → booleans, JSON array strings → arrays, and `default` values for missing fields). Use `coerce: false` to require strict JSON types from the model.

```typescript
await query({ prompt: '…', schema, provider, coerce: false });
```

### `fallbackToPartial`

If every attempt fails validation but the last response could be parsed to a root object and coerced, you can still read `data` for logging or manual repair:

```typescript
const result = await query({ prompt: '…', schema, provider, fallbackToPartial: true });
if (!result.success) {
  console.warn(result.errors);
  console.log('partial', result.data);
}
```

If no suitable root object was ever parsed, the library **throws** `QueryRetriesExhaustedError` (same as when `fallbackToPartial` is `false`).

### Debug and `logger`

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  debug: true,
});
```

Prefer a **`logger`** in production so you can route logs and avoid leaking prompts or responses:

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  logger: { debug: (msg, ...args) => myLogger.debug(msg, args) },
});
```

---

## Contributing

Issues and pull requests are welcome. For behavior changes, add or update tests and README examples. Run `npm run build`, `npm test`, and `npm run lint` before submitting.

---

## Security and abuse

Report security vulnerabilities through [GitHub Security Advisories](https://github.com/ashwinpaulallen/llm-schema-validator/security/advisories/new) instead of public issues.

---

## License

[MIT](https://github.com/ashwinpaulallen/llm-schema-validator/blob/main/LICENSE)

---

## Links

- [npm package](https://www.npmjs.com/package/llm-schema-validator)
- [GitHub repository](https://github.com/ashwinpaulallen/llm-schema-validator)
- [Issue tracker](https://github.com/ashwinpaulallen/llm-schema-validator/issues)
