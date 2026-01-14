import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHttpAdapter: any;

  beforeEach(async () => {
    mockHttpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/test'),
      reply: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: HttpAdapterHost,
          useValue: {
            httpAdapter: mockHttpAdapter,
          },
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
  });

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnThis(),
    getRequest: jest.fn(),
    getResponse: jest.fn(),
  };

  it('deve ser definido', () => {
    expect(filter).toBeDefined();
  });

  it('deve tratar HttpException corretamente', () => {
    const exception = new HttpException(
      'Mensagem de erro',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 400,
        message: 'Mensagem de erro',
        path: '/test',
      }),
      400,
    );
  });

  it('deve tratar erro genérico como 500', () => {
    const exception = new Error('Erro fatal');

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 500,
        message: 'Erro interno no servidor',
      }),
      500,
    );
  });
});
