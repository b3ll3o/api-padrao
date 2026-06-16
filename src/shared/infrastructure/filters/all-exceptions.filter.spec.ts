import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// BDD: features/autenticacao.feature:Cenário: Login com credenciais inválidas (mapeia 401)
// SDD: .openspec/changes/auth/design.md:REQ-AUTH-N03 (mapeamento centralizado de erros HTTP/Prisma)
// ATDD: test/all-exceptions.filter.spec.ts:cobre HttpException, P2002, P2025, fallback Fastify/Express
// TDD: src/shared/infrastructure/filters/all-exceptions.filter.spec.ts

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHttpAdapter: any;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(async () => {
    stderrWriteSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

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

  afterEach(() => {
    stderrWriteSpy.mockRestore();
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

  it('deve mapear Prisma P2002 (unique constraint) para 409', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['email'] } },
    );

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 409,
        message: "Conflito de dados: campo 'email' já existe.",
      }),
      409,
    );
  });

  it('deve mapear Prisma P2002 com target composto (array) para 409', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email', 'tenantId'] },
      },
    );

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 409,
        message: "Conflito de dados: campo 'email, tenantId' já existe.",
      }),
      409,
    );
  });

  it('deve mapear Prisma P2002 sem meta.target para 409 com placeholder', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 409,
        message: "Conflito de dados: campo 'campo' já existe.",
      }),
      409,
    );
  });

  it('deve mapear Prisma P2025 (not found) para 404', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: 'test' },
    );

    filter.catch(exception, mockArgumentsHost as any);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 404,
        message: 'Registro não encontrado.',
      }),
      404,
    );
  });

  it('deve escrever stack em stderr quando NODE_ENV=test e status>=500', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const exception = new Error('boom');

    try {
      filter.catch(exception, mockArgumentsHost as any);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL E2E ERROR'),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Path:'),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message: boom'),
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('NÃO escreve em stderr quando NODE_ENV != test (mesmo em 500)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    stderrWriteSpy.mockClear();
    const exception = new Error('boom');

    try {
      filter.catch(exception, mockArgumentsHost as any);
      // Filtra apenas o bloco "CRITICAL E2E ERROR" — logger.error do Nest
      // também escreve em stderr e isso é independente do NODE_ENV.
      const criticalWrites = stderrWriteSpy.mock.calls.filter((call) =>
        String(call[0]).includes('CRITICAL E2E ERROR'),
      );
      expect(criticalWrites).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('extrai message do response de HttpException quando getResponse().message existe', () => {
    const exception = new HttpException(
      { message: 'Mensagem estruturada', statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockArgumentsHost as any);
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ message: 'Mensagem estruturada' }),
      400,
    );
  });

  it('junta message[] de HttpException (ValidationPipe) em string única', () => {
    const exception = new HttpException(
      {
        message: ['email deve ser um e-mail válido', 'senha é obrigatória'],
        error: 'Bad Request',
        statusCode: 400,
      },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockArgumentsHost as any);
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        message: 'email deve ser um e-mail válido, senha é obrigatória',
        statusCode: 400,
      }),
      400,
    );
  });

  it('cai no fallback "Filter crashed" usando Fastify code() (sem status/send)', () => {
    mockHttpAdapter.reply.mockImplementation(() => {
      throw new Error('reply failed');
    });
    const code = jest.fn().mockReturnThis();
    const send = jest.fn();
    const response = { code, send };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    };
    const exception = new HttpException('x', 400);

    expect(() => filter.catch(exception, host as any)).not.toThrow();
    // Fastify puro: usa code() antes de send (caminho prioritário)
    expect(code).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Filter crashed' }),
    );
  });

  it('cai no fallback "filter crashed" se o httpAdapter.reply lança', () => {
    mockHttpAdapter.reply.mockImplementation(() => {
      throw new Error('reply failed');
    });
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    };
    const exception = new HttpException('x', 400);

    // Não deve lançar
    expect(() => filter.catch(exception, host as any)).not.toThrow();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Filter crashed' }),
    );
  });

  it('cai em "filter crashed" sem lançar quando response não tem status/send/code', () => {
    mockHttpAdapter.reply.mockImplementation(() => {
      throw new Error('reply failed');
    });
    const response = {}; // sem nenhum método
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    };
    const exception = new HttpException('x', 400);

    // Não deve lançar — apenas loga
    expect(() => filter.catch(exception, host as any)).not.toThrow();
  });
});
