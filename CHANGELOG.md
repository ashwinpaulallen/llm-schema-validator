# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-16

### Added

- **Providers**
  - **`createGeminiProvider(apiKey, options?)`** — Google Gemini REST API (`generativelanguage.googleapis.com`), optional **`stream`**, JSON mode via **`responseMimeType`**. API key sent with **`x-goog-api-key`** (not in the URL query string).
  - **`createOllamaProvider(options?)`** — Local **[Ollama](https://ollama.com/)** **`/api/chat`** with **`format: 'json'`** by default, configurable **`baseUrl`**, **`model`**, sampling options, optional **`stream`**, and **`keep_alive`** (always sent; default **`true`**; set **`keepAlive: false`** to opt out).
  - **OpenAI — streaming:** **`OpenAIProviderOptions.stream: true`** returns a **`StreamingLLMProvider`** with **`stream(prompt, init?)`** yielding **`StreamChunk`** (`text`, `done`, optional **`usage`**). Final **`done: true`** is emitted only after the stream ends (usage may arrive on an intermediate chunk and is attached to the closing chunk).
  - **OpenAI — structured outputs:** **`structuredOutputs: { schema, name?, skipValidation?, strict? }`** sets Chat Completions **`response_format: { type: 'json_schema', json_schema: … }`** using **`toJsonSchema()`**. Provider exposes **`__usesStructuredOutputs`** and **`__skipValidation`** when enabled.
  - **`StreamingLLMProvider`**, **`StreamChunk`**, **`StreamEvent`**, **`isStreamingProvider()`** in **`types`**.
- **Query / options**
  - **`dependentRequired`** on **`QueryObjectOptions`** — e.g. `{ creditCard: ['billingAddress'] }` when a trigger key is present, listed fields become required.
  - **Telemetry hooks:** **`onPromptBuilt`**, **`onProviderStart`**, **`onProviderEnd`**, **`onCoercionApplied`** (see JSDoc on **`QueryOptionsBase`**).
  - **`errorMessages`** — optional **`ErrorMessageTemplates`** for localized or branded messages; **`createErrorMessageGenerator`**, **`defaultErrorMessages`**.
- **Validation / schema**
  - **String `format`:** **`uuid`**, **`datetime`**, **`time`**, **`ipv4`**, **`ipv6`**, **`hostname`**, **`phone`** (E.164), in addition to **`email`**, **`url`**, **`date`**.
  - **`multipleOf`** on number fields (JSON Schema–style, with floating-point tolerance).
  - **`uniqueItems`** on **`type: 'array'`** (uniqueness via **`JSON.stringify`** per element).
  - **Pattern regex cache** capped (FIFO) to avoid unbounded growth in long-lived processes.
- **Utilities**
  - **`diffSchemas`**, **`generateMigrationGuide`**, **`SchemaDiff`**, **`FieldChange`** — compare two **`Schema`** values (deep equality for nested key order).
  - **`toJsonSchema(schema)`** — export a **`Schema`** to JSON Schema draft-07 (for docs, OpenAPI, OpenAI structured outputs).
  - **`validateExamples(schema)`** — optional check that **`examples`** strings satisfy **`enum`** / **`const`** / length / **`pattern`** (catch prompt drift).
  - **`checkRuntimeCompatibility`**, **`detectRuntime`**, **`assertRuntimeCompatible`** — environment hints (**Node**, **Deno**, **Bun**, **cloudflare-workers**, **browser**, **unknown**); Workers vs browser Service Worker distinguished when **`ServiceWorkerGlobalScope`** is available.
- **Type inference** — **`anyOf`** object branches infer nested **`properties`**; **`ExtractDiscriminator`**, **`NarrowByDiscriminator`** exported from **`schema-infer`** for discriminated unions.

### Changed

- **`@types/json-schema`** is a **devDependency** only (not a peer dependency). Consumers who want typings for **`fromJsonSchema`** should install **`npm install -D @types/json-schema`**.
- **OpenAI `createOpenAIProvider`:** single dynamic import per request path via **`ensureClientAndModule()`** (no duplicate **`loadOpenAIModule()`** in **`complete()`**).
- **Default `typeMismatch` template:** uses **`must match: ${expected}`** (no fragile **a/an** heuristics).
- **`createErrorMessageGenerator`** returns **`mergeErrorTemplates(templates)`** directly.

### Fixed

- **`schema-diff` `fieldsAreEqual`:** deep structural equality (sorted object keys at each level; array order preserved) instead of incorrect **`JSON.stringify` replacer** usage.
- **`retry`:** **`providerStartTime`** initialized to **`0`**; **`onProviderEnd`** duration uses **`0`** if the provider threw before timing started.
- **Single-quoted JSON repair:** internal apostrophes emit a literal **`'`** in the double-quoted output (valid JSON), not **`\\'`**.
- **Runtime detection:** **`caches` + no `navigator`** no longer always maps to Cloudflare when **`globalThis instanceof ServiceWorkerGlobalScope`** (browser Service Workers). **`detectRuntime`** JSDoc documents limitations.

[1.4.0]: https://github.com/ashwinpaulallen/llm-schema-validator/releases/tag/v1.4.0

## [1.3.0] - 2026-04-15

### Breaking

- **`QueryRetriesExhaustedError` constructor** — parameters are now **`(attempts, collectedErrors, lastRawSnippet, durationMs, usage?)`**. Older **`(attempts, collectedErrors, lastRawSnippet, usage?)`** call sites that passed **`usage`** as the fourth argument will mis-bind in **JavaScript** (that slot is now **`durationMs`**). **TypeScript** catches the mismatch. Prefer **`catch`** on errors thrown from **`query()`** instead of constructing this class in application code; see JSDoc on the class.

### Added

- **`onComplete`:** optional **`(summary: QueryCompletionSummary) => void`** — fired once at the end of every **`query`** with **`success`**, **`attempts`**, **`durationMs`**, **`errors`**, and **`usage`** (same as **`QueryResult`** minus **`data`**), including when **`QueryRetriesExhaustedError`** or **`ProviderError`** is thrown (so metrics work without wrapping every call in try/catch).
- **Latency:** **`QueryResult.durationMs`** — total wall-clock milliseconds for the whole `query` (including inter-attempt backoff). **`onAttempt`** receives a third argument **`{ durationMs }`** per attempt (time after any backoff before that attempt, until the callback).
- **Structured logging:** **`logLevel`** on `QueryOptions` (`'silent'` \| `'error'` \| `'warn'` \| `'info'` \| `'debug'`) and **`QueryLogger.log(level, message, …)`** for level-aware sinks; default console output uses **`console.info` / `warn` / `debug`** by line severity. **`debug: true`** remains as a deprecated alias for **`logLevel: 'debug'`** when **`logLevel`** is omitted.
- **`fewShot`** on `QueryOptions`: optional `FewShotExample[]` — full **input → root JSON output** pairs appended to the user message (and retries) to improve consistency on complex schemas.
- **`chainOfThought`** on `QueryOptions`: when `true`, prompts ask for reasoning in plain text before the final JSON (higher token use, often better on hard extractions).
- **`promptTemplate`** on `QueryOptions`: optional `(context: PromptTemplateContext) => string` to wrap or edit the full user message before each `complete()` (including retries).
- **Token usage:** **`QueryResult.usage`** (`promptTokens`, `completionTokens`, `totalTokens`) — aggregated across all attempts when the provider returns usage. **`createOpenAIProvider`** / **`createAnthropicProvider`** map vendor responses; optional **`QueryRetriesExhaustedError.usage`** on failure. Types: **`CompletionUsage`**, **`LLMCompletion`**, **`LLMProviderCompleteResult`**.

### Changed

- **`onAttempt`** / **`onComplete`** errors are caught and ignored so observability hooks cannot alter control flow or mask **`ProviderError`**, **`QueryRetriesExhaustedError`**, or abort errors.
- **`QueryRetriesExhaustedError`:** **`durationMs`** is required on the instance (see **Breaking** above for constructor migration).
- **`onComplete`** is also invoked when **`AbortSignal`** aborts during inter-attempt backoff (previously the abort bypassed **`onComplete`**).
- **`LLMProvider.complete`** may resolve to a plain **`string`** or **`{ text: string; usage?: CompletionUsage }`** (built-in adapters return the object form when the API includes usage).
- **`promptTemplate`** receives **`PromptTemplateContext`** (`builtPrompt`, `taskPrompt`, `attempt`, `maxAttempts`, `rootKind`, `isRetry`) instead of a plain string. Migrate: `(built)` → `(ctx) => … ctx.builtPrompt …`.
- **Few-shot on retries:** retry prompts now list **Previous reply** / **Correct:** first, then a **shorter** few-shot block (fewer examples and stricter size limits) so validation errors are not pushed down by large example sets.
- **`extractJSON`:** when several top-level `{…}` / `[…]` segments exist, nested segments are ignored and the **last** root-level segment is tried first (better for chain-of-thought; final answer usually last).

[1.3.0]: https://github.com/ashwinpaulallen/llm-schema-validator/releases/tag/v1.3.0

## [1.2.0] - 2026-04-15

### Added

- **Per-field `validate`** on `FieldSchema`: optional `(value: unknown) => string | null` after built-in validation for that field.
- **Query-level `validate`** on `QueryObjectOptions` / `QueryArrayOptions`: optional `(data) => string | null` for cross-field rules after per-field validation; failures use **`field: '(query)'`** in errors and retries.
- **`anyOf`** union fields (JSON Schema–style branches); coercion tries alternatives **in order**.
- **`const`** for exact literals on string/number/boolean (and JSON null); inference narrows where applicable.
- **`fromZod()`** — Zod `z.object()` → internal `Schema`; **`ZodAdapterError`**, **`InferFromZod`**; optional peer **`zod`**.
- **`fromJsonSchema()`** — JSON Schema draft-07 object roots → internal `Schema`; **`JsonSchemaAdapterError`**; no runtime JSON Schema dependency.

[1.2.0]: https://github.com/ashwinpaulallen/llm-schema-validator/releases/tag/v1.2.0

## [1.0.0] - 2026-04-13

### Added

- Initial release: `query()` with schema-guided prompts, JSON extraction, coercion, validation, and retries.
- `defineSchema()` helper for typed schema literals.
- Providers: OpenAI (Chat Completions), Anthropic (Messages), and custom `LLMProvider` wrapper.
- Public types: `QueryOptions`, `QueryResult`, `FieldSchema`, `Schema`, `ValidationError`, `LLMProvider`.

[1.0.0]: https://github.com/ashwinpaulallen/llm-schema-validator/releases/tag/v1.0.0
