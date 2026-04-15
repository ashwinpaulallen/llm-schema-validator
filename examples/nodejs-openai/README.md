# Node.js + OpenAI Chat Completions + `llm-schema-validator`

Example script using **`llm-schema-validator@1.3.0`** and the official **`openai`** client against **`OPENAI_BASE_URL`** (any Chat Completions–compatible `/v1` server).

## What it demonstrates

| Area | APIs |
|------|------|
| **Offline (always runs)** | `defineSchema`, `coerce`, `validate`, `fromJsonSchema`, `fromZod` |
| **Online (needs `OPENAI_*`)** | `query` **object** root: `systemPrompt`, `fewShot`, cross-field `validate`, `promptTemplate`, `onAttempt`, `onComplete`, `logLevel`, `providerTimeoutMs`, `QueryResult.usage` / `durationMs` |
| **Online** | `query` **array** root: `rootType`, `arraySchema` |
| **Errors (pattern)** | `catch` **`QueryRetriesExhaustedError`** / **`ProviderError`** |

The repo also ships **`createOpenAIProvider(apiKey, model?)`** for the default OpenAI API (no custom `baseURL`). This example keeps a small **`createOpenAIChatProvider`** helper so you can point at LM Studio, Ollama bridges, or other compatible servers.

## Prerequisites

- **Node.js** 20.3+.
- A Chat Completions–compatible server and a valid **`OPENAI_MODEL`** (for LLM sections).

## Setup

```bash
cd examples/nodejs-openai
cp .env.example .env
npm install
```

## Run

```bash
npm start
```

- **Without** `OPENAI_BASE_URL` / `OPENAI_MODEL`, only the **offline** block runs (adapters + coercion).
- **With** env vars set, runs **offline** then two **`query()`** calls.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Offline + online demos |
| `src/openai/openai-chat.provider.ts` | `OpenAI` SDK + `baseURL` → `LLMProvider` |

Uses **[tsx](https://github.com/privatenumber/tsx)** to run TypeScript without a build step.

## License

Example only.
