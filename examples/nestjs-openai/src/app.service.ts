import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defineSchema, query } from 'llm-schema-validator';
import { createOpenAIChatProvider } from './openai/openai-chat.provider';

const demoSchema = defineSchema({
  topic: { type: 'string', required: true, description: 'Short title for the content' },
  bullets: {
    type: 'array',
    required: true,
    itemType: 'string',
    minItems: 2,
    maxItems: 5,
    description: 'Key bullet points',
  },
});

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  getHealth(): { status: string; message: string } {
    return {
      status: 'ok',
      message:
        'NestJS + llm-schema-validator. Call GET /demo with OPENAI_* env vars (see .env.example).',
    };
  }

  /** Schema-guided `query()` using the **`openai`** package against your configured Chat Completions endpoint. */
  async runStructuredDemo() {
    const baseURL = this.config.getOrThrow<string>('OPENAI_BASE_URL');
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const apiKey = this.config.get<string>('OPENAI_API_KEY', 'sk-local');

    const provider = createOpenAIChatProvider({
      baseURL,
      apiKey,
      model,
    });

    return query({
      prompt:
        'Read this text and return JSON matching the schema. Text: ' +
        '"The official OpenAI Node SDK accepts baseURL so you can target OpenAI or compatible Chat Completions servers."',
      schema: demoSchema,
      provider,
      maxRetries: 3,
      providerTimeoutMs: 120_000,
    });
  }
}
