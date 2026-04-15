import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const mockAppService = {
    getHealth: jest.fn().mockReturnValue({
      status: 'ok',
      message: 'test',
    }),
    runOfflineAdapterDemos: jest.fn().mockReturnValue({
      jsonSchemaFieldCount: 1,
      zodCoerced: { name: 'x', n: 1 },
      validationSample: [],
    }),
    runStructuredDemo: jest.fn().mockResolvedValue({
      success: true,
      attempts: 1,
      errors: [],
      durationMs: 1,
      data: { topic: 't', bullets: ['a', 'b'] },
      hookTrace: { onCompleteFired: true, attemptEvents: 1 },
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns health payload', () => {
    expect(appController.getHealth()).toEqual({
      status: 'ok',
      message: 'test',
    });
  });

  it('delegates demo to service', async () => {
    const r = await appController.runDemo();
    expect(mockAppService.runStructuredDemo).toHaveBeenCalled();
    expect(r.success).toBe(true);
  });

  it('delegates offline to service', () => {
    const r = appController.offline();
    expect(mockAppService.runOfflineAdapterDemos).toHaveBeenCalled();
    expect(r.jsonSchemaFieldCount).toBe(1);
  });
});
