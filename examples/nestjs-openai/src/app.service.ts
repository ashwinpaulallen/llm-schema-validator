import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  coerce,
  defineSchema,
  fromJsonSchema,
  fromZod,
  query,
  validate,
  type QueryResult,
} from 'llm-schema-validator';
import { z } from 'zod';
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
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly config: ConfigService) {}

  getHealth(): { status: string; message: string } {
    return {
      status: 'ok',
      message:
        'NestJS + llm-schema-validator@1.3.0. GET /offline (no API), GET /demo (needs OPENAI_*).',
    };
  }

  /** Offline: `fromJsonSchema`, `fromZod`, `coerce`, `validate` — no API key. */
  runOfflineAdapterDemos(): {
    jsonSchemaFieldCount: number;
    zodCoerced: Record<string, unknown>;
    validationSample: ReturnType<typeof validate>;
  } {
    const js = fromJsonSchema({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    });
    const zBacked = fromZod(z.object({ name: z.string(), n: z.number().int() }));
    const row = coerce({ name: 'test', n: '7' }, zBacked);
    return {
      jsonSchemaFieldCount: Object.keys(js).length,
      zodCoerced: row,
      validationSample: validate(row, zBacked),
    };
  }

  /**
   * Schema-guided `query()` with **`llm-schema-validator@1.3.0`** features:
   * `systemPrompt`, `fewShot`, `onAttempt`, `onComplete`, `logLevel`, `providerTimeoutMs`, `promptTemplate`.
   */
  async runStructuredDemo(): Promise<
    QueryResult<unknown> & { hookTrace?: { onCompleteFired: boolean; attemptEvents: number } }
  > {
    const baseURL = this.config.getOrThrow<string>('OPENAI_BASE_URL');
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const apiKey = this.config.get<string>('OPENAI_API_KEY', 'sk-local');

    const provider = createOpenAIChatProvider({
      baseURL,
      apiKey,
      model,
    });

    let onCompleteFired = false;
    let attemptEvents = 0;

    const result = await query({
      prompt:
        'Read this text and return JSON matching the schema. Text: ' +
        '"The official OpenAI Node SDK accepts baseURL so you can target OpenAI or compatible Chat Completions servers."',
      schema: demoSchema,
      provider,
      systemPrompt: 'Reply with JSON only; follow the schema in the user message.',
      fewShot: [
        {
          input: 'Summarize: "Type safety helps large teams."',
          output: {
            topic: 'Type safety',
            bullets: ['Teams', 'Scale', 'Maintenance'],
          },
        },
      ],
      maxRetries: 3,
      providerTimeoutMs: 120_000,
      logLevel: 'info',
      promptTemplate: (ctx) =>
        ctx.isRetry ? `[Retry ${ctx.attempt}/${ctx.maxAttempts}]\n${ctx.builtPrompt}` : ctx.builtPrompt,
      onAttempt: () => {
        attemptEvents += 1;
      },
      onComplete: (sum) => {
        onCompleteFired = true;
        this.logger.log(
          `onComplete: success=${sum.success} attempts=${sum.attempts} durationMs=${sum.durationMs}`,
        );
      },
    });

    return { ...result, hookTrace: { onCompleteFired, attemptEvents } };
  }
}
