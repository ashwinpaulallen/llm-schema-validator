# llm-schema-validator

**Structured JSON from LLMs with schema validation, coercion, and retries** — describe the shape you need, call `query()`, and get typed data or clear validation errors instead of fragile prompt-only parsing.

## The problem

Large language models rarely return perfectly valid JSON on the first try: extra prose, markdown fences, wrong types, and minor syntax issues break `JSON.parse` and downstream code. This package wraps your provider, augments prompts with a compact schema description, extracts JSON from messy replies, optionally coerces common mismatches, validates against your schema, and retries with targeted correction prompts until the output matches or limits are reached.

## Installation

```bash
npm install llm-schema-validator
```

Peer requirement: a runtime with `fetch` (Node 18+) or your bundler’s polyfills, depending on how you call the official OpenAI / Anthropic SDKs.

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

## API reference

### `query<T>(options: QueryOptions): Promise<QueryResult<T>>`

Main entry point. Builds schema-aware prompts, calls `provider.complete`, runs JSON extraction, optional coercion, validation, and retries on failure.

- **Generic `T`** — Expected shape of the parsed root object (defaults to `Record<string, unknown>`).

### `defineSchema(schema: Schema): Schema`

Identity helper typed as `defineSchema<S extends Schema>(schema: S): S`. Use it so schema literals stay well-typed and your editor can autocomplete field keys.

### `QueryOptions`

| Field | Type | Description |
|--------|------|-------------|
| `prompt` | `string` | Your task / user instruction (the library appends JSON-only and schema instructions). |
| `schema` | `Schema` | Root object schema: map of field names to `FieldSchema`. |
| `provider` | `LLMProvider` | Must implement `complete(prompt: string): Promise<string>`. |
| `maxRetries` | `number?` | **Default `3`.** Total number of provider calls per `query` (at least **1**). |
| `coerce` | `boolean?` | **Default `true`.** Run type coercion (e.g. `"42"` → number) before validation. |
| `fallbackToPartial` | `boolean?` | **Default `false`.** If all attempts fail but a root object was parsed and coerced, return that object with `success: false` instead of throwing. |
| `debug` | `boolean?` | **Default `false`.** Log each attempt, raw response, and validation / parse issues to the console. |

### `QueryResult<T>`

| Field | Type | Description |
|--------|------|-------------|
| `data` | `T` | Last successful or fallback payload (when applicable). |
| `success` | `boolean` | `true` if validation passed at least once. |
| `attempts` | `number` | Number of provider calls used (success) or max attempts (failure / partial). |
| `errors` | `string[]` | Human-readable messages for every failed attempt (empty when `success` is `true`). |

### `FieldSchema`

| Field | Type | Description |
|--------|------|-------------|
| `type` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'` | Expected JSON type after coercion. |
| `required` | `boolean` | If `true`, value must be present and not `null` / `undefined`. |
| `format` | `'email' \| 'url' \| 'date'?` | For `type: 'string'` only: extra checks (see [Schema guide](#schema-definition-guide)). |
| `default` | `unknown?` | Used during coercion when the field is missing or `null` / `undefined`. |
| `description` | `string?` | Included in prompts to steer the model. |
| `properties` | `Schema?` | For `type: 'object'`, nested fields. |
| `itemType` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'?` | For `type: 'array'`, uniform element type. |
| `itemProperties` | `Schema?` | For `type: 'array'` with `itemType: 'object'`, schema per array element. |

Root JSON must be a **plain object** (not a bare array or primitive).

## Provider setup

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

`createOpenAIProvider(apiKey, model?)` — default model: `gpt-4o`.

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

`createAnthropicProvider(apiKey, model?)` — default model: `claude-sonnet-4-20250514`.

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

## Schema definition guide

**Root** — A `Schema` is `Record<string, FieldSchema>`: top-level keys are your JSON object properties.

**Types**

- **`string`** — `typeof === 'string'`.
- **`number`** — Finite numbers (`NaN` fails validation).
- **`boolean`** — Strict booleans.
- **`array`** — `Array.isArray`. Use `itemType` to require homogeneous primitives or `'object'`. With `itemType: 'object'`, set `itemProperties` to validate each element object.
- **`object`** — Plain objects only (not arrays). Set `properties` for nested validation.

**Formats** (`type: 'string'` + `format`)

| `format` | Rule |
|----------|------|
| `email` | String contains both `@` and `.`. |
| `url` | String starts with `http` (e.g. `https://…`). |
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

## Advanced usage

### Retries

Set `maxRetries` to control how many **total** provider calls are allowed (default `3`). On failure, the library sends a correction prompt that includes your original task, the previous raw reply, and structured validation errors.

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  maxRetries: 5,
});
```

### Coercion

With `coerce: true` (default), common LLM quirks are fixed before validation, for example numeric strings → numbers, `"true"` / `"false"` → booleans, numbers → strings when the field is `string`, JSON array strings → arrays, and defaults applied for missing nullable fields. Set `coerce: false` to require strict JSON types as returned by the model.

```typescript
await query({ prompt: '…', schema, provider, coerce: false });
```

### `fallbackToPartial`

If every attempt fails validation but the last response could be parsed to a root object and coerced, returning that object may still be useful for logging or manual repair.

```typescript
const result = await query({ prompt: '…', schema, provider, fallbackToPartial: true });
if (!result.success) {
  console.warn(result.errors);
  console.log('partial', result.data);
}
```

If parsing never produced a suitable object, the library still throws.

### Debug mode

```typescript
await query({
  prompt: '…',
  schema,
  provider,
  debug: true,
});
```

Logs attempt numbers, raw model output, and parse/validation diagnostics to the console (useful in development; avoid in production with sensitive data).

## How to create a custom provider for any LLM

Implement the `LLMProvider` interface: a single method `complete(prompt: string): Promise<string>` that returns the **raw** model text (the library will extract JSON). Then pass it to `createCustomProvider` or use the object directly:

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

Use `createCustomProvider` when you already have an async `(prompt) => string` function:

```typescript
const provider = createCustomProvider((prompt) => myClient.complete({ input: prompt }));
```

## Contributing

Issues and pull requests are welcome. When changing behavior, update tests or add examples in the README as appropriate. Please run `npm run build` and ensure TypeScript compiles before submitting.

## License

MIT
