import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesController } from './permissoes.controller';
import { PermissoesService } from '../services/permissoes.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { FastifyRequest } from 'fastify'; // Import Request
import { AuthorizationService } from '../../../shared/domain/services/authorization.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('PermissoesController', () => {
  let controller: PermissoesController;
  let service: PermissoesService;

  const mockPermissoesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByNomeContaining: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(), // Added
  };

  // Mock Request object for @Req()
  const mockRequest = (isAdmin: boolean = false, userId?: number) => {
    const req: Partial<FastifyRequest> = {
      usuarioLogado: {
        userId: userId || 1,
        email: 'test@example.com',
        empresas: isAdmin
          ? [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }]
          : [],
      },
      headers: {}, // Add headers for FastifyRequest compatibility if needed
    };
    return req as FastifyRequest;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissoesController],
      providers: [
        {
          provide: PermissoesService,
          useValue: mockPermissoesService,
        },
        {
          provide: AuthorizationService,
          useValue: {
            isAdmin: jest.fn(() => true), // Mock isAdmin to return true for testing purposes
          },
        },
      ],
    }).compile();

    controller = module.get<PermissoesController>(PermissoesController);
    service = module.get<PermissoesService>(PermissoesService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar uma permissão', async () => {
      const createPermissaoDto: CreatePermissaoDto = {
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
      };
      const expectedPermissao = { id: 1, ...createPermissaoDto } as Permissao;
      (mockPermissoesService.create as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await controller.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(service.create).toHaveBeenCalledWith(createPermissaoDto);
    });
  });

  describe('busca de todos', () => {
    it('deve retornar uma lista paginada de permissões', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Permissao 1' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (mockPermissoesService.findAll as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.findAll(paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('busca por um', () => {
    it('deve retornar uma única permissão por ID', async () => {
      const id = '1';
      const expectedPermissao = { id: 1, nome: 'Test Permissao' } as Permissao;
      (mockPermissoesService.findOne as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await controller.findOne(id);
      expect(result).toEqual(expectedPermissao);
      expect(service.findOne).toHaveBeenCalledWith(+id);
    });
  });

  describe('busca por nome', () => {
    it('deve retornar uma lista paginada de permissões por nome', async () => {
      const nome = 'Test';
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Test Permissao' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (
        mockPermissoesService.findByNomeContaining as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const result = await controller.findByNome(nome, paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findByNomeContaining).toHaveBeenCalledWith(
        nome,
        paginationDto,
      );
    });
  });

  describe('atualização', () => {
    it('deve lançar NotFoundException se a permissão não for encontrada', async () => {
      (mockPermissoesService.update as jest.Mock).mockRejectedValueOnce(
        new NotFoundException('Permissão não encontrada'),
      );

      await expect(
        controller.update('999', { nome: 'Non Existent' }, {
          usuarioLogado: mockRequest(true).usuarioLogado,
        } as FastifyRequest),
      ).rejects.toThrow(NotFoundException);
      expect(mockPermissoesService.update).toHaveBeenCalledWith(
        999,
        { nome: 'Non Existent' },
        mockRequest(true).usuarioLogado,
      );
    });

    it('deve lançar ForbiddenException se o usuário não estiver autenticado', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = { nome: 'Test' };
      const req = {} as FastifyRequest; // No usuarioLogado

      let error: ForbiddenException | undefined;
      try {
        await controller.update('1', updatePermissaoDto, req);
      } catch (e) {
        error = e as ForbiddenException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.message).toBe('Usuário não autenticado');
      expect(mockPermissoesService.update).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se um não-admin tentar restaurar uma permissão', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = { ativo: true };
      const req = mockRequest(false); // Non-admin user

      // Override the isAdmin mock for this specific test to return false
      (
        controller['authorizationService'].isAdmin as jest.Mock
      ).mockReturnValueOnce(false);

      let error: ForbiddenException | undefined;
      try {
        await controller.update('1', updatePermissaoDto, req);
      } catch (e) {
        error = e as ForbiddenException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.message).toBe(
        'Somente administradores podem restaurar permissões.',
      );
      expect(controller['authorizationService'].isAdmin).toHaveBeenCalledWith(
        req.usuarioLogado,
      );
      expect(mockPermissoesService.update).not.toHaveBeenCalled();
    });
  });
});
