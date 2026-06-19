import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { cleanDatabase } from './e2e-utils';

// [SEC-002] POST /usuarios agora exige auth + CREATE_USUARIO. Para os
// testes de AuthController criamos o usuário direto via Prisma — o
// escopo aqui é o fluxo de login, não a criação de usuários.
async function criarUsuario(
  prisma: PrismaService,
  data: { email: string; senha: string },
) {
  return prisma.usuario.create({
    data: {
      email: data.email,
      senha: await bcrypt.hash(data.senha, 10),
    },
  });
}

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

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

  describe('POST /auth/login', () => {
    // BDD: features/autenticacao.feature:Cenário: Login com credenciais válidas
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // 1. Criar um usuário, perfil e permissão
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      await criarUsuario(prisma, createUserDto);

      const loginDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      const decoded = jwtService.decode(response.body.access_token) as any;
      expect(decoded.email).toBe('test@example.com');
      expect(decoded).toHaveProperty('empresas');
    });

    // BDD: features/autenticacao.feature:Cenário: Login com credenciais inválidas - senha incorreta
    it('deve retornar 401 para credenciais inválidas', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'wrongpassword',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });

    // BDD: features/autenticacao.feature:Cenário: Login com e-mail não cadastrado
    it('deve retornar 401 para usuário inexistente', () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'anypassword',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });

    // BDD: features/autenticacao.feature:Cenário: Login com e-mail inválido
    it('deve retornar 400 para email inválido', () => {
      const loginDto = {
        email: 'invalid-email',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('E-mail inválido');
        });
    });

    // BDD: features/autenticacao.feature:Cenário: Login com senha curta
    it('deve retornar 400 para senha muito curta', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'short',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain(
            'A senha deve ter no mínimo 8 caracteres',
          );
        });
    });

    // BDD: features/autenticacao.feature:Cenário: Login sem credenciais
    it('deve retornar 400 se o email estiver faltando', () => {
      const loginDto = {
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('O e-mail não pode ser vazio');
        });
    });

    // BDD: features/autenticacao.feature:Cenário: Login sem credenciais
    it('deve retornar 400 se a senha estiver faltando', () => {
      const loginDto = {
        email: 'test@example.com',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('A senha não pode ser vazia');
        });
    });
  });

  describe('POST /auth/refresh', () => {
    // BDD: features/autenticacao.feature:Cenário: Renovar tokens com refresh token válido
    it('deve renovar access_token e refresh_token com refresh token válido', async () => {
      await criarUsuario(prisma, {
        email: 'refresh@example.com',
        senha: 'Password123!',
      });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'refresh@example.com', senha: 'Password123!' })
        .expect(201);

      const oldRefreshToken = loginRes.body.refresh_token;
      expect(oldRefreshToken).toBeDefined();

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: oldRefreshToken })
        .expect(201);

      expect(refreshRes.body).toHaveProperty('access_token');
      expect(refreshRes.body).toHaveProperty('refresh_token');
      expect(refreshRes.body.refresh_token).not.toBe(oldRefreshToken);
    });

    // BDD: features/autenticacao.feature:Cenário: Renovar tokens com refresh token inválido
    it('deve retornar 401 para refresh token inexistente', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'token-que-nao-existe' })
        .expect(401);
    });

    // BDD: features/autenticacao.feature:Cenário: Detecção de reuso de refresh token
    it('deve retornar 403 e revogar todos os tokens do usuário ao detectar reuso', async () => {
      await criarUsuario(prisma, {
        email: 'reuse@example.com',
        senha: 'Password123!',
      });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'reuse@example.com', senha: 'Password123!' })
        .expect(201);

      const refreshToken = loginRes.body.refresh_token;

      // 1ª renovação: token deve girar (revoga o antigo + emite novo)
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(201);

      // 2ª tentativa com o MESMO token (já revogado): cadeia revogada → 403
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(403);
    });
  });

  describe('POST /auth/login (multi-tenant e lockout)', () => {
    // BDD: features/autenticacao.feature:Cenário: Login com múltiplas empresas
    it('deve incluir todas as empresas do usuário (com perfis e permissões) no JWT', async () => {
      // Cria usuário direto via Prisma (escopo: login, não criação de usuário)
      const user = await criarUsuario(prisma, {
        email: 'multi@example.com',
        senha: 'Password123!',
      });
      const usuarioId = user.id;

      // Setup multi-tenant direto via Prisma (a API de empresas exige
      // permissão CREATE_EMPRESA + token, fora do escopo deste teste)
      const empresa1 = await prisma.empresa.create({
        data: { nome: 'Empresa Alpha', responsavelId: usuarioId },
      });
      const empresa2 = await prisma.empresa.create({
        data: { nome: 'Empresa Beta', responsavelId: usuarioId },
      });

      const perfil1 = await prisma.perfil.create({
        data: {
          nome: 'Admin',
          codigo: 'ADMIN',
          descricao: 'Admin da Alpha',
          empresaId: empresa1.id,
        },
      });
      const perfil2 = await prisma.perfil.create({
        data: {
          nome: 'Operador',
          codigo: 'OPERADOR',
          descricao: 'Operador da Beta',
          empresaId: empresa2.id,
        },
      });

      await prisma.usuarioEmpresa.create({
        data: {
          usuarioId,
          empresaId: empresa1.id,
          perfis: { connect: [{ id: perfil1.id }] },
        },
      });
      await prisma.usuarioEmpresa.create({
        data: {
          usuarioId,
          empresaId: empresa2.id,
          perfis: { connect: [{ id: perfil2.id }] },
        },
      });

      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'multi@example.com', senha: 'Password123!' })
        .expect(201);

      const decoded = jwtService.decode(loginRes.body.access_token) as any;
      expect(decoded).toHaveProperty('empresas');
      expect(Array.isArray(decoded.empresas)).toBe(true);
      expect(decoded.empresas).toHaveLength(2);

      const empresaIds = decoded.empresas.map((e: any) => e.id).sort();
      expect(empresaIds).toEqual([empresa1.id, empresa2.id].sort());

      // Cada empresa tem seu perfil com código correto
      const alphaEntry = decoded.empresas.find(
        (e: any) => e.id === empresa1.id,
      );
      const betaEntry = decoded.empresas.find((e: any) => e.id === empresa2.id);
      expect(alphaEntry.perfis[0].codigo).toBe('ADMIN');
      expect(betaEntry.perfis[0].codigo).toBe('OPERADOR');
    });

    // BDD: features/autenticacao.feature:Cenário: Bloqueio após N tentativas inválidas
    it('deve bloquear a conta após 5 tentativas inválidas (retornar 429)', async () => {
      const email = 'lockout@example.com';
      await criarUsuario(prisma, { email, senha: 'Password123!' });

      // 5 tentativas inválidas — todas retornam 401
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, senha: 'WrongPassword!' })
          .expect(401);
      }

      // 6ª tentativa — mesmo com a senha CORRETA — deve ser bloqueada (429)
      const blockedRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, senha: 'Password123!' })
        .expect(429);
      expect(blockedRes.body.message).toContain('bloqueada');
    });
  });
});
