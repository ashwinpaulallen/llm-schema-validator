# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
