import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/dto/paginated-response.dto';
import { Permissao } from '../src/permissoes/domain/entities/permissao.entity';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';

describe('PermissoesController (e2e)', () => {
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
        nome: 'create:permissao',
        codigo: 'CREATE_PERMISSAO',
        descricao: 'Permissão para criar permissões',
      },
      {
        nome: 'read:permissoes',
        codigo: 'READ_PERMISSOES',
        descricao: 'Permissão para ler permissões',
      },
      {
        nome: 'read:permissao_by_id',
        codigo: 'READ_PERMISSAO_BY_ID',
        descricao: 'Permissão para ler permissão por ID',
      },
      {
        nome: 'read:permissao_by_nome',
        codigo: 'READ_PERMISSAO_BY_NOME',
        descricao: 'Permissão para ler permissão por nome',
      },
      {
        nome: 'update:permissao',
        codigo: 'UPDATE_PERMISSAO',
        descricao: 'Permissão para atualizar permissão',
      },
      {
        nome: 'delete:permissao',
        codigo: 'DELETE_PERMISSAO',
        descricao: 'Permissão para deletar permissão',
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

  describe('POST /permissoes', () => {
    it('deve criar uma permissão', async () => {
      const createPermissaoDto = {
        nome: `read:users-${Date.now()}`,
        codigo: `READ_USERS_${Date.now()}`,
        descricao: 'Permissão para ler usuários',
      };

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');

          expect(res.body.nome).toEqual(createPermissaoDto.nome);
        });
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPermissaoDto = {};

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(400);
    });
  });

  describe('GET /permissoes', () => {
    it('deve retornar uma lista paginada de permissões', async () => {
      return request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });

  describe('GET /permissoes/:id', () => {
    it('deve retornar uma única permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'delete:users',
          codigo: 'DELETE_USERS',
          descricao: 'Permissão para deletar usuários',
        },
      });

      return request(app.getHttpServer())
        .get(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);

          expect(res.body.nome).toEqual(permissao.nome);
        });
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      return request(app.getHttpServer())
        .get('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /permissoes/nome/:nome', () => {
    it('deve retornar permissões que contêm a string no nome', async () => {
      await prisma.permissao.createMany({
        data: [
          {
            nome: 'permissao_teste_1',
            codigo: 'PERMISSAO_TESTE_1',
            descricao: 'Permissão de teste 1',
          },
          {
            nome: 'outra_permissao',
            codigo: 'OUTRA_PERMISSAO',
            descricao: 'Outra permissão de teste',
          },
          {
            nome: 'permissao_teste_2',
            codigo: 'PERMISSAO_TESTE_2',
            descricao: 'Permissão de teste 2',
          },
        ],
      });
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/permissoes/nome/permissao')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse.data[0].nome).toContain('permissao');
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar um array vazio se nenhuma permissão for encontrada', () => {
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/permissoes/nome/naoexiste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });
});
