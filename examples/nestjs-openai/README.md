# NestJS + OpenAI Chat Completions + `llm-schema-validator`

Example [NestJS](https://nestjs.com/) app using **`llm-schema-validator@1.3.0`** and the **`openai`** package against any **Chat Completions–compatible** HTTP API (`OPENAI_BASE_URL` = your `/v1` root).

## What it demonstrates

| Route | Needs API? | Content |
|-------|------------|---------|
| **`GET /`** | No | Health JSON |
| **`GET /offline`** | No | `fromJsonSchema`, `fromZod`, `coerce`, `validate` (no LLM) |
| **`GET /demo`** | Yes (`OPENAI_*`) | Full **`query()`**: `systemPrompt`, `fewShot`, `promptTemplate`, `onAttempt`, `onComplete`, `logLevel`, `providerTimeoutMs`; response includes **`durationMs`**, **`usage`**, and a small **`hookTrace`** |

## Prerequisites

- **Node.js** 20.3+.
- A server implementing `POST /v1/chat/completions` and a valid **`OPENAI_MODEL`**.

## Setup

```bash
cd examples/nestjs-openai
cp .env.example .env
# Edit .env — OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_API_KEY as required
npm install
```

## Run

```bash
npm run start:dev
```

- `GET http://localhost:3000/`
- `GET http://localhost:3000/offline`
- `GET http://localhost:3000/demo` — requires configured **`OPENAI_`** variables

## Implementation

- **`src/openai/openai-chat.provider.ts`** — `createOpenAIChatProvider()` wraps `OpenAI` with `baseURL` + `model`.
- **`src/app.service.ts`** — **`defineSchema`**, **`query`**, adapter demos.

## License

Example only.
