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
          : HttpStatus.INTERNAL_SERVER_ERROR;

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
        message:
          exception instanceof HttpException
            ? (exception.getResponse() as any).message || exception.message
            : 'Erro interno no servidor',
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
}
