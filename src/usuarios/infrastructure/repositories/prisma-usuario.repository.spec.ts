import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;
  let mockCache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  const mockUsuarioModel = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  const mockPrismaService = {
    usuario: mockUsuarioModel,
    extended: {
      usuario: mockUsuarioModel,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // [A5] Mock minimal do CACHE_MANAGER — `get`, `set`, `del` apenas.
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaUsuarioRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    repository = module.get<PrismaUsuarioRepository>(PrismaUsuarioRepository);
  });

  const mockPrismaUser = {
    id: 1,
    email: 'test@test.com',
    senha: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ativo: true,
  };

  describe('criação', () => {
    // REQ-USER-001: POST /usuarios persiste no DB
    // REQ-USER-007: senha armazenada como hash bcrypt
    it('deve criar um novo usuário', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      mockUsuarioModel.create.mockResolvedValue(mockPrismaUser);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(mockPrismaUser.id);
      expect(mockUsuarioModel.create).toHaveBeenCalled();
    });

    it('deve lançar erro original se o Prisma falhar por outro motivo', async () => {
      mockUsuarioModel.create.mockRejectedValue(new Error('DB Error'));
      await expect(
        repository.create({ email: 'test@test.com' }),
      ).rejects.toThrow('DB Error');
    });
  });

  describe('busca por um', () => {
    // REQ-USER-020: GET /usuarios/:id
    it('deve retornar um usuário por ID', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findOne(1);
      expect(result?.id).toBe(1);
    });

    it('deve retornar undefined se o usuário não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });
  });

  describe('busca de todos', () => {
    // REQ-USER-010: GET /usuarios paginado
    // REQ-USER-013: PaginatedResponseDto
    // REQ-USER-014: default exclui soft-deletados
    it('deve retornar usuários paginados', async () => {
      mockUsuarioModel.findMany.mockResolvedValue([mockPrismaUser]);
      mockUsuarioModel.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockUsuarioModel.findMany).toHaveBeenCalled();
    });

    it('deve retornar inclusive deletados se includeDeleted for true', async () => {
      mockUsuarioModel.findMany.mockResolvedValue([mockPrismaUser]);
      mockUsuarioModel.count.mockResolvedValue(1);

      await repository.findAll({ page: 1, limit: 10 }, true);

      expect(mockUsuarioModel.findMany).toHaveBeenCalled();
    });
  });

  describe('findByEmailWithPerfisAndPermissoes', () => {
    // REQ-USER-021: autenticação carrega perfis+permissoes
    it('deve retornar usuário com relações carregadas', async () => {
      const userWithRelations = {
        ...mockPrismaUser,
        empresas: [
          {
            id: 1,
            empresaId: 'emp-1',
            perfis: [
              {
                id: 1,
                nome: 'Admin',
                permissoes: [{ id: 1, codigo: 'READ' }],
              },
            ],
          },
        ],
      };
      mockUsuarioModel.findUnique.mockResolvedValue(userWithRelations);

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

      expect(result?.empresas).toHaveLength(1);
      const empresa = result?.empresas?.[0];
      if (empresa && empresa.perfis) {
        expect(empresa.perfis[0].nome).toBe('Admin');
      }
    });

    it('deve lidar com UsuarioEmpresa sem perfis (perfis undefined → array vazio)', async () => {
      const userWithRelations = {
        ...mockPrismaUser,
        empresas: [
          {
            id: 1,
            empresaId: 'emp-1',
            // sem `perfis`
          },
        ],
      };
      mockUsuarioModel.findUnique.mockResolvedValue(userWithRelations);

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

      expect(result?.empresas).toHaveLength(1);
      expect(result?.empresas?.[0].perfis).toEqual([]);
    });

    it('deve retornar null se o usuário não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result =
        await repository.findByEmailWithPerfisAndPermissoes('ghost@test.com');
      expect(result).toBeNull();
    });

    // [ALT-006] H2 — LGPD/segurança: NUNCA retornar `senha` mesmo no
    // lookup com perfis/permissões. Login usa `findByEmailWithCredentials`
    // em separado para comparar hash.
    it('[ALT-006] deve usar `select` que OMITE o campo `senha` (LGPD)', async () => {
      mockUsuarioModel.findUnique
        // [A5] 1ª chamada: lookup mínimo via `findByEmail` (sem `empresas`).
        .mockResolvedValueOnce({
          id: 1,
          email: 'a@b.c',
          ativo: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        // 2ª chamada: query pesada com `empresas` → alvo do assert.
        .mockResolvedValueOnce({
          id: 1,
          email: 'a@b.c',
          ativo: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          empresas: [],
        });

      await repository.findByEmailWithPerfisAndPermissoes('a@b.c');

      // 2 chamadas: lookup mínimo (sem empresas) + query pesada (com empresas)
      expect(mockUsuarioModel.findUnique).toHaveBeenCalledTimes(2);
      const callArgs = mockUsuarioModel.findUnique.mock.calls[1][0];
      // CRÍTICO: o select do usuário NÃO contém `senha`
      expect(callArgs.select).not.toHaveProperty('senha');
      // O select aninhado de permissoes NÃO expõe segredos
      const empresasSelect = callArgs.select.empresas.select;
      const perfisSelect = empresasSelect.perfis.select;
      expect(perfisSelect.permissoes.select).toEqual({
        id: true,
        codigo: true,
      });
    });

    it('[ALT-006] mapToEntity deve setar `senha` como undefined quando o select omite', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.c',
        ativo: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        empresas: [
          {
            id: 1,
            empresaId: 'emp-1',
            usuarioId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            perfis: [
              {
                id: 1,
                codigo: 'ADMIN',
                nome: 'Admin',
                descricao: 'Admin role',
                ativo: true,
                permissoes: [{ id: 1, codigo: 'READ' }],
              },
            ],
          },
        ],
      });

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('a@b.c');

      expect(result).not.toBeNull();
      expect(result!.senha).toBeUndefined();
      // Garante que as relações estão presentes
      expect(result!.empresas).toHaveLength(1);
      expect(result!.empresas![0].perfis![0].codigo).toBe('ADMIN');
      expect(result!.empresas![0].perfis![0].permissoes).toHaveLength(1);
    });

    // [A5] DevSecOps 2026-06-21 — cache 60s no hot-path de login.
    describe('[A5] cache de perfis+permissões', () => {
      const cachedPayload = {
        ...mockPrismaUser,
        empresas: [
          {
            id: 1,
            empresaId: 'emp-1',
            usuarioId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            perfis: [
              {
                id: 1,
                codigo: 'ADMIN',
                nome: 'Admin',
                descricao: 'Admin role',
                ativo: true,
                permissoes: [{ id: 1, codigo: 'READ' }],
              },
            ],
          },
        ],
      };

      const cacheKey = 'auth:user-profiles:1';

      it('cache miss: executa query pesada e popula o cache com TTL 60s', async () => {
        // findByEmail (lookup mínimo) → cache miss → query pesada → cache.set
        mockUsuarioModel.findUnique
          .mockResolvedValueOnce({
            id: 1,
            email: 'test@test.com',
            ativo: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(cachedPayload);
        mockCache.get.mockResolvedValue(undefined);

        const result =
          await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

        expect(result).not.toBeNull();
        expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
        expect(mockUsuarioModel.findUnique).toHaveBeenCalledTimes(2);
        // Deve gravar no cache com TTL 60_000
        expect(mockCache.set).toHaveBeenCalledWith(
          cacheKey,
          expect.any(Object),
          60_000,
        );
      });

      it('cache hit: NÃO executa a query pesada; retorna o payload cacheado', async () => {
        const fakeCached: any = {
          id: 1,
          email: 'test@test.com',
          ativo: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          empresas: cachedPayload.empresas,
        };
        mockUsuarioModel.findUnique.mockResolvedValueOnce({
          id: 1,
          email: 'test@test.com',
          ativo: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        mockCache.get.mockResolvedValueOnce(fakeCached);

        const result =
          await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

        expect(result).toBe(fakeCached);
        // Apenas o findByEmail mínimo (1ª chamada); a query pesada NÃO roda
        expect(mockUsuarioModel.findUnique).toHaveBeenCalledTimes(1);
        expect(mockCache.set).not.toHaveBeenCalled();
      });

      it('cache TTL expirado: reexecuta a query e repopula o cache', async () => {
        mockUsuarioModel.findUnique
          .mockResolvedValueOnce({
            id: 1,
            email: 'test@test.com',
            ativo: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(cachedPayload);
        // 1ª chamada: cache hit
        mockCache.get.mockResolvedValueOnce(undefined);
        // Após miss + repopulação, próxima chamada volta a ser miss (TTL expirou)
        mockCache.get.mockResolvedValueOnce(undefined);

        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');
        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

        // 2 lookup mínimo + 2 queries pesadas = 4 chamadas totais
        expect(mockUsuarioModel.findUnique).toHaveBeenCalledTimes(4);
        expect(mockCache.set).toHaveBeenCalledTimes(2);
      });

      it('cache.get() lança erro: degrada graciosamente (miss + query pesada)', async () => {
        mockUsuarioModel.findUnique
          .mockResolvedValueOnce({
            id: 1,
            email: 'test@test.com',
            ativo: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(cachedPayload);
        mockCache.get.mockRejectedValueOnce(new Error('Redis offline'));

        const result =
          await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

        expect(result).not.toBeNull();
        // Mesma sequência: lookup mínimo + query pesada
        expect(mockUsuarioModel.findUnique).toHaveBeenCalledTimes(2);
      });

      it('invalidateUserCache remove a chave auth:user-profiles:<id>', async () => {
        await repository.invalidateUserCache(42);

        expect(mockCache.del).toHaveBeenCalledWith('auth:user-profiles:42');
      });

      it('invalidateUserCache tolera erro do Redis (best-effort)', async () => {
        mockCache.del.mockRejectedValueOnce(new Error('Redis offline'));

        await expect(
          repository.invalidateUserCache(42),
        ).resolves.toBeUndefined();
      });

      it('invalidateUserCache ignora userId inválido (NaN, Infinity)', async () => {
        await repository.invalidateUserCache(NaN);
        await repository.invalidateUserCache(Infinity);

        expect(mockCache.del).not.toHaveBeenCalled();
      });

      it('cache.set() lança erro: payload ainda é retornado (best-effort)', async () => {
        mockUsuarioModel.findUnique
          .mockResolvedValueOnce({
            id: 1,
            email: 'test@test.com',
            ativo: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(cachedPayload);
        mockCache.get.mockResolvedValueOnce(undefined);
        mockCache.set.mockRejectedValueOnce(new Error('Redis offline'));

        const result =
          await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

        expect(result).not.toBeNull();
        expect(result!.id).toBe(1);
      });

      it('usuario inexistente em findByEmail: retorna null sem tocar no cache', async () => {
        mockUsuarioModel.findUnique.mockResolvedValueOnce(null);

        const result =
          await repository.findByEmailWithPerfisAndPermissoes('ghost@x.com');

        expect(result).toBeNull();
        expect(mockCache.get).not.toHaveBeenCalled();
        expect(mockCache.set).not.toHaveBeenCalled();
      });
    });
  });

  describe('findByEmail', () => {
    // REQ-USER-002/006: busca por email (unicidade)
    it('deve retornar um usuário por email', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findByEmail('test@test.com');
      expect(result?.email).toBe('test@test.com');
    });

    it('deve retornar null se email não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result = await repository.findByEmail('ghost@test.com');
      expect(result).toBeNull();
    });

    // [ALT-006] H2 — LGPD/segurança: NUNCA retornar `senha` (hash bcrypt)
    // em buscas genéricas. Caller que precisa autenticar deve usar
    // `findByEmailWithCredentials`.
    it('[ALT-006] deve usar `select` que OMITE o campo `senha` (LGPD)', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.c',
        ativo: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.findByEmail('a@b.c');

      expect(mockUsuarioModel.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@b.c' },
        select: expect.not.objectContaining({ senha: expect.anything() }),
      });
      // Verifica que o select tem apenas os campos públicos esperados
      const callArgs = mockUsuarioModel.findUnique.mock.calls[0][0];
      expect(callArgs.select).toEqual({
        id: true,
        email: true,
        ativo: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      });
      expect(callArgs.select).not.toHaveProperty('senha');
    });

    it('[ALT-006] mapToEntity deve setar `senha` como undefined quando não está no payload', async () => {
      // Simula o payload que o Prisma retorna com `select` omitindo senha
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.c',
        ativo: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await repository.findByEmail('a@b.c');

      expect(result).not.toBeNull();
      expect(result!.senha).toBeUndefined();
    });
  });

  describe('findByEmailWithCredentials', () => {
    // [ALT-006] H2 — Variante EXPLÍCITA que retorna `senha` para o fluxo
    // de autenticação (bcrypt.compare). Único caller esperado: AuthService.login.
    it('deve retornar { id, email, senha, ativo, deletedAt } quando o usuário existe', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 42,
        email: 'auth@b.c',
        senha: 'hashedPassword',
        ativo: true,
        deletedAt: null,
      });

      const result = await repository.findByEmailWithCredentials('auth@b.c');

      expect(result).toEqual({
        id: 42,
        email: 'auth@b.c',
        senha: 'hashedPassword',
        ativo: true,
        deletedAt: null,
      });
    });

    it('deve usar `select` que inclui explicitamente o campo `senha`', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'x@y.z',
        senha: 'h',
        ativo: true,
        deletedAt: null,
      });

      await repository.findByEmailWithCredentials('x@y.z');

      expect(mockUsuarioModel.findUnique).toHaveBeenCalledWith({
        where: { email: 'x@y.z' },
        select: expect.objectContaining({ senha: true }),
      });
      const callArgs = mockUsuarioModel.findUnique.mock.calls[0][0];
      expect(callArgs.select.senha).toBe(true);
    });

    it('deve retornar null se o usuário não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmailWithCredentials('ghost@b.c');

      expect(result).toBeNull();
    });

    it('deve aceitar senha null (legado: usuário criado antes do hash bcrypt)', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'legacy@b.c',
        senha: null,
        ativo: true,
        deletedAt: null,
      });

      const result = await repository.findByEmailWithCredentials('legacy@b.c');

      expect(result?.senha).toBeNull();
    });
  });

  describe('atualização e remoção', () => {
    // REQ-USER-030: PATCH /usuarios/:id
    // REQ-USER-035/036: soft delete + restore
    it('deve atualizar um usuário', async () => {
      mockUsuarioModel.update.mockResolvedValue(mockPrismaUser);
      const result = await repository.update(1, { email: 'new@test.com' });
      expect(result.email).toBe(mockPrismaUser.email);
    });

    it('remove deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockUsuarioModel.delete.mockRejectedValue(error);

      await expect(repository.remove(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('restore deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockUsuarioModel.update.mockRejectedValue(error);

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('remove deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockUsuarioModel.delete.mockRejectedValue(error);

      await expect(repository.remove(1)).rejects.toThrow('Generic DB Error');
    });

    it('restore deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockUsuarioModel.update.mockRejectedValue(error);

      await expect(repository.restore(1)).rejects.toThrow('Generic DB Error');
    });

    it('remove deve retornar null quando delete resolve com null', async () => {
      mockUsuarioModel.delete.mockResolvedValue(null);

      const result = await repository.remove(1);

      expect(result).toBeNull();
    });

    it('restore deve retornar null quando update resolve com null', async () => {
      mockUsuarioModel.update.mockResolvedValue(null);

      const result = await repository.restore(1);

      expect(result).toBeNull();
    });

    it('findOne deve usar prisma.usuario (não extended) quando includeDeleted=true', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.c',
        senha: 'h',
        deletedAt: new Date(),
        ativo: false,
      });

      await repository.findOne(1, true);

      expect(mockUsuarioModel.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });

    it('findOne deve retornar undefined quando mapToEntity retorna null', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(1);

      expect(result).toBeUndefined();
    });

    it('findAll deve usar page=1 e limit=10 como default', async () => {
      mockUsuarioModel.findMany.mockResolvedValue([]);
      mockUsuarioModel.count.mockResolvedValue(0);

      await repository.findAll({} as any);

      expect(mockUsuarioModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('mapToEntity deve tratar senha null como undefined (via findOne com senha null)', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.c',
        senha: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ativo: true,
      });

      const result = await repository.findOne(1);

      expect(result).not.toBeNull();
      expect(result!.senha).toBeUndefined();
    });
  });
});
