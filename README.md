# llm-schema-validator

TypeScript-first structured outputs from LLMs: schema-aware prompts, JSON extraction, coercion, validation, and retries — works with **OpenAI**, **Anthropic**, **Google Gemini**, **Ollama** (local), and custom providers.

[![npm version](https://img.shields.io/npm/v/llm-schema-validator.svg)](https://www.npmjs.com/package/llm-schema-validator)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/ashwinpaulallen/llm-schema-validator/blob/main/LICENSE)
[![Security](https://img.shields.io/badge/security-reviewed-brightgreen)](#security-and-abuse)
![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-First-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D20.3-339933?logo=node.js&logoColor=white)

**[Features](#features)** · **[Install](#installation)** · **[Quick start](#quick-start)** · **[Examples](#examples)** · **[API](#core-api)** · **[Providers](#built-in-providers)** · **[Schema](#schema-definition-guide)**

---

## What it does

Large language models often return JSON that is almost right: extra prose, markdown fences, wrong types, or small syntax issues. This library:

1. Sends your task plus a **compact description of the fields** you need.
2. **Extracts JSON** from the raw model text.
3. Optionally **coerces** common mismatches (for example string numbers → numbers).
4. **Validates** against your schema.
5. On failure, **retries** with a correction prompt that includes validation errors (until `maxRetries` is reached).

You call **`query()`** with a prompt, a **`Schema`** (see below), and an **`LLMProvider`**. You get either typed **`data`** with **`success: true`**, or **`success: false`** with **`errors`**, or a thrown error when the run cannot complete (see [Errors](#errors-and-exceptions)).

> **Note:** The native **`Schema`** type is a small TypeScript field map. You can write it by hand, or convert from **[Zod](https://zod.dev/)** via **`fromZod()`** or from **[JSON Schema draft-07](https://json-schema.org/)** via **`fromJsonSchema()`** (e.g. OpenAPI components). The runtime model is not the full JSON Schema spec, but many common definitions map cleanly. For TypeScript inference on **`fromJsonSchema`**, install **`@types/json-schema`** as a **dev** dependency.

---

## Features

- **`query()`** — End-to-end flow: prompt → model → parse → coerce → validate → retry.
- **`defineSchema()`** — Typed helper so schema objects stay autocomplete-friendly.
- **Adapters** — **`fromZod(z.object(…))`** and **`fromJsonSchema({ type: 'object', … })`** to reuse Zod or JSON Schema (draft-07) definitions as a **`Schema`**.
- **Built-in providers** — **`createOpenAIProvider`** (Chat Completions, optional **streaming** and **structured JSON Schema outputs**), **`createAnthropicProvider`** (Messages API), **`createGeminiProvider`** (Gemini REST), **`createOllamaProvider`** (local Ollama), **`createCustomProvider`**; **`QueryResult.usage`** aggregates **prompt / completion / total tokens** when the provider reports them; **`QueryResult.durationMs`** reports total wall-clock latency.
- **Object or array root** — Default top-level JSON object, or **`rootType: 'array'`** with **`arraySchema`** for a list-shaped response.
- **`anyOf` unions** — A field can list multiple alternatives (`string` **or** `number`, etc.); coercion tries branches **in order**.
- **`const` literals** — Exact value match per field (discriminated unions, fixed `kind` strings).
- **Per-field `validate`** — Custom `(value) => string | null` after built-in checks (e.g. “multiple of 5”).
- **Cross-field `validate` on `query`** — `(data) => string | null` on the full coerced object (or root array) after per-field validation (e.g. `endDate > startDate`).
- **Few-shot `fewShot`** — Optional input → JSON output pairs injected into the user message for consistent structure on hard schemas.
- **`chainOfThought`** — Optional flag: prompt asks the model to reason in plain text first, then emit the final JSON (more tokens, often better on difficult extractions).
- **`promptTemplate`** — Optional `(context) => string` to wrap the full user message; **`PromptTemplateContext`** includes `builtPrompt`, `taskPrompt`, `attempt`, `maxAttempts`, `rootKind`, `isRetry`.
- **Coercion & validation** — Strings, numbers, booleans, nested objects, arrays, optional **`format`** checks (**`email`**, **`url`**, **`date`**, **`uuid`**, **`datetime`**, **`time`**, **`ipv4`**, **`ipv6`**, **`hostname`**, **`phone`**); **`multipleOf`** (numbers), **`uniqueItems`** (arrays); optional field **`examples`** for prompt hints (validate with **`validateExamples()`** to catch drift).
- **Retries** — Configurable **`maxRetries`**, optional **exponential backoff** via **`retryDelayMs`** / **`retryBackoffMultiplier`**.
- **Standalone APIs** — **`validate`**, **`coerce`**, **`validateRootArray`**, **`coerceRootArray`** for JSON you already parsed elsewhere.
- **`onAttempt`** — Callback with attempt index, per-attempt error strings, and **`meta.durationMs`**; **`QueryResult.durationMs`** is total wall-clock time for the whole call.
- **`onComplete`** — Once at end with **`QueryCompletionSummary`** (`success`, `attempts`, `durationMs`, `errors`, `usage`) on success, **`fallbackToPartial`**, **`QueryRetriesExhaustedError`**, or **`ProviderError`** (metrics without wrapping every call in try/catch).
- **More `query` options** — **`dependentRequired`** (conditional required fields), **`onPromptBuilt`**, **`onProviderStart`**, **`onProviderEnd`**, **`onCoercionApplied`**, optional **`errorMessages`** (**`ErrorMessageTemplates`**) for i18n / custom copy.
- **Schema utilities** — **`diffSchemas`** / **`generateMigrationGuide`**, **`toJsonSchema`** (export to JSON Schema draft-07), **`validateExamples`**, **`detectRuntime`** / **`checkRuntimeCompatibility`** / **`assertRuntimeCompatible`**.
- **Diagnostics** — **`logLevel`** (`'silent'` … `'debug'`) or inject a **`logger`** with optional **`log(level, …)`** (avoid logging secrets in production).
- **Dual module format** — **ESM** and **CommonJS** builds (`import` / `require`).

---

## Requirements

- **Node.js** `>= 20.3.0` (see [`engines`](https://github.com/ashwinpaulallen/llm-schema-validator/blob/main/package.json)). **20.3+** is required for native **`AbortSignal.any`** / **`AbortSignal.timeout`** used for timeouts and signal merging (no legacy polyfills).
- **`fetch`** (global in supported Node versions) for the official OpenAI / Anthropic SDKs when you use those providers.

---

## Installation

```bash
npm install llm-schema-validator
```

**Peer dependencies (install the SDK for the provider you use):**

```bash
# OpenAI only
npm install llm-schema-validator openai

# Anthropic only
npm install llm-schema-validator @anthropic-ai/sdk

# Both
npm install llm-schema-validator openai @anthropic-ai/sdk
```

The built-in adapters load their SDK **when you first call** `complete()` — you are not required to install both. Custom providers (`createCustomProvider`) need no vendor SDK.

**Optional peer (only if you use `fromZod`):**

```bash
npm install zod
```

`fromJsonSchema` has no extra runtime dependency. For editor/types on **`JSONSchema7`**, add **`@types/json-schema`** as a **devDependency** in your app.

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

const result = await query({
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

## Examples

These projects are in the **[GitHub repository](https://github.com/ashwinpaulallen/llm-schema-validator)** under `examples/` — they are **not** part of the **npm** package (the published tarball only contains `dist/`). See **[examples/README.md](examples/README.md)** for an overview.

| Example | Description |
|--------|-------------|
| **[Node.js + OpenAI Chat](examples/nodejs-openai/README.md)** | **`llm-schema-validator@1.4.0`** + **`openai`**: offline **`fromZod` / `fromJsonSchema` / `coerce` / `validate`**, online **`query`** (object + array roots, hooks, few-shot, `promptTemplate`, cross-field `validate`). |
| **[NestJS + OpenAI Chat](examples/nestjs-openai/README.md)** | NestJS: **`GET /offline`** (adapters, no API key) and **`GET /demo`** (full **`query`** with hooks and **`durationMs` / `usage`** on the result). |

---

## Package exports (at a glance)

| Export | Role |
|--------|------|
| `query` | Main API: run a schema-guided request; **`data` is inferred** from `schema` (object root) or `arraySchema` (array root; see `InferFieldValue`). |
| `defineSchema` | Keeps schema literals narrow-typed so inference works. |
| `validate`, `coerce`, `validateRootArray`, `coerceRootArray` | Standalone validation/coercion (same rules as inside `query`): object roots use `validate`/`coerce`; array roots use `validateRootArray`/`coerceRootArray` with a `type: 'array'` field schema. |
| `fromZod`, `ZodAdapterError`, `InferFromZod` | Convert a Zod `z.object()` to a **`Schema`**; **`InferFromZod`** matches **`z.infer`**. Requires the **`zod`** package. |
| `fromJsonSchema`, `JsonSchemaAdapterError` | Convert a **JSON Schema draft-07** object schema to a **`Schema`** (same-document **`$ref`** to `#/definitions` / `#/$defs` supported). |
| `toJsonSchema` | Export a **`Schema`** to JSON Schema draft-07 (documentation, OpenAPI, OpenAI structured outputs). |
| `diffSchemas`, `generateMigrationGuide`, `SchemaDiff`, `FieldChange` | Compare two **`Schema`** values and produce a migration-style summary. |
| `validateExamples`, `ExampleValidationResult`, `ExampleValidationError` | Check that **`examples`** on fields satisfy **`enum`** / **`const`** / length / **`pattern`**. |
| `defaultErrorMessages`, `createErrorMessageGenerator`, `ErrorMessageGenerator` | Default and merged **`ErrorMessageTemplates`** for **`query({ errorMessages: … })`**. |
| `detectRuntime`, `checkRuntimeCompatibility`, `assertRuntimeCompatible`, `RuntimeEnvironment`, `RuntimeCompatibility` | Best-effort runtime detection (Node, Deno, Bun, Workers, browser). |
| `createOpenAIProvider`, `OpenAIProviderOptions`, `OpenAIStructuredOutputsConfig`, `createAnthropicProvider`, `CreateAnthropicProviderOptions`, `createGeminiProvider`, `GeminiProviderOptions`, `createOllamaProvider`, `OllamaProviderOptions`, `createCustomProvider` | Ready-made **`LLMProvider`** / **`StreamingLLMProvider`** factories and option types. |
| `StreamingLLMProvider`, `StreamChunk`, `isStreamingProvider` | Streaming adapters (e.g. OpenAI with **`stream: true`**). |
| `InferSchema`, `InferFieldValue` | Map a schema definition to a TypeScript shape (used by `query` automatically). |
| `LLMProvider`, `CompleteOptions`, `LLMProviderCompleteResult`, `LLMCompletion`, `CompletionUsage`, `Schema`, `FieldSchema`, `FewShotExample`, `PromptTemplateContext`, `QueryOptions`, `QueryOptionsBase`, `QueryObjectOptions`, `QueryArrayOptions`, `QueryResult`, `QueryCompletionSummary`, `QueryAttemptMeta`, `QueryLogger`, `ValidationError`, `CreateAnthropicProviderOptions` | TypeScript types. |
| `JSONExtractionError`, `ProviderError`, `QueryRetriesExhaustedError`, `ZodAdapterError`, `JsonSchemaAdapterError` | Error classes (see [Errors](#errors-and-exceptions)). |

**ESM and CommonJS** — The build emits **ESM** under `dist/` (`import` / `"module"`) and **CommonJS** under `dist/cjs/` (`require` / `"main"`). The package root sets `"type": "module"`; `dist/cjs/package.json` sets `"type": "commonjs"` so Node resolves `require('llm-schema-validator')` to the CJS build. Use `import` from the same package name in ESM projects.

---

## Core API

### `query(options): Promise<QueryResult<…>>`

Runs the full pipeline.

- **Object root (default):** pass **`schema`**. **`QueryResult.data`** is **`InferSchema<S>`** where **`S`** is your schema. Use **`defineSchema({ ... })`** so field `type` values stay string literals (`'string'`, `'number'`, …); otherwise TypeScript may widen types and inference weakens.
- **Array root:** set **`rootType: 'array'`** and **`arraySchema`** with **`type: 'array'`** (plus `itemType` / `itemProperties`, etc.). **`QueryResult.data`** is **`InferFieldValue<typeof arraySchema>`** (the array of elements).

You can still annotate manually when needed: `InferSchema<typeof mySchema>`, **`InferFieldValue<typeof arraySchema>`**, or `QueryResult<…>` via assertion.

### `defineSchema<S extends Schema>(schema: S): S`

Use this when declaring schemas so literals stay narrow for **`InferSchema`** and editor autocomplete.

### `validate`, `coerce`, `validateRootArray`, `coerceRootArray`

Use these when you already have parsed JSON (from your own pipeline or another library) and want the same checks as **`query`** without calling an LLM:

- **`validate(data, schema)`** / **`coerce(data, schema)`** — plain **object** `data` and object **`schema`** (throws `TypeError` if `data` is not a plain object).
- **`validateRootArray(arr, arraySchema)`** / **`coerceRootArray(arr, arraySchema)`** — root **array** `arr` and a **`FieldSchema`** with **`type: 'array'`** (same shape as **`arraySchema`** in **`query`**).

`validate` / `validateRootArray` return a **`ValidationError[]`** (empty when valid). `coerce` / `coerceRootArray` return new values and do not mutate the input.

### `QueryOptions`

| Field | Type | Description |
|--------|------|-------------|
| `prompt` | `string` | Your task; the library appends JSON-only and schema instructions into the **user** message. |
| `systemPrompt` | `string?` | Optional persona / global rules, sent separately (OpenAI **system** role, Anthropic **`system`** parameter), not mixed into `prompt`. |
| `rootType` | `'object' \| 'array'?` | **Default `'object'.** Top-level JSON is a plain object, or with **`'array'`** a JSON array (e.g. a list of items). |
| `schema` | `Schema` | **When `rootType` is `'object'` (default):** map of field names to `FieldSchema`. |
| `arraySchema` | `FieldSchema` | **When `rootType` is `'array'`:** required. Must be **`type: 'array'`**; use `itemType`, `itemProperties`, `minItems` / `maxItems`, etc. |
| `provider` | `LLMProvider` | Must implement `complete(...) → Promise<string \| { text; usage? }>` (`init` may include `signal`, `systemPrompt`). Built-in providers return **`{ text, usage? }`** when the API reports token usage. |
| `maxRetries` | `number?` | **Default `3`.** Maximum **total** attempts (each attempt is one `complete` call). Minimum `1`. |
| `retryDelayMs` | `number?` | **Default: none (immediate retries).** Base wait before each retry after a failed attempt; use with `retryBackoffMultiplier` for exponential backoff (see [Retries](#retries)). |
| `retryBackoffMultiplier` | `number?` | **Default `2`** when `retryDelayMs` is set. Per-retry multiplier (`1` = fixed delay every time). |
| `coerce` | `boolean?` | **Default `true`.** Coerce common mismatches before validation (see [Coercion](#coercion)). |
| `fallbackToPartial` | `boolean?` | **Default `false`.** If all attempts fail validation but a root **object** or **array** was parsed and coerced, return that value with `success: false` instead of throwing. |
| `logLevel` | `QueryLogLevel?` | **Default:** `silent` unless `debug: true`, a **`logger`** is set, or you set this explicitly. **`error` ≤ `warn` ≤ `info` ≤ `debug`** — e.g. **`info`** logs attempts and outcomes, not raw model text (**`debug`**). Takes precedence over **`debug`**. |
| `debug` | `boolean?` | **Deprecated.** Prefer **`logLevel: 'debug'`**. When `true` and `logLevel` is omitted, diagnostics use full **`debug`** verbosity. |
| `logger` | `QueryLogger?` | Prefer **`logger.log(level, message, …args)`** for level-aware routing; otherwise **`logger.debug(message, …)`** receives all emitted lines. If omitted, messages go to **`console.error` / `warn` / `info` / `debug`** by level. |
| `onAttempt` | `(attempt, errors, meta?) => void?` | After each finished **`complete()`** for that attempt: **`attempt`** is 1-based; **`errors`** is empty on success. **`meta.durationMs`** (optional in the type, always passed at runtime) is per-attempt wall-clock time after any backoff before that attempt. |
| `onComplete` | `(summary: QueryCompletionSummary) => void?` | Once when the query **terminates**: same fields as **`QueryResult`** except **`data`** — **`success`**, **`attempts`**, **`durationMs`**, **`errors`**, **`usage`**. Runs on success, **`fallbackToPartial`**, **`QueryRetriesExhaustedError`**, and **`ProviderError`**. |
| `dependentRequired` | `Record<string, readonly string[]>?` | **Object root only.** If a **trigger** key is present, the listed fields are required (e.g. `{ creditCard: ['billingAddress'] }`). |
| `onPromptBuilt` | `(prompt, attempt) => void?` | After the user message is fully built, before **`complete()`**. |
| `onProviderStart` | `(attempt) => void?` | Immediately before **`provider.complete()`**. |
| `onProviderEnd` | `(attempt, durationMs, rawText?) => void?` | After **`complete()`** returns or throws; **`rawText`** omitted on failure. |
| `onCoercionApplied` | `(before, after, attempt) => void?` | After coercion when **`coerce: true`**. |
| `errorMessages` | `ErrorMessageTemplates?` | Optional localized or custom templates for validation-style messages (see **`defaultErrorMessages`**). |
| `signal` | `AbortSignal?` | Passed to each `provider.complete()` (and merged with `providerTimeoutMs`). Aborting ends the current attempt with an error (same as a failed provider call). |
| `providerTimeoutMs` | `number?` | **Default: none.** Maximum time in milliseconds for **each** `complete()` call. Prevents hung LLM requests from blocking forever; uses `AbortSignal` and races the promise so `query` returns even if a custom provider ignores cancellation. |
| `validate` | `(data) => string \| null?` | **Cross-field validation** after per-field checks on the **coerced** root: object root → `Record<string, unknown>`; array root → `unknown[]`. Return **`null`** if OK, or an error message string. |
| `fewShot` | `{ input: string; output: unknown }[]?` | **Few-shot examples** after `prompt` on the first attempt. On **retries**, an **abbreviated** block (fewer examples, tighter size caps) is inserted **after** the invalid reply and validation fixes so error context stays near the top. |
| `chainOfThought` | `boolean?` | **Default `false`.** When **`true`**, the user message asks for step-by-step reasoning in plain text, then a single JSON root value matching the schema. **`extractJSON`** prefers the **last** top-level JSON value in the reply (nested JSON inside that value is still one value); earlier illustrative objects in the reasoning text are ignored when they are clearly nested or superseded. Uses more tokens. |
| `promptTemplate` | `(context: PromptTemplateContext) => string?` | Transform the **fully built** user message before **`complete()`**. **`context.builtPrompt`** is the full text; **`taskPrompt`** is your original `prompt`; **`attempt`** / **`maxAttempts`** / **`isRetry`** identify the try. Must return a string. |

### `QueryResult<T>`

| Field | Type | Description |
|--------|------|-------------|
| `data` | `T` | When `success: true`, the validated root value (object or array). When `success: false` with `fallbackToPartial: true`, the last coerced root value (still failing validation). |
| `success` | `boolean` | `true` if validation passed on some attempt. |
| `attempts` | `number` | How many `complete` calls were made. |
| `errors` | `string[]` | Human-readable messages for failed attempts; empty when `success` is `true`. |
| `durationMs` | `number` | Total wall-clock time for this `query` (setup, every attempt, parsing/validation, and inter-attempt backoff). |
| `usage` | `CompletionUsage?` | **Aggregated** `promptTokens`, `completionTokens`, `totalTokens` across every `complete()` in this `query` (including retries), when reported. Omitted if no attempt returned usage. |

### `FieldSchema`

Either a **single-type** field (`type` + constraints) or a **union** field (`anyOf` — no top-level `type`).

| Field | Type | Description |
|--------|------|-------------|
| `type` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'` | Expected JSON type after coercion. Omit when using **`anyOf`** only. |
| `anyOf` | `AnyOfBranchSchema[]?` | Alternatives (JSON Schema–style). Each branch has its own `type` and constraints. Coercion tries branches **in order**; validation succeeds if **any** branch matches. |
| `required` | `boolean` | If `true`, the key must be present. `null` is invalid unless `nullable` is `true`. |
| `nullable` | `boolean?` | If `true`, JSON `null` is accepted and skips type checks for that field. |
| `const` | `string \| number \| boolean \| null?` | Exact value after coercion (like JSON Schema **`const`**). |
| `enum` | `(string \| number)[]?` | Value must equal one of the listed literals (after coercion). Use with `string`, `number`, or `boolean`. |
| `validate` | `(value: unknown) => string \| null?` | **Per-field** custom check after built-in validation for that value. Return **`null`** if valid, else a short message. |
| `minimum` / `maximum` | `number?` | Inclusive bounds for `type: 'number'`. |
| `multipleOf` | `number?` | Value must be a multiple of this number (e.g. **`0.01`** for two decimal places). |
| `integer` | `boolean?` | If `true`, number must be an integer. |
| `minLength` / `maxLength` | `number?` | String length (UTF-16 code units). |
| `pattern` | `string?` | ECMAScript regex **without** `/` delimiters (e.g. `^\\d{5}$`). |
| `minItems` / `maxItems` | `number?` | Array length bounds. |
| `uniqueItems` | `boolean?` | If `true`, array elements must be unique (compared via **`JSON.stringify`**). |
| `format` | see [String formats](#string-formats-type-string--format) above | For `type: 'string'` only. |
| `default` | `unknown?` | Applied during coercion when the key is missing or the value is nullish (unless `nullable` preserves `null`). |
| `description` | `string?` | Included in prompts to steer the model. |
| `examples` | `string[]?` | Example values shown in the schema outline (hints for the model). **Not** validated — use `enum` for strict allowed values. |
| `properties` | `Schema?` | For `type: 'object'`, nested fields. |
| `itemType` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'?` | For `type: 'array'`, element type. |
| `itemProperties` | `Schema?` | For `type: 'array'` with `itemType: 'object'`, schema per element. |

By default the root value must be a **plain object** (not a bare array or primitive). With **`rootType: 'array'`** and **`arraySchema`**, the root must be a **JSON array** whose elements match that schema (same rules as `type: 'array'` on a field).

---

## Errors and exceptions

| Error | When |
|--------|------|
| `ProviderError` | `provider.complete()` throws (network, SDK, HTTP). **Not** retried — the error propagates immediately. |
| `QueryRetriesExhaustedError` | All attempts failed validation (or could not yield a valid root object/array), `fallbackToPartial` is `false` or there was nothing to return. Carries `attempts`, `collectedErrors`, `lastRawSnippet`, **`durationMs`**, and optional **`usage`**. Prefer **`catch`** and read these fields — constructing **`new QueryRetriesExhaustedError(...)`** yourself is only for tests/tooling; the constructor is not treated as a stable app-facing API (see JSDoc). |
| `JSONExtractionError` | Used internally when parsing JSON from text; during `query()`, failed extractions trigger **retries** instead of surfacing this class directly. |
| `ZodAdapterError` | `fromZod()` cannot represent a Zod construct (unsupported feature). |
| `JsonSchemaAdapterError` | `fromJsonSchema()` cannot represent a JSON Schema fragment (unsupported keyword or shape). |

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

- **`createOpenAIProvider(apiKey, model?, options?)`** — Default model: **`gpt-4o`**. **`response_format: { type: 'json_object' }`** is applied by default (OpenAI JSON mode) to reduce invalid JSON; override with **`response_format: { type: 'text' }`** if the model does not support JSON mode. Other **`options`** fields: **`temperature`**, **`top_p`**, **`seed`**, **`response_format`** (or pass **`options` alone as the second argument**). Maps Chat Completions **`usage`** (`prompt_tokens`, `completion_tokens`, `total_tokens`) into **`CompletionUsage`** for **`query()`** aggregation.
- **`stream: true`** — Returns a **`StreamingLLMProvider`**: call **`stream(prompt, init?)`** for async chunks (**`StreamChunk`**: **`text`**, **`done`**, optional **`usage`** on the final chunk). **`complete()`** still works on the same object.
- **`structuredOutputs: { schema, name?, skipValidation?, strict? }`** — Uses OpenAI **structured outputs** (**`response_format.type: 'json_schema'`**) with a JSON Schema derived from your **`Schema`** via **`toJsonSchema()`**. When **`skipValidation: true`**, you may rely on the model’s guarantee (still parse in **`query`** as usual unless you add your own shortcut).

### Anthropic (Messages API)

```typescript
import { createAnthropicProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createAnthropicProvider(process.env.ANTHROPIC_API_KEY!, {
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
});

await query({
  prompt: 'Return a JSON object with keys a and b.',
  schema: defineSchema({
    a: { type: 'number', required: true },
    b: { type: 'boolean', required: true },
  }),
  provider,
});
```

- **`createAnthropicProvider(apiKey, model?)`** — Second argument can be a **model id string** (same as before).
- **`createAnthropicProvider(apiKey, options?)`** — **`options.model`** (default **`claude-sonnet-4-6`**, Anthropic’s current Sonnet alias) and **`options.maxTokens`** (default **`8192`**, maps to Anthropic `max_tokens`). Also supports **`temperature`**, **`top_p`**, **`top_k`**, **`seed`**, and **`stop_sequences`**, passed through to `messages.create`. Maps **`usage.input_tokens` / `output_tokens`** to **`CompletionUsage`** (and sets **`totalTokens`** to their sum when both are present).

### Google Gemini (REST API)

```typescript
import { createGeminiProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createGeminiProvider(process.env.GEMINI_API_KEY!, {
  model: 'gemini-1.5-flash',
  temperature: 0.2,
});

await query({
  prompt: 'Return one JSON object with key hello.',
  schema: defineSchema({ hello: { type: 'string', required: true } }),
  provider,
});
```

- **`createGeminiProvider(apiKey, options?)`** — Uses **`fetch`** against **`generativelanguage.googleapis.com`** (no **`@google/generative-ai`** peer dependency). API key is sent as **`x-goog-api-key`**. Optional **`stream: true`** for **`StreamingLLMProvider`**. **`jsonMode`** (default **`true`**) sets **`application/json`** response MIME type.

### Ollama (local)

```typescript
import { createOllamaProvider, query, defineSchema } from 'llm-schema-validator';

const provider = createOllamaProvider({
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434',
});

await query({
  prompt: 'Return {"ok": true}',
  schema: defineSchema({ ok: { type: 'boolean', required: true } }),
  provider,
});
```

- **`createOllamaProvider(options?)`** — **`/api/chat`** with **`format: 'json'`** by default. **`keep_alive`** is sent on every request (default **`true`**; set **`keepAlive: false`** to unload the model after the call). Optional **`stream: true`**.

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

Return the **model text** as a **`string`**, or as **`{ text: string; usage?: CompletionUsage }`** when your backend reports token counts (included in **`query()`**’s aggregated **`usage`**). The library extracts JSON from **`text`**. You can pass an object directly or use `createCustomProvider`:

```typescript
import type { LLMProvider } from 'llm-schema-validator';

const myProvider: LLMProvider = {
  async complete(prompt, init) {
    const { text, usage } = await callYourSdk(prompt, {
      signal: init?.signal,
      system: init?.systemPrompt,
    });
    return usage ? { text, usage } : text;
  },
};

await query({ prompt: '…', schema, provider: myProvider, systemPrompt: 'You only output valid JSON.' });
```

```typescript
const provider = createCustomProvider((prompt) => myClient.complete({ input: prompt }));
```

---

## Schema definition guide

**Root (object)** — `Schema` is `Record<string, FieldSchema>`: top-level keys are your JSON object properties.

**Root (array)** — Set **`rootType: 'array'`** and pass **`arraySchema`** with **`type: 'array'`**, **`required: true`**, and **`itemType`** / **`itemProperties`** as needed. The model is asked for **one JSON array** at the top level.

```typescript
await query({
  prompt: 'Return a list of tags.',
  rootType: 'array',
  arraySchema: {
    type: 'array',
    required: true,
    itemType: 'string',
    minItems: 1,
  },
  provider,
});
```

**OpenAI note:** Chat Completions **`response_format: { type: 'json_object' }`** (the default in **`createOpenAIProvider`**) requires a top-level JSON **object**, not a bare array. For **`rootType: 'array'`**, pass **`response_format: { type: 'text' }`** in the provider options (or use a model/provider that accepts array-shaped JSON).

**Types**

- **`string`** — `typeof === 'string'`.
- **`number`** — Finite numbers (`NaN` fails).
- **`boolean`** — Strict booleans.
- **`array`** — `Array.isArray`. Use `itemType` for homogeneous elements; with `itemType: 'object'`, set `itemProperties`.
- **`object`** — Plain objects only (not arrays). Use `properties` for nested fields.

### String formats (`type: 'string'` + `format`)

| `format` | Rule |
|----------|------|
| `email` | Simple shape: exactly one `@`, non-empty local and domain parts, domain has a dot-separated host with a TLD of at least two characters. Not a full RFC 5322 / DNS validation. |
| `url` | Parses as an absolute **`http:`** or **`https:`** URL with a non-empty host (WHATWG `URL`). |
| `date` | **Calendar date only:** `YYYY-MM-DD` (UTC), with a real calendar day (rejects e.g. `2024-02-30`). Not arbitrary strings accepted by `Date.parse`. |
| `datetime` | ISO 8601 datetime (date + time + optional offset / `Z`). |
| `time` | ISO 8601 time component. |
| `uuid` | UUID version 4. |
| `ipv4` / `ipv6` | IPv4 or IPv6 address strings. |
| `hostname` | DNS hostname shape (best-effort). |
| `phone` | E.164 (`+` and digits, length limits per E.164). |

**Other constraints** — See the [`FieldSchema`](#fieldschema) table: `enum`, `minimum` / `maximum`, `integer`, `minLength` / `maxLength`, `pattern`, `minItems` / `maxItems`, `nullable`. The **`examples`** field only affects prompts (suggested vocabulary), not validation. Optional fields may be omitted; if the key is present with `null`, set `nullable: true` or validation fails.

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

**`anyOf` (unions)** — Use **`anyOf: [ … ]`** instead of a top-level **`type`** when a field may be one of several shapes. Coercion runs each branch **in order** and picks the first that succeeds; validation accepts the first branch that fully matches.

**`const`** — Pin an exact value after coercion (string, number, boolean, or JSON **`null`**). Handy for tags like **`kind: 'user' | 'bot'`** when paired with other fields.

**Per-field `validate`** — Optional **`(value: unknown) => string | null`**. Runs **after** built-in checks; return **`null`** when valid.

**Query-level `validate` (cross-field)** — On **`query({ … })`**, optional **`validate: (data) => string | null`** runs **after** all per-field checks on the coerced root (**object** or **array**). Failures appear in retries and in **`ValidationError`** with **`field: '(query)'`**.

**`fromZod`**

```typescript
import { fromZod, query, InferFromZod } from 'llm-schema-validator';
import { z } from 'zod';

const zodSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
});

const schema = fromZod(zodSchema);
type Row = InferFromZod<typeof zodSchema>; // same idea as z.infer<typeof zodSchema>
```

Install **`zod`** when you use this path. Unsupported Zod features throw **`ZodAdapterError`**.

**`fromJsonSchema`**

```typescript
import { fromJsonSchema } from 'llm-schema-validator';

const schema = fromJsonSchema({
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string' },
  },
});
```

Expect **draft-07** object roots. Same-document **`$ref`** to **`#/definitions`** / **`#/$defs`** is supported; unsupported constructs throw **`JsonSchemaAdapterError`**. No runtime JSON Schema dependency (only this package’s internal model).

### Schema utilities and runtime helpers

| API | Purpose |
|-----|---------|
| **`toJsonSchema(schema)`** | Build a JSON Schema draft-07 document from a **`Schema`** (for docs, OpenAPI, or **`createOpenAIProvider({ structuredOutputs: { schema } })`**). |
| **`diffSchemas(oldSchema, newSchema)`** / **`generateMigrationGuide(diff)`** | List added / removed / changed fields between two **`Schema`** maps; optional Markdown migration text. |
| **`validateExamples(schema)`** | Ensure **`examples`** on string fields respect **`enum`**, **`const`**, length, and **`pattern`** (optional CI / tests). |
| **`detectRuntime()`** / **`checkRuntimeCompatibility()`** | Best-effort environment hints (**Node**, **Deno**, **Bun**, **cloudflare-workers**, **browser**, **unknown**). Not authoritative for security boundaries (see JSDoc). |

---

## Advanced usage

### Retries

`maxRetries` is the **maximum number of `complete` calls** (default **`3`**). Each retry sends a correction prompt with your original task, the previous raw reply, and validation errors.

Optional **`retryDelayMs`** adds a wait before starting each retry (after the first attempt), which helps avoid hammering rate limits. Delays grow by **`retryBackoffMultiplier`** each time (default **`2`**, i.e. exponential backoff). Use **`retryBackoffMultiplier: 1`** for a constant delay between every retry.

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  maxRetries: 5,
});
```

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  maxRetries: 6,
  retryDelayMs: 400,
  // retryBackoffMultiplier: 2, // default: 400ms, 800ms, 1600ms, …
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

### Timeouts and `AbortSignal`

Use **`providerTimeoutMs`** so a single slow or stuck `complete()` does not block your process (limit applies **per attempt**, not to the whole `query` including retries). The built-in OpenAI and Anthropic adapters pass the signal through to their HTTP clients. Custom providers can read **`init.signal`** from `createCustomProvider(async (prompt, init) => …)`; if they ignore it, `query` still rejects when the timeout fires, but the underlying work may continue until you wire cancellation yourself.

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  providerTimeoutMs: 60_000,
});
```

Combine with your own **`signal`** (e.g. request cancellation in a server handler):

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);

await query({
  prompt: '…',
  schema,
  provider,
  signal: controller.signal,
  providerTimeoutMs: 60_000,
});
```

### Logging: `logLevel` and `logger`

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  logLevel: 'info', // attempts / outcomes; omit raw model text (use 'debug' for that)
});
```

Prefer a **`logger`** in production so you can route by severity and avoid leaking prompts or responses:

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  logLevel: 'debug',
  logger: {
    log: (level, msg, ...args) => {
      if (level === 'debug' && msg.includes('raw response')) return; // redact
      myLogger.log(level, msg, args);
    },
  },
});
```

Legacy **`debug: true`** is equivalent to **`logLevel: 'debug'`** when **`logLevel`** is omitted.

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
