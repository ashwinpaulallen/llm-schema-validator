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
    runStructuredDemo: jest.fn().mockResolvedValue({
      success: true,
      attempts: 1,
      errors: [],
      data: { topic: 't', bullets: ['a', 'b'] },
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
});
