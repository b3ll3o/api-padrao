import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesService } from './permissoes.service';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { Permissao } from '../../domain/entities/permissao.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { AuthorizationService } from 'src/shared/domain/services/authorization.service'; // Added

describe('PermissoesService', () => {
  let service: PermissoesService;
  let mockPermissaoRepository: Partial<PermissaoRepository>;
  let mockAuthorizationService: Partial<AuthorizationService>; // Added

  beforeEach(async () => {
    mockPermissaoRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
      findByNome: jest.fn(),
      findByNomeContaining: jest.fn(),
    };

    mockAuthorizationService = {
      isAdmin: jest.fn(),
    }; // Added

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissoesService,
        {
          provide: PermissaoRepository,
          useValue: mockPermissaoRepository,
        },
        {
          provide: PrismaService, // Keep PrismaService mock if it's used indirectly
          useValue: {},
        },
        {
          provide: AuthorizationService, // Added
          useValue: mockAuthorizationService, // Added
        },
      ],
    }).compile();

    service = module.get<PermissoesService>(PermissoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a permissao', async () => {
      const createPermissaoDto = {
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Permissão de teste',
      };
      const expectedPermissao = {
        id: 1,
        ...createPermissaoDto,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null, // Added
      } as Permissao;
      (mockPermissaoRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPermissaoRepository.create as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await service.create(createPermissaoDto);

      expect(result).toEqual(expectedPermissao);
      expect(mockPermissaoRepository.findByNome).toHaveBeenCalledWith(
        createPermissaoDto.nome,
      );
      expect(mockPermissaoRepository.create).toHaveBeenCalledWith(
        createPermissaoDto,
      );
    });

    it('should throw ConflictException if permissao with same name already exists', async () => {
      const createPermissaoDto = {
        nome: 'Existing Permissao',
        codigo: 'EXISTING_PERMISSAO',
        descricao: 'Permissão existente',
      };
      (mockPermissaoRepository.findByNome as jest.Mock).mockResolvedValue({
        id: 1,
        nome: 'Existing Permissao',
        codigo: 'EXISTING_PERMISSAO',
        descricao: 'Permissão existente',
        deletedAt: null,
      });

      await expect(service.create(createPermissaoDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPermissaoRepository.findByNome).toHaveBeenCalledWith(
        createPermissaoDto.nome,
      );
      expect(mockPermissaoRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const expectedPermissoes = [
      {
        id: 1,
        nome: 'Permissao 1',
        codigo: 'PERMISSAO_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Permissao 2',
        codigo: 'PERMISSAO_2',
        descricao: 'Desc 2',
        deletedAt: new Date(),
      },
    ] as Permissao[];

    it('should return a paginated list of non-deleted permissoes by default', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPermissaoRepository.findAll as jest.Mock).mockResolvedValue([
        [expectedPermissoes[0]],
        1,
      ]);

      const result = await service.findAll(paginationDto);

      expect(result.data).toEqual([expectedPermissoes[0]]);
      expect(result.total).toBe(1);
      expect(mockPermissaoRepository.findAll).toHaveBeenCalledWith(
        0,
        10,
        false,
      ); // Default includeDeleted is false
    });

    it('should return a paginated list of all permissoes including deleted', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPermissaoRepository.findAll as jest.Mock).mockResolvedValue([
        expectedPermissoes,
        2,
      ]);

      const result = await service.findAll(paginationDto, true); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPermissoes);
      expect(result.total).toBe(2);
      expect(mockPermissaoRepository.findAll).toHaveBeenCalledWith(0, 10, true);
    });
  });

  describe('findOne', () => {
    const expectedPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    } as Permissao;

    it('should return a single permissao (not deleted) by default', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, false); // Default includeDeleted is false
    });

    it('should return a single permissao including deleted', async () => {
      const deletedPermissao = { ...expectedPermissao, deletedAt: new Date() };
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        deletedPermissao,
      );

      const result = await service.findOne(1, true); // Pass true for includeDeleted

      expect(result).toEqual(deletedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('should throw NotFoundException if permissao not found', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999, false);
    });
  });

  describe('findByNome', () => {
    const expectedPermissoes = [
      {
        id: 1,
        nome: 'Test Permissao 1',
        codigo: 'TEST_PERMISSAO_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Another Test Permissao',
        codigo: 'ANOTHER_TEST_PERMISSAO',
        descricao: 'Desc 2',
        deletedAt: new Date(),
      },
    ] as Permissao[];

    it('should return a paginated list of non-deleted permissoes containing the name by default', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPermissaoRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([[expectedPermissoes[0]], 1]);

      const result = await service.findByNome('Test Permissao', paginationDto);

      expect(result.data).toEqual([expectedPermissoes[0]]);
      expect(result.total).toBe(1);
      expect(mockPermissaoRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Permissao',
        0,
        10,
        false,
      ); // Added includeDeleted
    });

    it('should return a paginated list of all permissoes containing the name including deleted', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPermissaoRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([expectedPermissoes, 2]);

      const result = await service.findByNome(
        'Test Permissao',
        paginationDto,
        true,
      ); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPermissoes);
      expect(result.total).toBe(2);
      expect(mockPermissaoRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Permissao',
        0,
        10,
        true,
      ); // Added includeDeleted
    });
  });

  describe('update', () => {
    const existingPermissao = {
      id: 1,
      nome: 'Old Permissao',
      codigo: 'OLD_PERMISSAO',
      descricao: 'Old Description',
      deletedAt: null,
    } as Permissao;

    it('should update a permissao', async () => {
      const updatePermissaoDto = {
        nome: 'Updated Permissao',
        codigo: 'UPDATED_PERMISSAO',
        descricao: 'Permissão atualizada',
      };
      const expectedPermissao = {
        ...existingPermissao,
        ...updatePermissaoDto,
      } as Permissao;

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        existingPermissao,
      ); // For the findOne call inside update
      (mockPermissaoRepository.update as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await service.update(1, updatePermissaoDto);

      expect(result).toEqual(expectedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockPermissaoRepository.update).toHaveBeenCalledWith(
        1,
        updatePermissaoDto,
      );
    });

    it('should throw NotFoundException if permissao to update not found', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(999, {
          nome: 'Non Existent',
          codigo: 'NON_EXISTENT',
          descricao: 'Non Existent',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999, true);
      expect(mockPermissaoRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const mockPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    } as Permissao;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    const mockUserUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'user@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    it('should soft delete a permissao if admin', async () => {
      const softDeletedPermissao = { ...mockPermissao, deletedAt: new Date() };
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        mockPermissao,
      ); // Find only non-deleted
      (mockPermissaoRepository.remove as jest.Mock).mockResolvedValue(
        softDeletedPermissao,
      );
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true); // Mock isAdmin

      const result = await service.remove(1, mockAdminUsuarioLogado);

      expect(result).toEqual(softDeletedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1); // Removed false
      expect(mockAuthorizationService.isAdmin).toHaveBeenCalledWith(
        mockAdminUsuarioLogado,
      ); // Verify isAdmin call
      expect(mockPermissaoRepository.remove).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if permissao not found', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true); // Mock isAdmin

      await expect(service.remove(999, mockAdminUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999); // Removed false
      expect(mockPermissaoRepository.remove).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if not admin', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        mockPermissao,
      );
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(false); // Mock isAdmin

      await expect(service.remove(1, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1); // Removed false
      expect(mockAuthorizationService.isAdmin).toHaveBeenCalledWith(
        mockUserUsuarioLogado,
      ); // Verify isAdmin call
      expect(mockPermissaoRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    const mockPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: new Date(), // Soft deleted
    } as Permissao;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    const mockUserUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'user@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    it('should restore a soft-deleted permissao if admin', async () => {
      const restoredPermissao = { ...mockPermissao, deletedAt: null };
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        mockPermissao,
      ); // Find soft-deleted permissao
      (mockPermissaoRepository.restore as jest.Mock).mockResolvedValue(
        restoredPermissao,
      );
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true); // Mock isAdmin

      const result = await service.restore(1, mockAdminUsuarioLogado);

      expect(result).toEqual(restoredPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockAuthorizationService.isAdmin).toHaveBeenCalledWith(
        mockAdminUsuarioLogado,
      ); // Verify isAdmin call
      expect(mockPermissaoRepository.restore).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if permissao not found', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true); // Mock isAdmin

      await expect(
        service.restore(999, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999, true);
      expect(mockPermissaoRepository.restore).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if permissao is not soft-deleted', async () => {
      const nonDeletedPermissao = { ...mockPermissao, deletedAt: null };
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPermissao,
      );
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true); // Mock isAdmin

      await expect(service.restore(1, mockAdminUsuarioLogado)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockPermissaoRepository.restore).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if not admin', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        mockPermissao,
      );
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(false); // Mock isAdmin

      await expect(service.restore(1, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockAuthorizationService.isAdmin).toHaveBeenCalledWith(
        mockUserUsuarioLogado,
      ); // Verify isAdmin call
      expect(mockPermissaoRepository.restore).not.toHaveBeenCalled();
    });
  });
});
