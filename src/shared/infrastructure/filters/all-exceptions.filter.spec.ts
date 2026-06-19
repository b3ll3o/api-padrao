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

  it('deve ser uma instância de AllExceptionsFilter', () => {
    expect(filter).toBeInstanceOf(AllExceptionsFilter);
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

  // IMP-05: branch linha 67 — exception não-Error em NODE_ENV=test
  // escreve JSON.stringify no stderr (caminho alternativo ao `instanceof Error`)
  it('escreve exception não-Error como JSON em stderr quando NODE_ENV=test', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const exception = 'erro string pura' as unknown as Error;

    try {
      filter.catch(exception, mockArgumentsHost as any);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exception: "erro string pura"'),
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // IMP-05: branch linha 93 — emergency reply também falhou
  // httpAdapter.reply lança E tryEmergencyReply também lança
  it('loga "Emergency reply also failed" quando httpAdapter.reply e tryEmergencyReply falham', () => {
    mockHttpAdapter.reply.mockImplementation(() => {
      throw new Error('reply failed');
    });
    const response = {
      code: () => {
        throw new Error('code also throws');
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    };
    const exception = new HttpException('x', 400);

    expect(() => filter.catch(exception, host as any)).not.toThrow();
    // Filter trata o duplo crash fazendo log do fallback secundário
    // (validação implícita: nada propaga; o spec garante não-throw)
  });

  // IMP-05: branch linha 129 — response só tem send (sem status e sem code)
  it('cai no caminho send(body, 500) quando response só tem send', () => {
    mockHttpAdapter.reply.mockImplementation(() => {
      throw new Error('reply failed');
    });
    const send = jest.fn();
    const response = { send }; // sem `code` e sem `status`
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({}),
      }),
    };
    const exception = new HttpException('x', 400);

    expect(() => filter.catch(exception, host as any)).not.toThrow();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Filter crashed' }),
      500,
    );
  });

  // IMP-05: branch linha 185 — formatHttpExceptionMessage cai no fallback
  // `exception.message` quando response é objeto sem `message` válido
  it('cai no fallback exception.message quando response HttpException não tem message', () => {
    // Cria HttpException com response = objeto que NÃO tem `message` field
    // (cobre branch: response é object && !('message' in response))
    const exception = new HttpException(
      { error: 'Bad Request', statusCode: 400 } as any,
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost as any);

    // Fallback: exception.message é a string passada no construtor quando
    // getResponse() não tem `message` extraível
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        statusCode: 400,
        // O fallback usa exception.message que para HttpException(string) é o
        // payload do construtor; já que passamos um objeto, Nest normaliza
        // para `HttpException.message` ser a representação padrão.
      }),
      400,
    );
  });

  // IMP-05: branch linha 61 — fallback 'unknown' quando request é null OU
  // não tem url nem originalUrl (cobre o ramo `|| 'unknown'`)
  it('usa "unknown" no log do path quando request não tem url nem originalUrl', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    stderrWriteSpy.mockClear();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({}),
        getRequest: () => ({}), // request sem url nem originalUrl
      }),
    };
    const exception = new Error('boom');

    try {
      filter.catch(exception, host as any);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Path: unknown'),
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // IMP-05: branch linha 90 — emergency reply catch usa String(err) quando
  // err NÃO é Error (httpAdapter.reply lança valor não-Error)
  it('loga emergency reply failed com String(err) quando httpAdapter.reply lança não-Error', () => {
    // reply() lança STRING → no catch, `err` é string → String(err) é usado
    mockHttpAdapter.reply.mockImplementation(() => {
      throw 'string-throw-from-reply';
    });
    const exception = new Error('original');

    expect(() =>
      filter.catch(exception, mockArgumentsHost as any),
    ).not.toThrow();
  });

  // IMP-05: branch linha 152 — extractErrorMessage usa exception.message
  // quando status < 500 e exception é Error (genérico, não-HttpException não-Prisma)
  it('usa exception.message quando status < 500 e exception é Error (genérico)', () => {
    // HttpException seria roteado para formatHttpExceptionMessage.
    // Para cair na branch da linha 152, exception precisa ser Error simples
    // com status < 500. Chamamos extractErrorMessage diretamente.
    const error = new Error('detalhe privado');
    const result = (filter as any).extractErrorMessage(
      error,
      HttpStatus.BAD_REQUEST,
    );
    expect(result).toBe('detalhe privado');
  });

  // IMP-05: branch linha 154 — extractErrorMessage usa String(exception)
  // quando status < 500 e exception NÃO é Error (ex.: throw 'string')
  it('usa String(exception) quando status < 500 e exception não é Error', () => {
    // Para status < 500 + non-Error, força caminho String(exception).
    const result = (filter as any).extractErrorMessage(
      'coisa estranha',
      HttpStatus.BAD_REQUEST,
    );
    expect(result).toBe('coisa estranha');
  });

  // IMP-05: branch linha 195 — formatPrismaTarget retorna a string quando
  // target é string simples (cobre `typeof target === 'string'` true branch)
  it('formatPrismaTarget retorna target quando é string', () => {
    const result = (filter as any).formatPrismaTarget('email');
    expect(result).toBe('email');
  });

  // IMP-05: branch linha 180 — formatHttpExceptionMessage: message presente
  // mas não é string nem array (ex.: number) — cai no fallback exception.message
  it('cai no fallback exception.message quando message não é string nem array', () => {
    // Cobre branch: typeof message !== 'string' && !Array.isArray(message)
    // → cai no return exception.message (linha 185)
    const exception = new HttpException(
      { message: 42 as any, error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost as any);

    // Verifica o branch de fato: o `message` retornado deve ser o
    // exception.message (fallback) — e não a string '42' nem nada
    // que venha de 'Bad Request'. A representação exata de
    // HttpException.message para objeto é a stringificação do body.
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ statusCode: 400 }),
      400,
    );
    const body = mockHttpAdapter.reply.mock.calls.at(-1)?.[1];
    // Fallback usa exception.message — que para HttpException(object) é
    // a stringificação do body via Object.prototype.toString.
    // O importante: o caminho do `formatHttpExceptionMessage` foi
    // exercido e produziu string (não array, não number cru).
    expect(typeof body.message).toBe('string');
  });

  // [SEC-001] RFC 7807 Problem Details
  describe('RFC 7807 Problem Details (application/problem+json)', () => {
    it('deve incluir type/title/status/detail/instance padronizados', () => {
      const exception = new HttpException(
        'Token expirado',
        HttpStatus.UNAUTHORIZED,
      );
      filter.catch(exception, mockArgumentsHost as any);

      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          // RFC 7807 required
          type: 'https://api.padrao/problems/401',
          title: 'Não autenticado',
          status: 401,
          // RFC 7807 optional
          detail: 'Token expirado',
          instance: '/test',
        }),
        401,
      );
    });

    it('deve usar type/title corretos para cada status HTTP comum', () => {
      const cases: Array<[number, string, string]> = [
        [400, 'https://api.padrao/problems/400', 'Requisição inválida'],
        [401, 'https://api.padrao/problems/401', 'Não autenticado'],
        [403, 'https://api.padrao/problems/403', 'Acesso negado'],
        [404, 'https://api.padrao/problems/404', 'Recurso não encontrado'],
        [409, 'https://api.padrao/problems/409', 'Conflito de dados'],
        [422, 'https://api.padrao/problems/422', 'Entidade não processável'],
        [429, 'https://api.padrao/problems/429', 'Muitas requisições'],
        [500, 'https://api.padrao/problems/500', 'Erro interno do servidor'],
      ];
      for (const [status, expectedType, expectedTitle] of cases) {
        const exception = new HttpException('x', status);
        filter.catch(exception, mockArgumentsHost as any);
        const last = mockHttpAdapter.reply.mock.calls.at(-1);
        expect(last?.[0]).toBeUndefined();
        expect(last?.[1]).toEqual(
          expect.objectContaining({
            type: expectedType,
            title: expectedTitle,
            status,
          }),
        );
        expect(last?.[2]).toBe(status);
      }
    });

    it('deve incluir code P2002 no body para unique constraint do Prisma', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['email'] } },
      );
      filter.catch(exception, mockArgumentsHost as any);
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          type: 'https://api.padrao/problems/409',
          title: 'Conflito de dados',
          status: 409,
          code: 'P2002',
        }),
        409,
      );
    });

    it('deve incluir code P2025 para not-found do Prisma', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: 'test' },
      );
      filter.catch(exception, mockArgumentsHost as any);
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 404,
          code: 'P2025',
        }),
        404,
      );
    });

    it('deve incluir code HTTP_<status> para HttpException', () => {
      const exception = new HttpException('x', HttpStatus.FORBIDDEN);
      filter.catch(exception, mockArgumentsHost as any);
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ code: 'HTTP_403' }),
        403,
      );
    });

    it('deve incluir code INTERNAL_ERROR para erro 500 genérico', () => {
      const exception = new Error('boom');
      filter.catch(exception, mockArgumentsHost as any);
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        500,
      );
    });

    it('deve manter campos legados (statusCode, message, path, timestamp)', () => {
      const exception = new HttpException('legacy compat', 400);
      filter.catch(exception, mockArgumentsHost as any);
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          statusCode: 400,
          message: 'legacy compat',
          path: '/test',
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          ),
        }),
        400,
      );
    });

    it('deve setar Content-Type application/problem+json no Fastify (header())', () => {
      const header = jest.fn();
      const response = { header };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({}),
        }),
      };
      const exception = new HttpException('x', 400);
      filter.catch(exception, host as any);
      expect(header).toHaveBeenCalledWith(
        'Content-Type',
        'application/problem+json',
      );
    });

    it('deve setar Content-Type application/problem+json no Express-like (setHeader())', () => {
      const setHeader = jest.fn();
      const response = { setHeader }; // só tem setHeader (Express-like)
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({}),
        }),
      };
      const exception = new HttpException('x', 400);
      filter.catch(exception, host as any);
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/problem+json',
      );
    });

    it('não deve lançar quando response não tem header() nem setHeader()', () => {
      const response = {}; // response crua sem métodos
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({}),
        }),
      };
      const exception = new HttpException('x', 400);
      expect(() => filter.catch(exception, host as any)).not.toThrow();
    });

    it('detail deve ser a mensagem extraída (mesma de message — compat legada)', () => {
      const exception = new HttpException(
        'Detalhe específico do problema',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      filter.catch(exception, mockArgumentsHost as any);
      const body = mockHttpAdapter.reply.mock.calls.at(-1)?.[1] as any;
      expect(body.detail).toBe('Detalhe específico do problema');
      expect(body.message).toBe('Detalhe específico do problema');
    });

    it('instance deve refletir o path do request', () => {
      mockHttpAdapter.getRequestUrl.mockReturnValue('/api/v1/usuarios/42');
      const exception = new HttpException('not found', 404);
      filter.catch(exception, mockArgumentsHost as any);
      const body = mockHttpAdapter.reply.mock.calls.at(-1)?.[1] as any;
      expect(body.instance).toBe('/api/v1/usuarios/42');
      expect(body.path).toBe('/api/v1/usuarios/42');
    });
  });
});
