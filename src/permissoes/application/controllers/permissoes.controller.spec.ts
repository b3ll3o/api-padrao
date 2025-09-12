import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesController } from './permissoes.controller';
import { PermissoesService } from '../services/permissoes.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissoesController],
      providers: [
        {
          provide: PermissoesService,
          useValue: mockPermissoesService,
        },
      ],
    }).compile();

    controller = module.get<PermissoesController>(PermissoesController);
    service = module.get<PermissoesService>(PermissoesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a permissao', async () => {
      const createPermissaoDto: CreatePermissaoDto = {
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
      };
      const expectedPermissao = { id: 1, ...createPermissaoDto } as Permissao;
      mockPermissoesService.create.mockResolvedValue(expectedPermissao);

      const result = await controller.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(service.create).toHaveBeenCalledWith(createPermissaoDto);
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of permissoes', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Permissao 1' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockPermissoesService.findAll.mockResolvedValue(expectedResponse);

      const result = await controller.findAll(paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    it('should return a single permissao by ID', async () => {
      const id = '1';
      const expectedPermissao = { id: 1, nome: 'Test Permissao' } as Permissao;
      mockPermissoesService.findOne.mockResolvedValue(expectedPermissao);

      const result = await controller.findOne(id);
      expect(result).toEqual(expectedPermissao);
      expect(service.findOne).toHaveBeenCalledWith(+id);
    });
  });

  describe('findByName', () => {
    it('should return a paginated list of permissoes by name', async () => {
      const nome = 'Test';
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Test Permissao' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockPermissoesService.findByNomeContaining.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.findByName(nome, paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findByNomeContaining).toHaveBeenCalledWith(
        nome,
        paginationDto,
      );
    });
  });

  describe('update', () => {
    it('should update a permissao', async () => {
      const id = '1';
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Updated Permissao',
      };
      const expectedPermissao = { id: 1, ...updatePermissaoDto } as Permissao;
      mockPermissoesService.update.mockResolvedValue(expectedPermissao);

      const result = await controller.update(id, updatePermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(service.update).toHaveBeenCalledWith(+id, updatePermissaoDto);
    });
  });

  describe('remove', () => {
    it('should remove a permissao', async () => {
      const id = '1';
      mockPermissoesService.remove.mockResolvedValue(undefined);

      await controller.remove(id);
      expect(service.remove).toHaveBeenCalledWith(+id);
    });
  });
});
