# Node.js + OpenAI Chat Completions + `llm-schema-validator`

Minimal **Node.js** script using **`llm-schema-validator@1.1.0`** and the official **`openai`** client against **`OPENAI_BASE_URL`** (Chat Completions–compatible `/v1`).

## Prerequisites

- **Node.js** 20.3+.
- A running Chat Completions–compatible server and a valid **`OPENAI_MODEL`** for it.

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

Prints validated JSON (`title` + `tags[]`) or errors.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | `defineSchema` + `query()` |
| `src/openai/openai-chat.provider.ts` | `createOpenAIChatProvider()` — `openai` SDK + `baseURL` |

Uses **[tsx](https://github.com/privatenumber/tsx)** to run TypeScript without a build step.

## License

Example only.
