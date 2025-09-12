import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertestRequest from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';

describe('UsuariosController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string; // Declare adminToken at a higher scope

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Clean database once before all tests
    await cleanDatabase(prisma);

    // Create permissions for admin user setup
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

    // Create an admin profile with permissions
    const adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador',
        permissoes: {
          connect: [{ id: perm1.id }, { id: perm2.id }],
        },
      },
    });

    // Create an admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.usuario.create({
      data: {
        email: 'admin@example.com',
        senha: hashedPassword,
        perfis: {
          connect: { id: adminProfile.id },
        },
      },
      include: { perfis: { include: { permissoes: true } } },
    });

    // Login as admin to get a token
    const loginDto = {
      email: 'admin@example.com',
      senha: 'admin123',
    };

    const res = await supertestRequest(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    adminToken = res.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // No global cleanDatabase here, individual describe blocks will manage their data
  });

  describe('POST /usuarios', () => {
    // Clean database before each test in this describe block
    beforeEach(async () => {
      await cleanDatabase(prisma);
    });

    it('deve criar um usuário e retornar 201', () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: 'test@example.com',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            perfis: [], // Added expected perfis array
          });
        });
    });

    it('deve criar um usuário com perfis e retornar 201', async () => {
      const profile = await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Common user profile',
        },
      });

      const createUserDto = {
        email: 'user_with_profile@example.com',
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
            email: 'user_with_profile@example.com',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
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
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      // Criar o primeiro usuário
      await prisma.usuario.create({ data: createUserDto });

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
      const createUserDto = { email: 'test@example.com', senha: '123' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha não atender aos requisitos de complexidade', () => {
      const createUserDto = {
        email: 'test@example.com',
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
          expect(res.body.message).toContain('E-mail inválido'); // Changed expected message
        });
    });

    it('deve criar um usuário sem senha e retornar 201', () => {
      const createUserDto = { email: 'no_password@example.com' };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: 'no_password@example.com',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            perfis: [], // Added expected perfis array
          });
          expect(res.body).not.toHaveProperty('senha');
        });
    });

    it('deve retornar 400 se perfisIds contiver valores não numéricos', () => {
      const createUserDto = {
        email: 'invalid_profile_id@example.com',
        senha: 'Password123!',
        perfisIds: ['abc'], // Invalid type
      };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Cada ID de perfil deve ser um número',
          ); // Updated message
        });
    });

    it('deve retornar 400 se perfisIds não for um array', () => {
      const createUserDto = {
        email: 'invalid_profile_id_not_array@example.com',
        senha: 'Password123!',
        perfisIds: '123', // Not an array
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
    let user1Token;

    beforeEach(async () => {
      await cleanDatabase(prisma); // Clean database before each test in this describe block

      // Create permissions
      const readUsuarioByIdPerm = await prisma.permissao.create({
        data: {
          nome: 'read:usuario_by_id',
          codigo: 'READ_USUARIO_BY_ID',
          descricao: 'Permissão para ler usuários por ID',
        },
      });

      // Create profiles
      const userProfile = await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Perfil de usuário comum',
          permissoes: { connect: { id: readUsuarioByIdPerm.id } },
        },
      });

      const adminProfile = await prisma.perfil.findFirst({
        where: { codigo: 'ADMIN' },
      });

      if (adminProfile) {
        await prisma.perfil.update({
          where: { id: adminProfile.id },
          data: {
            permissoes: {
              connect: { id: readUsuarioByIdPerm.id },
            },
          },
        });
      }

      // Create users
      user1 = await prisma.usuario.create({
        data: {
          email: 'user1@example.com',
          senha: await bcrypt.hash('Password123!', 10),
          perfis: { connect: { id: userProfile.id } },
        },
        include: { perfis: { include: { permissoes: true } } },
      });

      user2 = await prisma.usuario.create({
        data: {
          email: 'user2@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });

      // Create tokens
      user1Token = jwtService.sign({
        sub: user1.id,
        email: user1.email,
        perfis: user1.perfis,
      });
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
          });
        });
    });
  });

  describe('PATCH /usuarios/:id', () => {
    let userToUpdate;
    let userToken;

    beforeEach(async () => {
      await cleanDatabase(prisma); // Clean database before each test in this describe block

      // Create permissions
      const updateUsuarioPerm = await prisma.permissao.create({
        data: {
          nome: 'update:usuario',
          codigo: 'UPDATE_USUARIO',
          descricao: 'Permissão para atualizar usuários',
        },
      });

      // Create profiles
      const userProfile = await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Perfil de usuário comum',
          permissoes: { connect: { id: updateUsuarioPerm.id } },
        },
      });

      const adminProfile = await prisma.perfil.findFirst({
        where: { codigo: 'ADMIN' },
      });

      if (adminProfile) {
        await prisma.perfil.update({
          where: { id: adminProfile.id },
          data: {
            permissoes: {
              connect: { id: updateUsuarioPerm.id },
            },
          },
        });
      }

      // Create users
      userToUpdate = await prisma.usuario.create({
        data: {
          email: 'update_me@example.com',
          senha: await bcrypt.hash('Password123!', 10),
          perfis: { connect: { id: userProfile.id } },
        },
        include: { perfis: { include: { permissoes: true } } },
      });

      // Create tokens
      userToken = jwtService.sign({
        sub: userToUpdate.id,
        email: userToUpdate.email,
        perfis: userToUpdate.perfis,
      });
    });

    it('deve permitir que um usuário atualize seus próprios dados', () => {
      const updateDto = { email: 'updated_email@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe('updated_email@example.com');
        });
    });

    it('deve permitir que um admin atualize os dados de outro usuário', async () => {
      const updateDto = { email: 'admin_updated@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe('admin_updated@example.com');
        });
    });

    it('deve retornar 403 quando um usuário tenta atualizar dados de outro usuário', async () => {
      const anotherUser = await prisma.usuario.create({
        data: {
          email: 'another_user@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });
      const updateDto = { email: 'forbidden_update@example.com' };

      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${anotherUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateDto)
        .expect(403);
    });

    it('deve retornar 404 quando o usuário a ser atualizado não existe', () => {
      const updateDto = { email: 'nonexistent_update@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch('/usuarios/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(404);
    });
  });

  describe('DELETE /usuarios/:id', () => {
    let userToDelete;
    let userToken;

    beforeEach(async () => {
      await cleanDatabase(prisma); // Clean database before each test in this describe block

      // Create permissions
      const deleteUsuarioPerm = await prisma.permissao.create({
        data: {
          nome: 'delete:usuario',
          codigo: 'DELETE_USUARIO',
          descricao: 'Permissão para deletar usuários',
        },
      });

      // Create profiles
      const userProfile = await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Perfil de usuário comum',
          permissoes: { connect: { id: deleteUsuarioPerm.id } },
        },
      });

      const adminProfile = await prisma.perfil.findFirst({
        where: { codigo: 'ADMIN' },
      });

      if (adminProfile) {
        await prisma.perfil.update({
          where: { id: adminProfile.id },
          data: {
            permissoes: {
              connect: { id: deleteUsuarioPerm.id },
            },
          },
        });
      }

      // Create users
      userToDelete = await prisma.usuario.create({
        data: {
          email: 'delete_me@example.com',
          senha: await bcrypt.hash('Password123!', 10),
          perfis: { connect: { id: userProfile.id } },
        },
        include: { perfis: { include: { permissoes: true } } },
      });

      // Create tokens
      userToken = jwtService.sign({
        sub: userToDelete.id,
        email: userToDelete.email,
        perfis: userToDelete.perfis,
      });
    });

    it('deve permitir que um usuário delete seus próprios dados', () => {
      return supertestRequest(app.getHttpServer())
        .delete(`/usuarios/${userToDelete.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);
    });

    it('deve permitir que um admin delete os dados de outro usuário', async () => {
      const anotherUser = await prisma.usuario.create({
        data: {
          email: 'another_user_to_delete@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });
      return supertestRequest(app.getHttpServer())
        .delete(`/usuarios/${anotherUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 403 quando um usuário tenta deletar dados de outro usuário', async () => {
      const anotherUser = await prisma.usuario.create({
        data: {
          email: 'forbidden_delete@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });
      return supertestRequest(app.getHttpServer())
        .delete(`/usuarios/${anotherUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar 404 quando o usuário a ser deletado não existe', () => {
      return supertestRequest(app.getHttpServer())
        .delete('/usuarios/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
