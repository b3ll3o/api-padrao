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
//
// [SEC-001] RFC 7807 Problem Details for HTTP APIs (application/problem+json).
// Body inclui AMBOS os campos legados (`statusCode`, `message`, `path`, `timestamp`)
// E os campos padronizados (`type`, `title`, `detail`, `instance`) para
// conformidade com clientes que esperam qualquer um dos formatos.
// Content-Type fixado em `application/problem+json` quando o adapter permite.

interface AdapterResponse {
  status?: (code: number) => { send: (body: unknown) => void };
  code?: (code: number) => { send: (body: unknown) => void };
  send?: (body: unknown, code?: number) => void;
  header?: (name: string, value: string) => unknown;
  setHeader?: (name: string, value: string) => unknown;
}

/**
 * Tipo-base para um RFC 7807 problem document.
 * Campos `type` (URI), `title` (curto), `status` (number), `detail` (humano)
 * e `instance` (URI relativa à ocorrência) são definidos na RFC; extensões
 * (como `timestamp`, `path`, `errors[]`, `code`) podem coexistir.
 *
 * Mantemos também `statusCode`, `message`, `path` e `timestamp` para
 * compatibilidade com clientes que ainda consomem o schema legado.
 */
export interface ProblemDetails {
  // RFC 7807 required
  type: string;
  title: string;
  status: number;
  // RFC 7807 optional
  detail?: string;
  instance?: string;
  // Compat legada
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
  // Extensões
  code?: string;
  errors?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    try {
      const { httpAdapter } = this.httpAdapterHost;
      const ctx = host.switchToHttp();
      const response = ctx.getResponse() as AdapterResponse;
      const request = ctx.getRequest();

      const httpStatus =
        exception instanceof HttpException
          ? exception.getStatus()
          : this.mapPrismaErrorToStatus(exception);

      const detail = this.extractErrorMessage(exception, httpStatus);
      const requestPath = httpAdapter.getRequestUrl(request);

      if (httpStatus >= 500) {
        this.logger.error(
          `Critical Error at ${requestPath}: ${
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

      // RFC 7807: monta o body com campos padronizados + legado
      const problem: ProblemDetails = {
        // Campos RFC 7807
        type: this.problemTypeFor(httpStatus),
        title: this.problemTitleFor(httpStatus),
        status: httpStatus,
        detail,
        instance: requestPath,
        // Campos legados (compat)
        statusCode: httpStatus,
        message: detail,
        path: requestPath,
        timestamp: new Date().toISOString(),
        // Extensões úteis
        code: this.errorCodeFor(exception, httpStatus),
      };

      // Content-Type application/problem+json (RFC 7807 §6.1)
      // Tenta `header()` (Fastify), depois `setHeader()` (Express-like).
      // Se a response for undefined ou não tiver nenhum dos métodos,
      // prossegue sem erro (httpAdapter pode aplicar o content-type default).
      const responseAny = response as
        | (AdapterResponse & {
            header?: (name: string, value: string) => unknown;
          })
        | undefined;
      if (responseAny && typeof responseAny.header === 'function') {
        responseAny.header('Content-Type', 'application/problem+json');
      } else if (responseAny && typeof responseAny.setHeader === 'function') {
        responseAny.setHeader('Content-Type', 'application/problem+json');
      }

      httpAdapter.reply(response, problem, httpStatus);
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

  /**
   * RFC 7807 §4.2 — `type` deve ser uma URI que identifica o tipo de problema.
   * Usa-se o `https://api.padrao/problems/{status}` como convenção interna
   * para que clientes possam fazer dispatch pelo type.
   */
  private problemTypeFor(status: number): string {
    return `https://api.padrao/problems/${status}`;
  }

  /**
   * RFC 7807 §4.2 — `title` é um resumo legível por humanos, específico do
   * `type`, e NÃO deve mudar entre ocorrências (exceto tradução).
   */
  private problemTitleFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Requisição inválida';
      case HttpStatus.UNAUTHORIZED:
        return 'Não autenticado';
      case HttpStatus.FORBIDDEN:
        return 'Acesso negado';
      case HttpStatus.NOT_FOUND:
        return 'Recurso não encontrado';
      case HttpStatus.CONFLICT:
        return 'Conflito de dados';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Entidade não processável';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Muitas requisições';
      default:
        return status >= 500
          ? 'Erro interno do servidor'
          : 'Erro na requisição';
    }
  }

  /**
   * Código de máquina (não RFC 7807, extensão) — útil para clientes que
   * querem tomar decisão programática (ex.: "P2002" para unique constraint).
   */
  private errorCodeFor(exception: unknown, status: number): string {
    if (this.isPrismaError(exception, 'P2002')) return 'P2002';
    if (this.isPrismaError(exception, 'P2025')) return 'P2025';
    if (exception instanceof HttpException) return `HTTP_${status}`;
    if (status >= 500) return 'INTERNAL_ERROR';
    return 'CLIENT_ERROR';
  }
}
