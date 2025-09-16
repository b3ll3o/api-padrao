import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesController } from './permissoes.controller';
import { PermissoesService } from '../services/permissoes.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Request } from 'express'; // Import Request
import { AuthorizationService } from '../../../shared/domain/services/authorization.service';

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
    const req: Partial<Request> = {
      usuarioLogado: {
        userId: userId || 1,
        email: 'test@example.com',
        perfis: isAdmin ? [{ codigo: 'ADMIN' }] : [], // Corrected perfis structure
      },
    };
    return req as Request;
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
    it('deve atualizar uma permissão', async () => {
      const id = '1';
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Updated Permissao',
        codigo: 'UPDATED_PERMISSAO',
        descricao: 'Permissão atualizada',
      };
      const expectedPermissao = { id: 1, ...updatePermissaoDto } as Permissao;
      (mockPermissoesService.update as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );
      const req = mockRequest(true); // Admin user

      const result = await controller.update(id, updatePermissaoDto, req);
      expect(result).toEqual(expectedPermissao);
      expect(service.update).toHaveBeenCalledWith(
        +id,
        updatePermissaoDto,
        req.usuarioLogado,
      );
    });
  });
});
