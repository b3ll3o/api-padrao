import { Test, TestingModule } from '@nestjs/testing';
import { PerfisService } from './perfis.service';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { Perfil } from '../../domain/entities/perfil.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PermissoesService } from '../../../permissoes/application/services/permissoes.service';

describe('PerfisService', () => {
  let service: PerfisService;
  let mockPerfilRepository: Partial<PerfilRepository>;
  let mockPermissoesService: Partial<PermissoesService>;

  const existingPerfil = {
    id: 1,
    nome: 'Old Perfil',
    codigo: 'OLD_PERFIL',
    descricao: 'Old Description',
    deletedAt: null,
    ativo: true,
    empresaId: 'empresa-1',
  } as Perfil;

  const mockAdminUsuarioLogado: JwtPayload = {
    userId: 1,
    email: 'admin@example.com',
    empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
  };

  const mockUserUsuarioLogado: JwtPayload = {
    userId: 2,
    email: 'user@example.com',
    empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
  };

  type UpdatePerfilDto = {
    nome?: string;
    codigo?: string;
    descricao?: string;
    ativo?: boolean;
    permissoesIds?: number[];
  };

  beforeEach(async () => {
    mockPerfilRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      findByNome: jest.fn(),
      findByNomeContaining: jest.fn(),
      restore: jest.fn(),
      remove: jest.fn(),
    };

    mockPermissoesService = {
      findOne: jest.fn(),
      findManyByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerfisService,
        {
          provide: PerfilRepository,
          useValue: mockPerfilRepository,
        },
        {
          provide: PermissoesService,
          useValue: mockPermissoesService,
        },
        {
          provide: PrismaService, // Keep PrismaService mock if it's used indirectly
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PerfisService>(PerfisService);
  });

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(PerfisService);
  });

  describe('criação', () => {
    // REQ-PERFIL-001: persistir Perfil escopado por empresaId
    // REQ-PERFIL-002: rejeitar criação duplicada (nome + empresaId) com HTTP 409
    // REQ-PERFIL-004: criar perfil sem permissoesIds (array vazio)
    it('deve criar um perfil', async () => {
      const createPerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Perfil de teste',
        permissoesIds: [1],
        empresaId: 'empresa-1',
      };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        deletedAt: null, // Added
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Perfil;
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPerfilRepository.create as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );
      (mockPermissoesService.findManyByIds as jest.Mock).mockResolvedValue([
        {
          id: 1,
          nome: 'Permissao 1',
          codigo: 'PERM_1',
          descricao: 'Desc 1',
          deletedAt: null,
          ativo: true,
        },
      ]);

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
        false,
        createPerfilDto.empresaId,
      );
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(mockPermissoesService.findManyByIds).toHaveBeenCalledWith([1]);
      expect(mockPermissoesService.findOne).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-004: criar perfil sem permissoesIds (array vazio)
    it('deve criar um perfil sem permissões', async () => {
      const createPerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Perfil de teste',
        empresaId: 'empresa-1',
      };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        deletedAt: null, // Added
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Perfil;
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPerfilRepository.create as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
        false,
        createPerfilDto.empresaId,
      );
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(mockPermissoesService.findOne).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-002: rejeitar criação duplicada (nome + empresaId) com HTTP 409
    it('deve lançar ConflictException se um perfil com o mesmo nome já existir', async () => {
      const createPerfilDto = {
        nome: 'Existing Perfil',
        codigo: 'EXISTING_PERFIL',
        descricao: 'Perfil existente',
        empresaId: 'empresa-1',
      };
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue({
        id: 1,
        nome: 'Existing Perfil',
        codigo: 'EXISTING_PERFIL',
        descricao: 'Perfil existente',
        deletedAt: null,
        empresaId: 'empresa-1',
      });

      await expect(service.create(createPerfilDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
        false,
        createPerfilDto.empresaId,
      );
      expect(mockPerfilRepository.create).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-005: validar permissoesIds existentes antes de persistir (update path)
    it('deve lançar NotFoundException se as permissões não existirem', async () => {
      const updatePerfilDto = {
        nome: 'Perfil com Permissões Inválidas',
        permissoesIds: [999],
      };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      );
      (mockPermissoesService.findManyByIds as jest.Mock).mockRejectedValue(
        new NotFoundException('Permissões não encontradas: 999'),
      );

      await expect(
        service.update(1, updatePerfilDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissoesService.findManyByIds).toHaveBeenCalledWith([999]);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-010: tratar ativo:true como restore (deletedAt=null, ativo=true)
    it('deve restaurar um perfil com soft delete via flag ativo', async () => {
      const softDeletedPerfil = { ...existingPerfil, deletedAt: new Date() };
      const updateDto: UpdatePerfilDto = { ativo: true };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );
      (mockPerfilRepository.restore as jest.Mock).mockResolvedValue({
        ...softDeletedPerfil,
        deletedAt: null,
        ativo: true,
      });

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result.deletedAt).toBeNull();
      expect(mockPerfilRepository.restore).toHaveBeenCalledWith(1, undefined);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-012: 409 quando ativo:true em perfil nao-deletado
    it('deve lançar ConflictException se tentar restaurar um perfil não deletado via flag ativo', async () => {
      const nonDeletedPerfil = { ...existingPerfil, deletedAt: null };
      const updateDto: UpdatePerfilDto = { ativo: true };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPerfil,
      );

      await expect(
        service.update(1, updateDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(ConflictException);
      expect(mockPerfilRepository.restore).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-011: exigir ADMIN para restore/delete via flag ativo (403 senao)
    it('deve lançar ForbiddenException se não for admin ao tentar restaurar via flag ativo', async () => {
      const softDeletedPerfil = { ...existingPerfil, deletedAt: new Date() };
      const updateDto: UpdatePerfilDto = { ativo: true };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );

      await expect(
        service.update(1, updateDto, mockUserUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPerfilRepository.restore).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-010: tratar ativo:false como soft delete (deletedAt=NOW, ativo=false)
    it('deve realizar soft delete de um perfil via flag ativo', async () => {
      const nonDeletedPerfil = { ...existingPerfil, deletedAt: null };
      const updateDto: UpdatePerfilDto = { ativo: false };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPerfil,
      );
      (mockPerfilRepository.remove as jest.Mock).mockResolvedValue({
        ...nonDeletedPerfil,
        deletedAt: new Date(),
        ativo: false,
      });

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result.deletedAt).not.toBeNull();
      expect(mockPerfilRepository.remove).toHaveBeenCalledWith(1);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-012: 409 quando ativo:false em perfil ja deletado
    it('deve lançar ConflictException se tentar deletar um perfil já deletado via flag ativo', async () => {
      const softDeletedPerfil = { ...existingPerfil, deletedAt: new Date() };
      const updateDto: UpdatePerfilDto = { ativo: false };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );

      await expect(
        service.update(1, updateDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(ConflictException);
      expect(mockPerfilRepository.remove).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-011: exigir ADMIN para delete via flag ativo (403 senao)
    it('deve lançar ForbiddenException se não for admin ao tentar deletar via flag ativo', async () => {
      const nonDeletedPerfil = { ...existingPerfil, deletedAt: null };
      const updateDto: UpdatePerfilDto = { ativo: false };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPerfil,
      );

      await expect(
        service.update(1, updateDto, mockUserUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPerfilRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('busca de todos', () => {
    const expectedPerfis = [
      {
        id: 1,
        nome: 'Perfil 1',
        codigo: 'PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        ativo: true,
        empresaId: 'empresa-1',
      },
      {
        id: 2,
        nome: 'Perfil 2',
        codigo: 'PERFIL_2',
        descricao: 'Desc 2',
        deletedAt: new Date(),
        ativo: false,
        empresaId: 'empresa-1',
      },
    ] as Perfil[];

    // REQ-PERFIL-006: listar Perfis filtrando soft-deletados por padrao
    it('deve retornar uma lista paginada de perfis não excluídos por padrão', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPerfilRepository.findAll as jest.Mock).mockResolvedValue([
        [expectedPerfis[0]],
        1,
      ]);

      const result = await service.findAll(paginationDto);

      expect(result.data).toEqual([expectedPerfis[0]]);
      expect(result.total).toBe(1);
      expect(mockPerfilRepository.findAll).toHaveBeenCalledWith(
        0,
        10,
        false,
        undefined,
      ); // Default includeDeleted is false
    });

    it('deve retornar uma lista paginada de todos os perfis, incluindo os excluídos', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPerfilRepository.findAll as jest.Mock).mockResolvedValue([
        expectedPerfis,
        2,
      ]);

      const result = await service.findAll(paginationDto, true); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPerfis);
      expect(result.total).toBe(2);
      expect(mockPerfilRepository.findAll).toHaveBeenCalledWith(
        0,
        10,
        true,
        undefined,
      );
    });

    // REQ-PERFIL-006: filtrar Perfis por empresaId
    it('deve retornar uma lista paginada de perfis filtrada por empresa', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPerfilRepository.findAll as jest.Mock).mockResolvedValue([
        expectedPerfis,
        2,
      ]);

      const result = await service.findAll(paginationDto, false, 'empresa-1');

      expect(result.data).toEqual(expectedPerfis);
      expect(result.total).toBe(2);
      expect(mockPerfilRepository.findAll).toHaveBeenCalledWith(
        0,
        10,
        false,
        'empresa-1',
      );
    });
  });

  describe('busca por um', () => {
    const expectedPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
      ativo: true,
      empresaId: 'empresa-1',
    } as Perfil;

    // REQ-PERFIL-007: buscar Perfil por ID (404 se nao encontrado)
    it('deve retornar um único perfil (não excluído) por padrão', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        1,
        false,
        undefined,
      ); // Default includeDeleted is false
    });

    it('deve retornar um único perfil, incluindo os excluídos', async () => {
      const deletedPerfil = { ...expectedPerfil, deletedAt: new Date() };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        deletedPerfil,
      );

      const result = await service.findOne(1, true); // Pass true for includeDeleted

      expect(result).toEqual(deletedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        1,
        true,
        undefined,
      );
    });

    // REQ-PERFIL-007: 404 se perfil nao encontrado
    it('deve lançar NotFoundException se o perfil não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        999,
        false,
        undefined,
      );
    });
  });

  describe('busca por nome', () => {
    const expectedPerfis = [
      {
        id: 1,
        nome: 'Test Perfil 1',
        codigo: 'TEST_PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        ativo: true,
        empresaId: 'empresa-1',
      },
      {
        id: 2,
        nome: 'Another Test Perfil',
        codigo: 'ANOTHER_TEST_PERFIL',
        descricao: 'Desc 2',
        deletedAt: new Date(),
        ativo: false,
        empresaId: 'empresa-1',
      },
    ] as Perfil[];

    // REQ-PERFIL-008: GET /perfis/nome/:nome busca case-insensitive contains
    it('deve retornar uma lista paginada de perfis não excluídos contendo o nome por padrão', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPerfilRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([[expectedPerfis[0]], 1]);

      const result = await service.findByNomeContaining(
        'Test Perfil',
        paginationDto,
      );

      expect(result.data).toEqual([expectedPerfis[0]]);
      expect(result.total).toBe(1);
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Perfil',
        0,
        10,
        false, // Default includeDeleted is false
        undefined,
      );
    });

    it('deve retornar uma lista paginada de todos os perfis contendo o nome, incluindo os excluídos', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPerfilRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([expectedPerfis, 2]);

      const result = await service.findByNomeContaining(
        'Test Perfil',
        paginationDto,
        true,
      ); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPerfis);
      expect(result.total).toBe(2);
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Perfil',
        0,
        10,
        true,
        undefined,
      );
    });
  });

  describe('atualização', () => {
    // REQ-PERFIL-009: partial update (nome, codigo, descricao, permissoesIds)
    // REQ-PERFIL-013: 404 quando PATCH /perfis/:id em id inexistente
    it('deve atualizar um perfil', async () => {
      const updatePerfilDto = {
        nome: 'Updated Perfil',
        codigo: 'UPDATED_PERFIL',
        descricao: 'Perfil atualizado',
        permissoesIds: [1],
      };
      const expectedPerfil = {
        ...existingPerfil,
        ...updatePerfilDto,
        permissoes: [
          {
            id: 2,
            codigo: 'READ',
            nome: 'Ler',
            descricao: 'Ler dados',
            deletedAt: null,
            ativo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ], // Added full Permissao object
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Perfil;

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      ); // For the findOne call inside update
      (mockPerfilRepository.update as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );
      (mockPermissoesService.findManyByIds as jest.Mock).mockResolvedValue([
        {
          id: 1,
          nome: 'Permissao 1',
          codigo: 'PERM_1',
          descricao: 'Desc 1',
          deletedAt: null,
          ativo: true,
        },
      ]);

      const result = await service.update(
        1,
        updatePerfilDto,
        mockAdminUsuarioLogado,
      );

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        1,
        true,
        undefined,
      ); // Should find including deleted
      expect(mockPerfilRepository.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
      );
      expect(mockPermissoesService.findManyByIds).toHaveBeenCalledWith([1]);
    });

    it('deve atualizar um perfil sem permissões', async () => {
      const updatePerfilDto = {
        nome: 'Updated Perfil',
        codigo: 'UPDATED_PERFIL',
        descricao: 'Perfil atualizado',
      };
      const expectedPerfil = {
        ...existingPerfil,
        ...updatePerfilDto,
      } as unknown as Perfil;

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      ); // For the findOne call inside update
      (mockPerfilRepository.update as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.update(
        1,
        updatePerfilDto,
        mockAdminUsuarioLogado,
      );

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        1,
        true,
        undefined,
      );
      expect(mockPerfilRepository.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
      );
      expect(mockPermissoesService.findOne).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-013: 404 quando PATCH /perfis/:id em id inexistente
    it('deve lançar NotFoundException se o perfil a ser atualizado não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(
          999,
          { nome: 'Non Existent' } as UpdatePerfilDto,
          mockAdminUsuarioLogado,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(
        999,
        true,
        undefined,
      );
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se as permissões não existirem', async () => {
      const updatePerfilDto = {
        nome: 'Perfil with Invalid Perms',
        permissoesIds: [999],
      };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      );
      (mockPermissoesService.findManyByIds as jest.Mock).mockRejectedValue(
        new NotFoundException('Permissões não encontradas: 999'),
      );

      await expect(
        service.update(1, updatePerfilDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissoesService.findManyByIds).toHaveBeenCalledWith([999]);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    // REQ-PERFIL-013: 404 se update retorna null apos findOne
    // [Branch coverage] if (!updatedPerfil) — repo.update retorna null apos findOne bem-sucedido
    it('deve lançar NotFoundException se perfilRepository.update retornar null', async () => {
      const updatePerfilDto = {
        nome: 'Qualquer',
        codigo: 'QUALQUER',
        descricao: 'desc',
      };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      );
      (mockPerfilRepository.update as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(1, updatePerfilDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
      );
    });

    // REQ-PERFIL-010: restore (ativo:true) — branch null check
    // [Branch coverage] if (!restoredPerfil) — repo.restore retorna null apos findOne soft-deleted
    it('deve lançar NotFoundException se perfilRepository.restore retornar null', async () => {
      const softDeletedPerfil = { ...existingPerfil, deletedAt: new Date() };
      const updateDto: UpdatePerfilDto = { ativo: true };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );
      (mockPerfilRepository.restore as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(1, updateDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.restore).toHaveBeenCalledWith(1, undefined);
    });

    // REQ-PERFIL-010: soft delete (ativo:false) — branch null check
    // [Branch coverage] if (!softDeletedPerfil) — repo.remove retorna null
    it('deve lançar NotFoundException se perfilRepository.remove retornar null', async () => {
      const nonDeletedPerfil = { ...existingPerfil, deletedAt: null };
      const updateDto: UpdatePerfilDto = { ativo: false };

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPerfil,
      );
      (mockPerfilRepository.remove as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(1, updateDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.remove).toHaveBeenCalledWith(1);
    });
  });

  // REQ-PERF-014 — Cenário "Listar permissões por perfil" (features/perfis.feature)
  describe('listPermissoesByPerfilId', () => {
    it('deve retornar [] quando empresaId é undefined (fail-safe)', async () => {
      const result = await service.listPermissoesByPerfilId('1');
      expect(result).toEqual([]);
      expect(mockPerfilRepository.findOne).not.toHaveBeenCalled();
    });

    it('deve retornar códigos das permissões vinculadas ao perfil', async () => {
      const perfilWithPerms = {
        ...existingPerfil,
        permissoes: [{ codigo: 'READ_USUARIOS' }, { codigo: 'WRITE_USUARIOS' }],
      };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        perfilWithPerms,
      );
      const result = await service.listPermissoesByPerfilId(
        '1',
        'empresa-uuid-123',
      );
      expect(result).toEqual(['READ_USUARIOS', 'WRITE_USUARIOS']);
    });

    it('deve retornar [] se o perfil não tem permissões', async () => {
      const perfilNoPerms = { ...existingPerfil, permissoes: [] };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        perfilNoPerms,
      );
      const result = await service.listPermissoesByPerfilId(
        '1',
        'empresa-uuid-123',
      );
      expect(result).toEqual([]);
    });

    it('deve lançar NotFoundException se o perfil não existir', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.listPermissoesByPerfilId('999', 'empresa-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
