# NestJS + OpenAI Chat Completions + `llm-schema-validator`

Example [NestJS](https://nestjs.com/) app that uses **`llm-schema-validator@1.1.0`** from npm and the official **`openai`** package to call any **Chat Completions–compatible** HTTP API (set `OPENAI_BASE_URL` to your endpoint’s `/v1` root).

## Prerequisites

- **Node.js** 20.3+ (matches `llm-schema-validator`).
- A running server that implements OpenAI-style `POST /v1/chat/completions` (local inference, a gateway, or `https://api.openai.com/v1`).
- A **model id** accepted by that server (`OPENAI_MODEL`).

## Setup

```bash
cd examples/nestjs-openai
cp .env.example .env
# Edit .env — OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_API_KEY as required by your server
npm install
```

## Run

```bash
npm run start:dev
```

- `GET http://localhost:3000/` — health JSON.
- `GET http://localhost:3000/demo` — runs **`query()`** with a small schema against your configured endpoint.

## Implementation

- **`src/openai/openai-chat.provider.ts`** — `createOpenAIChatProvider()` wraps `OpenAI` from **`openai`** with `baseURL` + `model`.
- **`src/app.service.ts`** — **`defineSchema`** + **`query`** from **`llm-schema-validator`**.

## License

Example only.
