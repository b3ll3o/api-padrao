import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('NODE_ENV:', process.env.NODE_ENV); // Added this line

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
      - Porta: ${process.env.PORT ?? 3000}
      - Versão: 1.0.0
      - Ambiente: ${process.env.NODE_ENV ?? 'development'}
      
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
    .addServer('http://localhost:3000', 'Local')
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
  SwaggerModule.setup('swagger', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
