import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// BDD: features/autenticacao.feature:Cenário: Login com credenciais inválidas (mapeia 401)
// SDD: .openspec/changes/auth/design.md:REQ-AUTH-N03 (mapeamento centralizado de erros HTTP/Prisma)
// ATDD: test/all-exceptions.filter.spec.ts:cobre HttpException, P2002, P2025, fallback Fastify/Express
// TDD: src/shared/infrastructure/filters/all-exceptions.filter.spec.ts

/**
 * Resposta mínima aceita pelo filter em todos os adapters suportados.
 * - Express-like: `response.status(code).send(body)`
 * - Fastify: `response.code(code).send(body)` (não expõe `status`)
 * - Legado: `response.send(body, code)` (alguns testes/mocks)
 */
interface AdapterResponse {
  status?: (code: number) => { send: (body: unknown) => void };
  code?: (code: number) => { send: (body: unknown) => void };
  send?: (body: unknown, code?: number) => void;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    try {
      const { httpAdapter } = this.httpAdapterHost;
      const ctx = host.switchToHttp();
      const response = ctx.getResponse();
      const request = ctx.getRequest();

      const httpStatus =
        exception instanceof HttpException
          ? exception.getStatus()
          : this.mapPrismaErrorToStatus(exception);

      const message = this.extractErrorMessage(exception, httpStatus);

      if (httpStatus >= 500) {
        // Log critical errors in all environments to the logger
        this.logger.error(
          `Critical Error at ${httpAdapter.getRequestUrl(request)}: ${
            exception instanceof Error ? exception.message : String(exception)
          }`,
          exception instanceof Error ? exception.stack : undefined,
        );

        if (process.env.NODE_ENV === 'test') {
          process.stderr.write('\n--- CRITICAL E2E ERROR ---\n');
          process.stderr.write(
            `Path: ${(request && (request.url || request.originalUrl)) || 'unknown'}\n`,
          );
          if (exception instanceof Error) {
            process.stderr.write(`Message: ${exception.message}\n`);
            process.stderr.write(`Stack: ${exception.stack}\n`);
          } else {
            process.stderr.write(
              `Exception: ${JSON.stringify(exception, null, 2)}\n`,
            );
          }
          process.stderr.write('---------------------------\n');
        }
      }

      const responseBody = {
        statusCode: httpStatus,
        timestamp: new Date().toISOString(),
        path: httpAdapter.getRequestUrl(request),
        message,
      };

      httpAdapter.reply(response, responseBody, httpStatus);
    } catch (err) {
      // Se httpAdapter falhar (request já enviada, adapter desconhecido etc.)
      // tenta uma resposta de emergência que funcione em ambos os adapters.
      this.logger.error(`Exception filter crashed: ${err}`);
      try {
        this.tryEmergencyReply(host, {
          message: 'Filter crashed',
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (fallbackErr) {
        this.logger.error(
          `Emergency reply also failed: ${String(fallbackErr)}`,
        );
      }
    }
  }

  /**
   * Tenta enviar uma resposta de emergência.
   *
   * Ordem dos caminhos (verificada contra Fastify e Express):
   * 1. `code()` (Fastify — NÃO tem `status` mas tem `code`)
   * 2. `status()` (Express-like)
   * 3. `send(body, code)` (legado)
   *
   * Nota: testes anteriores caíam no caminho `send(body, code)` em vez do
   * `code()` do Fastify porque a ordem estava invertida. Veja
   * `all-exceptions.filter.spec.ts` › "usa code() no Fastify".
   */
  private tryEmergencyReply(
    host: ArgumentsHost,
    body: Record<string, unknown>,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse() as AdapterResponse;

    if (typeof response.code === 'function') {
      // Fastify
      response.code(500).send(body);
      return;
    }
    if (typeof response.status === 'function') {
      response.status(500).send(body);
      return;
    }
    if (typeof response.send === 'function') {
      response.send(body, 500);
    }
  }

  private mapPrismaErrorToStatus(exception: unknown): number {
    if (this.isPrismaError(exception, 'P2002')) return HttpStatus.CONFLICT;
    if (this.isPrismaError(exception, 'P2025')) return HttpStatus.NOT_FOUND;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private extractErrorMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      return this.formatHttpExceptionMessage(exception);
    }
    if (this.isPrismaError(exception, 'P2002')) {
      const target = this.formatPrismaTarget(exception.meta?.target);
      return `Conflito de dados: campo '${target}' já existe.`;
    }
    if (this.isPrismaError(exception, 'P2025')) {
      return 'Registro não encontrado.';
    }
    return status >= 500
      ? 'Erro interno no servidor'
      : exception instanceof Error
        ? exception.message
        : String(exception);
  }

  /**
   * Extrai a mensagem de uma `HttpException` tratando todas as formas que o
   * NestJS pode retornar: `string`, `{ message: string | string[] }`, ou um
   * `response` arbitrário. Quando `message` é um array (caso típico de
   * `ValidationPipe`), junta com vírgula para preservar a info sem quebrar
   * consumidores que esperam `string`.
   */
  private formatHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = (response as { message: unknown }).message;
      if (Array.isArray(message)) {
        return message.map((m) => String(m)).join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return exception.message;
  }

  /**
   * Formata o campo `target` de um erro Prisma `P2002` (unique constraint).
   * Pode vir como `string`, `string[]` (unique composta), `undefined` (sem
   * metadata) ou `null`. Evita o loss silencioso de `String(target)` quando
   * target é um array, que produziria `"email,nome"` em vez de `"email, nome"`.
   */
  private formatPrismaTarget(target: unknown): string {
    if (typeof target === 'string') return target;
    if (Array.isArray(target)) {
      return target.map((t) => String(t)).join(', ');
    }
    return 'campo';
  }

  private isPrismaError(
    exception: unknown,
    code: 'P2002' | 'P2025',
  ): exception is Prisma.PrismaClientKnownRequestError {
    return (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === code
    );
  }
}
