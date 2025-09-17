import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertestRequest from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, setupE2ETestData } from './e2e-utils';
import { TestDataBuilder } from './test-data-builder';

describe('UsuariosController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userToken: string;
  let testDataBuilder: TestDataBuilder;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    testDataBuilder = new TestDataBuilder(app);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Clean and setup common test data once for the entire suite
    await cleanDatabase(prisma);
    const tokens = await setupE2ETestData(app);
    adminToken = tokens.adminToken;
    userToken = tokens.userToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up data created by individual tests if necessary, but not global data
    // The setupE2ETestData in beforeAll ensures base data is present.
    // For tests that modify base data, they should clean up after themselves
    // or create their own isolated data.
    await prisma.usuario.deleteMany({
      where: {
        email: {
          notIn: ['admin@example.com', 'limited@example.com'],
        },
      },
    });
  });

  describe('POST /usuarios', () => {
    it('deve criar um usuário e retornar 201', () => {
      const createUserDto = {
        email: `test-${Date.now()}@example.com`,
        senha: 'Password123!',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: createUserDto.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            perfis: [],
          });
        });
    });

    it('deve criar um usuário com perfis e retornar 201', async () => {
      const profile = await testDataBuilder.createProfile(
        'User',
        'USER_PROFILE',
        'Common user profile',
      );

      const createUserDto = {
        email: `user_with_profile-${Date.now()}@example.com`,
        senha: 'Password123!',
        perfisIds: [profile.id],
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: createUserDto.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            perfis: expect.arrayContaining([
              expect.objectContaining({
                id: profile.id,
                codigo: profile.codigo,
                nome: profile.nome,
                descricao: profile.descricao,
              }),
            ]),
          });
        });
    });

    it('deve retornar 409 se o email já existir', async () => {
      const email = `duplicate-${Date.now()}@example.com`;
      const createUserDto = {
        email: email,
        senha: 'Password123!',
      };

      // Criar o primeiro usuário
      await supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      // Tentar criar o segundo usuário com o mesmo email
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(409);
    });

    it('deve retornar 400 se o email for inválido', () => {
      const createUserDto = { email: 'invalid-email', senha: 'Password123!' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha for muito curta', () => {
      const createUserDto = {
        email: `shortpass-${Date.now()}@example.com`,
        senha: '123',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha não atender aos requisitos de complexidade', () => {
      const createUserDto = {
        email: `weakpass-${Date.now()}@example.com`,
        senha: 'password',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se o email estiver faltando', () => {
      const createUserDto = { senha: 'Password123!' };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('E-mail inválido');
        });
    });

    it('deve criar um usuário sem senha e retornar 201', () => {
      const createUserDto = { email: `no_password-${Date.now()}@example.com` };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: createUserDto.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            perfis: [],
          });
          expect(res.body).not.toHaveProperty('senha');
        });
    });

    it('deve retornar 400 se perfisIds contiver valores não numéricos', () => {
      const createUserDto = {
        email: `invalid_profile_id-${Date.now()}@example.com`,
        senha: 'Password123!',
        perfisIds: ['abc'],
      };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Cada ID de perfil deve ser um número',
          );
        });
    });

    it('deve retornar 400 se perfisIds não for um array', () => {
      const createUserDto = {
        email: `invalid_profile_id_not_array-${Date.now()}@example.com`,
        senha: 'Password123!',
        perfisIds: '123',
      };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('perfisIds deve ser um array');
        });
    });
  });

  describe('GET /usuarios/:id', () => {
    let user1;
    let user2;
    let deletedUser;
    let user1Token;

    beforeEach(async () => {
      // Create profiles
      const createdUserProfile = await testDataBuilder.createProfile(
        'User',
        'USER_PROFILE',
        'Perfil de usuário comum',
        ['READ_USUARIO_BY_ID'],
      );
      // Explicitly use the variable to satisfy the linter
      console.log('Created user profile:', createdUserProfile.id);

      // Create users
      user1 = await testDataBuilder.createUser(
        `user1-${Date.now()}@example.com`,
        'Password123!',
        ['USER_PROFILE'],
      );

      user2 = await testDataBuilder.createUser(
        `user2-${Date.now()}@example.com`,
        'Password123!',
      );

      deletedUser = await testDataBuilder.createUser(
        `deleted-${Date.now()}@example.com`,
        'Password123!',
      );
      await prisma.usuario.update({
        where: { id: deletedUser.id },
        data: { deletedAt: new Date() },
      });

      // Create tokens
      user1Token = testDataBuilder.generateToken(user1);
    });

    it('deve permitir que um usuário acesse seus próprios dados', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            id: user1.id,
            email: user1.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
          });
        });
    });

    it('deve retornar 403 quando um usuário tenta acessar dados de outro usuário', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user2.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403)
        .then((res) => {
          expect(res.body.message).toBe(
            'Você não tem permissão para acessar os dados deste usuário',
          );
        });
    });

    it('deve retornar 401 quando não há token de autenticação', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .expect(401);
    });

    it('deve retornar 404 quando o usuário não existe', () => {
      return supertestRequest(app.getHttpServer())
        .get('/usuarios/99999')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404)
        .then((res) => {
          expect(res.body.message).toBe('Usuário com ID 99999 não encontrado');
        });
    });

    it('deve permitir que um admin acesse os dados de outro usuário', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            id: user1.id,
            email: user1.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
          });
        });
    });

    it('deve retornar 404 para um usuário deletado por padrão', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${deletedUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .then((res) => {
          expect(res.body.message).toBe(
            `Usuário com ID ${deletedUser.id} não encontrado`,
          );
        });
    });
  });

  describe('PATCH /usuarios/:id', () => {
    let userToUpdate;
    let userToSoftDelete;
    let userToken;

    beforeEach(async () => {
      // Create profiles
      const createdUserProfile = await testDataBuilder.createProfile(
        'UserForUpdate',
        'USER_FOR_UPDATE',
        'Perfil de usuário para atualização',
        ['UPDATE_USUARIO'],
      );
      // Explicitly use the variable to satisfy the linter
      console.log('Created user profile for update:', createdUserProfile.id);

      // Create users
      userToUpdate = await testDataBuilder.createUser(
        `update_me-${Date.now()}@example.com`,
        'Password123!',
        ['USER_FOR_UPDATE'],
      );

      userToSoftDelete = await testDataBuilder.createUser(
        `soft_deleted-${Date.now()}@example.com`,
        'Password123!',
      );
      await prisma.usuario.update({
        where: { id: userToSoftDelete.id },
        data: { deletedAt: new Date() },
      });

      // Create tokens
      userToken = testDataBuilder.generateToken(userToUpdate);
    });

    it('deve permitir que um usuário atualize seus próprios dados', () => {
      const updateDto = { email: `updated_email-${Date.now()}@example.com` };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe(updateDto.email);
        });
    });

    it('deve permitir que um admin atualize os dados de outro usuário', async () => {
      const updateDto = { email: `admin_updated-${Date.now()}@example.com` };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe(updateDto.email);
        });
    });

    it('deve retornar 403 quando um usuário tenta atualizar dados de outro usuário', async () => {
      const anotherUser = await testDataBuilder.createUser(
        `another_user-${Date.now()}@example.com`,
        'Password123!',
      );
      const updateDto = { email: `forbidden_update-${Date.now()}@example.com` };

      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${anotherUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateDto)
        .expect(403);
    });

    it('deve retornar 404 quando o usuário a ser atualizado não existe', () => {
      const updateDto = {
        email: `nonexistent_update-${Date.now()}@example.com`,
      };
      return supertestRequest(app.getHttpServer())
        .patch('/usuarios/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(404);
    });

    it('deve restaurar um usuário deletado via PATCH /usuarios/:id com { ativo: true }', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(200)
        .then(async (res) => {
          expect(res.body.id).toBe(userToSoftDelete.id);
          expect(res.body.deletedAt).toBeNull();
          // Verify it's now accessible via normal GET
          await supertestRequest(app.getHttpServer())
            .get(`/usuarios/${userToSoftDelete.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
    });

    it('deve retornar 403 se não for admin ao tentar restaurar via PATCH', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(restoreDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar restaurar um usuário não deletado via PATCH', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de um usuário via PATCH /usuarios/:id com { ativo: false }', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(200)
        .then(async (res) => {
          expect(res.body.id).toBe(userToUpdate.id);
          expect(res.body.deletedAt).not.toBeNull();
          // Verify it's no longer accessible via normal GET
          await supertestRequest(app.getHttpServer())
            .get(`/usuarios/${userToUpdate.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
        });
    });

    it('deve retornar 403 se não for admin ao tentar deletar via PATCH', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(deleteDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar deletar um usuário já deletado via PATCH', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(409);
    });
  });
});
