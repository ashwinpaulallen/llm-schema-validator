# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-13

### Added

- Initial release: `query()` with schema-guided prompts, JSON extraction, coercion, validation, and retries.
- `defineSchema()` helper for typed schema literals.
- Providers: OpenAI (Chat Completions), Anthropic (Messages), and custom `LLMProvider` wrapper.
- Public types: `QueryOptions`, `QueryResult`, `FieldSchema`, `Schema`, `ValidationError`, `LLMProvider`.

[1.0.0]: https://github.com/ashwinpaulallen/llm-schema-validator/releases/tag/v1.0.0
