import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  /** Calls the local LM Studio model and validates JSON with `llm-schema-validator`. */
  @Get('demo')
  runDemo() {
    return this.appService.runStructuredDemo();
  }
}
