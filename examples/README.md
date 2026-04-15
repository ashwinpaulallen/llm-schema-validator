# Examples (`llm-schema-validator@1.3.0`)

Sample projects pinned to the latest **`llm-schema-validator`** release. They are **not** published to npm; copy or adapt them for your app.

| Example | Stack | Highlights |
|---------|-------|------------|
| **[nodejs-openai](./nodejs-openai/)** | Node + `tsx` | Offline: `fromZod`, `fromJsonSchema`, `coerce`, `validate`. Online: object + array **`query`**, **`onAttempt`**, **`onComplete`**, **`fewShot`**, **`promptTemplate`**, error handling |
| **[nestjs-openai](./nestjs-openai/)** | NestJS | **`GET /offline`** (adapters, no key), **`GET /demo`** (full **`query`** with hooks and metadata) |

Both use a small **`createOpenAIChatProvider`** helper so **`OPENAI_BASE_URL`** can target OpenAI, LM Studio, or any OpenAI-compatible Chat Completions server. For the hosted OpenAI API only, you can use the library’s built-in **`createOpenAIProvider(apiKey, model)`** instead (see main package README).

## License

Examples only (see each folder).
