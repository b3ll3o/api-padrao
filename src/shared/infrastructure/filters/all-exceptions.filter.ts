import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

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
      this.logger.error(`Exception filter crashed: ${err}`);
      // Fallback para Fastify (response.code) e Express-like adapters (response.status/send).
      const ctx = host.switchToHttp();
      const response = ctx.getResponse() as {
        status?: (code: number) => { send: (body: unknown) => void };
        send?: (body: unknown, code?: number) => void;
        code?: (code: number) => { send: (body: unknown) => void };
      };
      if (typeof response.status === 'function') {
        response
          .status(500)
          .send({ message: 'Filter crashed', error: String(err) });
      } else if (typeof response.send === 'function') {
        response.send({ message: 'Filter crashed', error: String(err) }, 500);
      } else if (typeof response.code === 'function') {
        // Fastify
        response
          .code(500)
          .send({ message: 'Filter crashed', error: String(err) });
      }
    }
  }

  private mapPrismaErrorToStatus(exception: unknown): number {
    if (this.hasPrismaCode(exception, 'P2002')) return HttpStatus.CONFLICT;
    if (this.hasPrismaCode(exception, 'P2025')) return HttpStatus.NOT_FOUND;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private extractErrorMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const responseMessage =
        typeof response === 'object' &&
        response !== null &&
        'message' in response
          ? (response as { message?: unknown }).message
          : undefined;
      return typeof responseMessage === 'string'
        ? responseMessage
        : exception.message;
    }
    if (this.hasPrismaCode(exception, 'P2002')) {
      const target = (exception.meta as Record<string, unknown> | undefined)
        ?.target;
      return `Conflito de dados: campo '${String(target)}' já existe.`;
    }
    if (this.hasPrismaCode(exception, 'P2025')) {
      return 'Registro não encontrado.';
    }
    return status >= 500
      ? 'Erro interno no servidor'
      : exception instanceof Error
        ? exception.message
        : String(exception);
  }

  private hasPrismaCode(
    exception: unknown,
    code: string,
  ): exception is { code: string; meta?: Record<string, unknown> } {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code: unknown }).code === code
    );
  }
}
