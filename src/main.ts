import './tracing';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';

// [Sprint1-HTTP] Trust proxy — MUST be set on the FastifyAdapter constructor
// (read at instance construction; cannot be changed via register()).
// Reading process.env directly because ConfigService isn't available yet.
const rawTrustProxy = process.env['TRUST_PROXY'] ?? 'loopback';
const trustProxy: true | 'loopback' | number =
  rawTrustProxy === 'true'
    ? true
    : rawTrustProxy === 'loopback'
      ? 'loopback'
      : (() => {
          const n = parseInt(rawTrustProxy, 10);
          return Number.isFinite(n) && n >= 0 ? n : 'loopback';
        })();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy }),
    { bufferLogs: true }, // Buffer logs until the logger is attached
  );

  // Use pino logger
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // [BAI-001] Compressão gzip/br — registrado ANTES do helmet para
  // garantir que respostas grandes (Swagger, listagens paginadas) sejam
  // comprimidas. Threshold 1024 bytes evita comprimir payloads pequenos
  // onde o overhead do gzip supera o benefício.
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'br', 'deflate'],
  });

  // Security: Helmet
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  const isProduction = configService.get('NODE_ENV') === 'production';

  // [BAI-002] CSP strict: desabilitamos Swagger em produção para
  // permitir uma CSP sem `'unsafe-inline'` em `scriptSrc` (o Swagger UI
  // injeta `<script>` inline para o bundle do React). Em dev/test
  // mantemos a CSP permissiva com `'unsafe-inline'` apenas para que
  // o Swagger UI funcione sem complexidade de nonce.
  await app.register(helmet, {
    contentSecurityPolicy: isProduction
      ? {
          // CSP strict em produção: zero inline, zero eval. Como
          // Swagger fica desabilitado, não precisamos de `'unsafe-inline'`.
          directives: {
            defaultSrc: [`'self'`],
            styleSrc: [`'self'`, `'unsafe-inline'`], // helmet/serializer de erros
            imgSrc: [`'self'`, 'data:'],
            scriptSrc: [`'self'`],
            connectSrc: [`'self'`],
            frameAncestors: [`'none'`],
            formAction: [`'self'`],
            baseUri: [`'self'`],
            objectSrc: [`'none'`],
            upgradeInsecureRequests: [],
          },
        }
      : {
          // CSP permissiva em dev/test para o Swagger UI funcionar.
          directives: {
            defaultSrc: [`'self'`],
            styleSrc: [`'self'`, `'unsafe-inline'`],
            imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
            scriptSrc: [`'self'`, `'unsafe-inline'`],
          },
        },
  });

  // Security: CORS
  app.enableCors({
    origin: isProduction
      ? configService.get<string>('ALLOWED_ORIGINS')?.split(',') || false
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-empresa-id',
      'x-request-id',
    ],
  });

  logger.log(`NODE_ENV: ${configService.get('NODE_ENV')}`);

  // Add global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically remove properties that are not defined in the DTO
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('API Padrão')
    .setDescription(
      `
      API RESTful desenvolvida com NestJS, utilizando Prisma como ORM e PostgreSQL como banco de dados.
      
      ## Recursos
      - Autenticação JWT com perfis e permissões
      - Gerenciamento de Usuários com múltiplos perfis
      - Gerenciamento de Perfis com código único e descrição
      - Gerenciamento de Permissões com código único e descrição
      - Paginação em todos os endpoints de listagem
      - Documentação completa com Swagger/OpenAPI
      
      ## Configurações
      - Porta: 3001
      - Versão: 1.0.0
      - Ambiente: ${configService.get('NODE_ENV')}
      
      ## Autenticação
      A API utiliza autenticação JWT (Bearer Token) para proteger os endpoints.
      Para obter um token, utilize o endpoint /auth/login.
    `,
    )
    .setVersion('1.0.0')
    .setContact(
      'API Padrão Team',
      'https://github.com/b3ll3o/api-padrao',
      'contato@email.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3001', 'Local')
    .addServer('https://api-padrao-dev.example.com', 'Development')
    .addServer('https://api-padrao.example.com', 'Production')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .addTag('Autenticação', 'Endpoints relacionados à autenticação')
    .addTag('Usuários', 'Gerenciamento de usuários do sistema')
    .addTag('Perfis', 'Gerenciamento de perfis de acesso')
    .addTag('Permissões', 'Gerenciamento de permissões do sistema')
    .build();
  // [BAI-002] Swagger só fica disponível fora de produção.
  // Em produção a documentação interativa é omitida para permitir
  // uma CSP estrita (sem `'unsafe-inline'` em `script-src`). O JSON
  // também é ocultado — quem precisar de contrato lê o OpenAPI do
  // repositório. Em dev/test o setup roda normalmente.
  if (!isProduction) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document, {
      jsonDocumentUrl: 'swagger-json',
    });
  } else {
    logger.log('Swagger UI desabilitado em produção (BAI-002).');
  }

  const port = configService.get<number>('PORT') ?? 3001;

  // [Sprint2-Shutdown] enableShutdownHooks: garante que NestJS escuta
  // sinais de OS (SIGTERM/SIGINT) e dispara o ciclo de vida
  // onApplicationShutdown em providers registrados. Sem isso, jobs
  // BullMQ em vôo podem ser perdidos em deploys (docker stop /
  // kubectl rollout) — Redis perde estado de progresso e conexões
  // Prisma/Redis são fechadas abruptamente.
  app.enableShutdownHooks();

  // [Sprint2-Shutdown] Graceful shutdown: ao receber SIGTERM,
  // logamos o início e garantimos que `app.close()` é awaited
  // (com timeout de 30s) para fechar BullMQ workers, Prisma, Redis.
  const shutdown = async (signal: NodeJS.Signals) => {
    logger.log(`Sinal ${signal} recebido, iniciando graceful shutdown...`);
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('shutdown timeout 30s')), 30000),
        ),
      ]);
      logger.log('Graceful shutdown concluído.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Falha no graceful shutdown');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(port, '0.0.0.0'); // Listen on all interfaces
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
