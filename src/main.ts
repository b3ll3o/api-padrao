// IMPORTANT: This MUST be the very first import in your application!
import './instrument';
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

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true }, // Buffer logs until the logger is attached
  );

  // Use pino logger
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // Security: Helmet
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      },
    },
  });

  // Security: CORS
  const isProduction = configService.get('NODE_ENV') === 'production';
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
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document, {
    jsonDocumentUrl: 'swagger-json',
  });

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port, '0.0.0.0'); // Listen on all interfaces
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
