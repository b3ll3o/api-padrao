import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany();
    await prisma.perfil.deleteMany();
    await prisma.permissao.deleteMany();
  });

  describe('POST /auth/login', () => {
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // Criar permissões
      const perm1 = await prisma.permissao.create({
        data: {
          nome: 'read:users',
          codigo: 'READ_USERS',
          descricao: 'Permissão para ler usuários',
        },
      });
      const perm2 = await prisma.permissao.create({
        data: {
          nome: 'write:users',
          codigo: 'WRITE_USERS',
          descricao: 'Permissão para escrever usuários',
        },
      });

      // Criar um perfil com permissões
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Admin',
          codigo: 'ADMIN',
          descricao: 'Perfil de administrador',
          permissoes: {
            connect: [{ id: perm1.id }, { id: perm2.id }],
          },
        },
      });

      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
        perfisIds: [perfil.id],
      };

      // Primeiro, criar um usuário com o perfil
      await request(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      const loginDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201)
        .then((res: { body: { access_token: string } }) => {
          expect(res.body).toHaveProperty('access_token');
          expect(typeof res.body.access_token).toBe('string');

          // Decodificar o JWT e verificar seu conteúdo
          const decodedJwt: any = jwtService.decode(res.body.access_token);

          expect(decodedJwt.email).toEqual(createUserDto.email);
          expect(decodedJwt.sub).toBeDefined();
          expect(decodedJwt.perfis).toBeInstanceOf(Array);
          expect(decodedJwt.perfis.length).toEqual(1);

          // Check profile properties
          expect(decodedJwt.perfis[0].nome).toEqual(perfil.nome);
          expect(decodedJwt.perfis[0].codigo).toEqual(perfil.codigo);
          expect(decodedJwt.perfis[0].descricao).toEqual(perfil.descricao);

          // Check permissions properties
          expect(decodedJwt.perfis[0].permissoes).toBeInstanceOf(Array);
          expect(decodedJwt.perfis[0].permissoes.length).toEqual(2);

          // Verify each permission
          expect(decodedJwt.perfis[0].permissoes[0].nome).toEqual(perm1.nome);
          expect(decodedJwt.perfis[0].permissoes[0].codigo).toEqual(
            perm1.codigo,
          );
          expect(decodedJwt.perfis[0].permissoes[0].descricao).toEqual(
            perm1.descricao,
          );

          expect(decodedJwt.perfis[0].permissoes[1].nome).toEqual(perm2.nome);
          expect(decodedJwt.perfis[0].permissoes[1].codigo).toEqual(
            perm2.codigo,
          );
          expect(decodedJwt.perfis[0].permissoes[1].descricao).toEqual(
            perm2.descricao,
          );
        });
    });

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

    it('deve retornar 401 para usuário inexistente', () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });
  });
});
