import { Test, TestingModule } from '@nestjs/testing';
import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggingInterceptor],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeDefined();
  });

  it('deve logar o método, url, status code e tempo de resposta', (done) => {
    const mockRequest = {
      method: 'GET',
      url: '/test-url',
    };
    const mockResponse = {
      statusCode: 200,
    };

    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('test-response')),
    } as CallHandler;

    const loggerSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringMatching(/GET \/test-url 200 - \d+ms/),
        );
        done();
      },
    });
  });
});
