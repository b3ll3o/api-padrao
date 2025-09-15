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

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar uma permissão', async () => {
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

    it('deve lançar ConflictException se uma permissão com o mesmo nome já existir', async () => {
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

  describe('busca de todos', () => {
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

    it('deve retornar uma lista paginada de permissões não excluídas por padrão', async () => {
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

    it('deve retornar uma lista paginada de todas as permissões, incluindo as excluídas', async () => {
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

  describe('busca por um', () => {
    const expectedPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    } as Permissao;

    it('deve retornar uma única permissão (não excluída) por padrão', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, false); // Default includeDeleted is false
    });

    it('deve retornar uma única permissão, incluindo as excluídas', async () => {
      const deletedPermissao = { ...expectedPermissao, deletedAt: new Date() };
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(
        deletedPermissao,
      );

      const result = await service.findOne(1, true); // Pass true for includeDeleted

      expect(result).toEqual(deletedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('deve lançar NotFoundException se a permissão não for encontrada', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999, false);
    });
  });

  describe('busca por nome', () => {
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

    it('deve retornar uma lista paginada de permissões não excluídas contendo o nome por padrão', async () => {
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

    it('deve retornar uma lista paginada de todas as permissões contendo o nome, incluindo as excluídas', async () => {
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

  describe('atualização', () => {
    const existingPermissao = {
      id: 1,
      nome: 'Old Permissao',
      codigo: 'OLD_PERMISSAO',
      descricao: 'Old Description',
      deletedAt: null,
    } as Permissao;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }],
    };

    const mockUserUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'user@example.com',
      perfis: [{ codigo: 'USER' }],
    };

    type UpdatePermissaoDto = {
      nome?: string;
      codigo?: string;
      descricao?: string;
      ativo?: boolean;
    };

    it('deve atualizar uma permissão', async () => {
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

      const result = await service.update(1, updatePermissaoDto, mockAdminUsuarioLogado);

      expect(result).toEqual(expectedPermissao);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockPermissaoRepository.update).toHaveBeenCalledWith(
        1,
        updatePermissaoDto,
      );
    });

    it('deve lançar NotFoundException se a permissão a ser atualizada não for encontrada', async () => {
      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(999, {
          nome: 'Non Existent',
          codigo: 'NON_EXISTENT',
          descricao: 'Non Existent',
        } as UpdatePermissaoDto, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissaoRepository.findOne).toHaveBeenCalledWith(999, true);
      expect(mockPermissaoRepository.update).not.toHaveBeenCalled();
    });



    it('deve restaurar uma permissão com soft delete via flag ativo', async () => {
      const softDeletedPermissao = { ...existingPermissao, deletedAt: new Date() };
      const updateDto: UpdatePermissaoDto = { ativo: true };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(softDeletedPermissao);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true);
      (mockPermissaoRepository.restore as jest.Mock).mockResolvedValue({ ...softDeletedPermissao, deletedAt: null });

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result.deletedAt).toBeNull();
      expect(mockPermissaoRepository.restore).toHaveBeenCalledWith(1);
      expect(mockPermissaoRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException se tentar restaurar uma permissão não deletada via flag ativo', async () => {
      const nonDeletedPermissao = { ...existingPermissao, deletedAt: null };
      const updateDto: UpdatePermissaoDto = { ativo: true };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(nonDeletedPermissao);

      await expect(service.update(1, updateDto, mockAdminUsuarioLogado)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPermissaoRepository.restore).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se não for admin ao tentar restaurar via flag ativo', async () => {
      const softDeletedPermissao = { ...existingPermissao, deletedAt: new Date() };
      const updateDto: UpdatePermissaoDto = { ativo: true };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(softDeletedPermissao);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(false);

      await expect(service.update(1, updateDto, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPermissaoRepository.restore).not.toHaveBeenCalled();
    });

    it('deve realizar soft delete de uma permissão via flag ativo', async () => {
      const nonDeletedPermissao = { ...existingPermissao, deletedAt: null };
      const updateDto: UpdatePermissaoDto = { ativo: false };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(nonDeletedPermissao);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(true);
      (mockPermissaoRepository.remove as jest.Mock).mockResolvedValue({ ...nonDeletedPermissao, deletedAt: new Date() });

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result.deletedAt).not.toBeNull();
      expect(mockPermissaoRepository.remove).toHaveBeenCalledWith(1);
      expect(mockPermissaoRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException se tentar deletar uma permissão já deletada via flag ativo', async () => {
      const softDeletedPermissao = { ...existingPermissao, deletedAt: new Date() };
      const updateDto: UpdatePermissaoDto = { ativo: false };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(softDeletedPermissao);

      await expect(service.update(1, updateDto, mockAdminUsuarioLogado)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPermissaoRepository.remove).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se não for admin ao tentar deletar via flag ativo', async () => {
      const nonDeletedPermissao = { ...existingPermissao, deletedAt: null };
      const updateDto: UpdatePermissaoDto = { ativo: false };

      (mockPermissaoRepository.findOne as jest.Mock).mockResolvedValue(nonDeletedPermissao);
      (mockAuthorizationService.isAdmin as jest.Mock).mockReturnValue(false);

      await expect(service.update(1, updateDto, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPermissaoRepository.remove).not.toHaveBeenCalled();
    });
  });

  
});
