import { config } from 'dotenv';
import { defineSchema, query } from 'llm-schema-validator';
import { createOpenAIChatProvider } from './openai/openai-chat.provider.js';

config({ path: ['.env.local', '.env'] });

const schema = defineSchema({
  title: { type: 'string', required: true },
  tags: {
    type: 'array',
    required: true,
    itemType: 'string',
    minItems: 1,
    maxItems: 6,
  },
});

async function main() {
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  if (!baseURL || !model) {
    console.error('Set OPENAI_BASE_URL and OPENAI_MODEL (see .env.example).');
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY ?? 'sk-local';
  const provider = createOpenAIChatProvider({ baseURL, apiKey, model });

  const result = await query({
    prompt:
      'Return JSON for this note: "Use the OpenAI SDK with OPENAI_BASE_URL for OpenAI or compatible Chat Completions endpoints."',
    schema,
    provider,
    maxRetries: 3,
    providerTimeoutMs: 120_000,
  });

  if (result.success) {
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.error('Validation did not succeed:', result.errors);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
