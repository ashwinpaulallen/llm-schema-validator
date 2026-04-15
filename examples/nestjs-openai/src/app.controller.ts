import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  /** `fromJsonSchema` / `fromZod` / `coerce` / `validate` — no LLM, no env beyond defaults. */
  @Get('offline')
  offline() {
    return this.appService.runOfflineAdapterDemos();
  }

  /** Full `query()` demo with hooks and metadata (`usage`, `durationMs` on the result). Needs `OPENAI_*`. */
  @Get('demo')
  runDemo() {
    return this.appService.runStructuredDemo();
  }
}
