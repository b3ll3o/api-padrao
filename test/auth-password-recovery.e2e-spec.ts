import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';

/**
 * Testes E2E do fluxo de Recuperação de Senha (US-AUTH-101).
 *
 * Cobre:
 * - POST /auth/forgot-password retorna 200 (e-mail existente)
 * - POST /auth/forgot-password retorna 200 (e-mail inexistente, anti-enumeração)
 * - POST /auth/reset-password com token válido retorna 200
 * - POST /auth/reset-password com token inválido retorna 401
 */
describe('AuthController (e2e) - Password Recovery', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.setErrorHandler((error, request, reply) => {
      reply.send(error);
    });

    await app.init();
    await fastifyInstance.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /auth/forgot-password', () => {
    // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail válido
    it('deve retornar 200 para e-mail cadastrado', async () => {
      // Cria usuário ativo
      await prisma.usuario.create({
        data: {
          email: 'usuario@empresa.com',
          senha: 'hashedPassword',
          ativo: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'usuario@empresa.com' })
        .expect(200);

      // Verifica que o PasswordResetToken foi criado
      const tokens = await prisma.passwordResetToken.findMany();
      expect(tokens.length).toBe(1);
      expect(tokens[0].userId).toBeGreaterThan(0);
      expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokens[0].usedAt).toBeNull();
      expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Resposta silenciosa
      expect(response.body).toEqual({});
    });

    // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail inexistente
    it('deve retornar 200 para e-mail inexistente (anti-enumeração)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'naoexiste@empresa.com' })
        .expect(200);

      // Nenhum PasswordResetToken deve ter sido criado
      const tokens = await prisma.passwordResetToken.findMany();
      expect(tokens.length).toBe(0);

      // Resposta silenciosa
      expect(response.body).toEqual({});
    });
  });

  describe('POST /auth/reset-password', () => {
    // BDD: features/autenticacao.feature:Cenário: Resetar senha com token válido
    it('deve retornar 200 com token válido e atualizar a senha do usuário', async () => {
      // Cria usuário
      const user = await prisma.usuario.create({
        data: {
          email: 'usuario@empresa.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      // Insere PasswordResetToken válido diretamente
      const rawToken =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          usedAt: null,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(200);

      // Verifica que a senha foi atualizada
      const updatedUser = await prisma.usuario.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.senha).not.toBe('oldHashedPassword');
      expect(updatedUser?.senha).toBeTruthy();

      // Verifica que o token foi marcado como usado
      const usedToken = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
      });
      expect(usedToken?.usedAt).not.toBeNull();

      expect(response.body).toEqual({});
    });

    it('deve retornar 401 com token inválido', async () => {
      await prisma.usuario.create({
        data: {
          email: 'usuario@empresa.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'token-inexistente-no-banco',
          novaSenha: 'NovaSenha123!',
        })
        .expect(401);
    });

    it('deve retornar 401 com token expirado', async () => {
      const user = await prisma.usuario.create({
        data: {
          email: 'usuario@empresa.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      // Token expirado (expiresAt no passado)
      const rawToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 1000),
          usedAt: null,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(401);
    });

    // BDD: features/autenticacao.feature:Cenário: Resetar senha com token já utilizado
    it('deve retornar 401 quando token já foi utilizado', async () => {
      const user = await prisma.usuario.create({
        data: {
          email: 'usuario@empresa.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      // Token já utilizado (usedAt no passado)
      const rawToken = 'b'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          usedAt: new Date(Date.now() - 1000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(401);
    });

    // BDD: features/autenticacao.feature:REQ-PR-006 (cascade)
    it('deve revogar todos os refresh tokens ativos do usuário ao resetar a senha', async () => {
      // Cria usuário e faz login para emitir refresh tokens
      const user = await prisma.usuario.create({
        data: {
          email: 'cascade@empresa.com',
          senha: '$2b$10$oldHashForPassword123', // bcrypt válido
          ativo: true,
        },
      });

      // Emite um refresh token manualmente (simulando login prévio)
      const oldRefresh = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: 'old-refresh-token-1',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: null,
        },
      });
      const otherRefresh = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: 'old-refresh-token-2',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: null,
        },
      });

      // Insere token de reset válido
      const rawToken = 'c'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          usedAt: null,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha456!' })
        .expect(200);

      // Ambos os refresh tokens devem ter sido revogados
      const revokedTokens = await prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: { not: null } },
      });
      expect(revokedTokens).toHaveLength(2);
      expect(revokedTokens.map((t) => t.id).sort()).toEqual(
        [oldRefresh.id, otherRefresh.id].sort(),
      );
    });

    // BDD: features/autenticacao.feature:Cenário: Fluxo completo de recuperação
    it('deve completar o fluxo: forgot-password → reset → login com nova senha', async () => {
      const email = 'flow@empresa.com';
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';

      // Cria usuário com senha antiga (hash bcrypt válido)
      const bcrypt = await import('bcrypt');
      const oldHash = await bcrypt.hash(oldPassword, 10);
      await prisma.usuario.create({
        data: { email, senha: oldHash, ativo: true },
      });

      // 1) Login com senha antiga funciona
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, senha: oldPassword })
        .expect(201);

      // 2) Solicita reset
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      // 3) Recupera o token HASH criado no banco
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: { usedAt: null },
      });
      expect(tokenRecord).toBeTruthy();
      if (!tokenRecord) return;

      // Para o reset, precisamos do rawToken — mas o serviço só guardou o hash.
      // Simulamos criando um novo token raw cujo hash bate com o que está no banco.
      // (Aqui usamos a "porta dos fundos" do e2e: recriamos o rawToken)
      // Como o service gera randomBytes(32), não temos o raw token.
      // Solução: geramos um novo raw token, computamos seu hash, e atualizamos
      // o registro do banco. Isso simula o que o forgot-password fez internamente.
      const newRawToken = 'd'.repeat(64);
      const newHash = createHash('sha256').update(newRawToken).digest('hex');
      await prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { tokenHash: newHash },
      });

      // 4) Reseta a senha
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: newRawToken, novaSenha: newPassword })
        .expect(200);

      // 5) Login com senha antiga NÃO funciona mais
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, senha: oldPassword })
        .expect(401);

      // 6) Login com NOVA senha funciona
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, senha: newPassword })
        .expect(201);
    });

    it('deve retornar 400 se novaSenha for muito curta', () => {
      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'qualquer', novaSenha: 'short' })
        .expect(400);
    });

    it('deve retornar 400 se email do forgot-password for inválido', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'email-invalido' })
        .expect(400);
    });
  });
});
