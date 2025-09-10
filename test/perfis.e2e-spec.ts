import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/dto/paginated-response.dto';
import { Perfil } from '../src/perfis/domain/entities/perfil.entity';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';

describe('PerfisController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create permissions
    const permissionsData = [
      {
        nome: 'read:users',
        codigo: 'READ_USERS',
        descricao: 'Permissão para ler usuários',
      },
      {
        nome: 'write:users',
        codigo: 'WRITE_USERS',
        descricao: 'Permissão para escrever usuários',
      },
      {
        nome: 'create:perfis',
        codigo: 'CREATE_PERFIL',
        descricao: 'Permissão para criar perfis',
      },
      {
        nome: 'read:perfis',
        codigo: 'READ_PERFIS',
        descricao: 'Permissão para ler perfis',
      },
      {
        nome: 'read:perfis_by_id',
        codigo: 'READ_PERFIL_BY_ID',
        descricao: 'Permissão para ler perfis por id',
      },
      {
        nome: 'read:perfis_by_nome',
        codigo: 'READ_PERFIL_BY_NOME',
        descricao: 'Permissão para ler perfis por nome',
      },
      {
        nome: 'update:perfis',
        codigo: 'UPDATE_PERFIL',
        descricao: 'Permissão para atualizar perfis',
      },
      {
        nome: 'delete:perfis',
        codigo: 'DELETE_PERFIL',
        descricao: 'Permissão para deletar perfis',
      },
    ];

    const permissions = await Promise.all(
      permissionsData.map((p) => prisma.permissao.create({ data: p })),
    );

    // Create an admin profile with permissions
    let adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador',
        permissoes: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });

    // Fetch the admin profile with its permissions to ensure they are loaded
    adminProfile = await prisma.perfil.findUniqueOrThrow({
      where: { id: adminProfile.id },
      include: { permissoes: true },
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
    });

    // Login as admin to get a token
    const loginDto = {
      email: 'admin@example.com',
      senha: 'admin123',
    };

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    token = res.body.access_token;
  });

  afterEach(async () => {
    // Clean up data created by individual tests if necessary, but not global data
  });

  describe('POST /perfis', () => {
    it('deve criar um perfil', async () => {
      const createPerfilDto = {
        nome: `Admin-${Date.now()}`,
        codigo: `ADMIN_${Date.now()}`,
        descricao: 'Perfil de administrador',
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');

          expect(res.body.nome).toEqual(createPerfilDto.nome);
        });
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPerfilDto = {};

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(400);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir', async () => {
      const createPerfilDto = {
        nome: 'duplicate:name',
        codigo: 'DUPLICATE_NAME',
        descricao: 'Perfil duplicado',
      };
      // Criar o primeiro perfil

      await request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(201);

      // Tentar criar um perfil duplicado

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toEqual(
            `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
          );
        });
    });

    it('deve retornar 404 se as permissões não existirem', async () => {
      const createPerfilDto = {
        nome: 'Perfil com Permissões Inválidas',
        codigo: 'PERFIL_PERMISSOES_INVALIDAS',
        descricao: 'Perfil com permissões que não existem',
        permissoesIds: [99999],
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toEqual(
            'Permissão com ID 99999 não encontrada.',
          );
        });
    });
  });

  describe('GET /perfis', () => {
    it('deve retornar uma lista paginada de perfis', async () => {
      await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Perfil de usuário comum',
        },
      });

      return request(app.getHttpServer())
        .get('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });

  describe('GET /perfis/:id', () => {
    it('deve retornar um único perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Editor',
          codigo: 'EDITOR',
          descricao: 'Perfil de editor',
        },
      });

      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);

          expect(res.body.nome).toEqual(perfil.nome);
        });
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      return request(app.getHttpServer())
        .get('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Viewer',
          codigo: 'VIEWER',
          descricao: 'Perfil de visualizador',
        },
      });
      const updatePerfilDto = { nome: 'Updated Viewer' };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatePerfilDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);

          expect(res.body.nome).toEqual(updatePerfilDto.nome);
        });
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      const updatePerfilDto = { nome: 'Non Existent' };

      return request(app.getHttpServer())
        .patch('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(updatePerfilDto)
        .expect(404);
    });
  });

  describe('DELETE /perfis/:id', () => {
    it('deve deletar um perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Deletable',
          codigo: 'DELETABLE',
          descricao: 'Perfil deletável',
        },
      });

      return request(app.getHttpServer())
        .delete(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      return request(app.getHttpServer())
        .delete('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /perfis/nome/:nome', () => {
    it('deve retornar perfis que contêm a string no nome', async () => {
      await prisma.perfil.createMany({
        data: [
          {
            nome: 'perfil_teste_1',
            codigo: 'PERFIL_TESTE_1',
            descricao: 'Perfil de teste 1',
          },
          {
            nome: 'outro_perfil',
            codigo: 'OUTRO_PERFIL',
            descricao: 'Outro perfil de teste',
          },
          {
            nome: 'perfil_teste_2',
            codigo: 'PERFIL_TESTE_2',
            descricao: 'Perfil de teste 2',
          },
        ],
      });
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/perfis/nome/teste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(2);
          expect(paginatedResponse.data[0].nome).toContain('teste');
          expect(paginatedResponse.data[1].nome).toContain('teste');
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar um array vazio se nenhum perfil for encontrado', () => {
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/perfis/nome/naoexiste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });
});
