import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';

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
        // Log critical errors in all environments to Sentry
        Sentry.captureException(exception);

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
      console.error('FILTER CRASHED:', err);
      // Fallback for emergency
      const ctx = host.switchToHttp();
      const response = ctx.getResponse() as any;
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

  private mapPrismaErrorToStatus(exception: any): number {
    if (exception.code === 'P2002') return HttpStatus.CONFLICT;
    if (exception.code === 'P2025') return HttpStatus.NOT_FOUND;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private extractErrorMessage(exception: any, status: number): string {
    if (exception instanceof HttpException) {
      return (exception.getResponse() as any).message || exception.message;
    }
    if (exception.code === 'P2002') {
      return `Conflito de dados: campo '${exception.meta?.target}' já existe.`;
    }
    if (exception.code === 'P2025') {
      return 'Registro não encontrado.';
    }
    return status >= 500 ? 'Erro interno no servidor' : exception.message;
  }
}
