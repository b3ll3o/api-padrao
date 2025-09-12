import { Test, TestingModule } from '@nestjs/testing';
import { PerfisController } from './perfis.controller';
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

describe('PerfisController', () => {
  let controller: PerfisController;
  let service: PerfisService;

  const mockPerfisService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByNomeContaining: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerfisController],
      providers: [
        {
          provide: PerfisService,
          useValue: mockPerfisService,
        },
      ],
    }).compile();

    controller = module.get<PerfisController>(PerfisController);
    service = module.get<PerfisService>(PerfisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a perfil', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
      };
      const expectedPerfil = { id: 1, ...createPerfilDto } as Perfil;
      mockPerfisService.create.mockResolvedValue(expectedPerfil);

      const result = await controller.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(service.create).toHaveBeenCalledWith(createPerfilDto);
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of perfis', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Perfil> = {
        data: [{ id: 1, nome: 'Perfil 1' } as Perfil],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockPerfisService.findAll.mockResolvedValue(expectedResponse);

      const result = await controller.findAll(paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    it('should return a single perfil by ID', async () => {
      const id = '1';
      const expectedPerfil = { id: 1, nome: 'Test Perfil' } as Perfil;
      mockPerfisService.findOne.mockResolvedValue(expectedPerfil);

      const result = await controller.findOne(id);
      expect(result).toEqual(expectedPerfil);
      expect(service.findOne).toHaveBeenCalledWith(+id);
    });
  });

  describe('findByNome', () => {
    it('should return a paginated list of perfis by name', async () => {
      const nome = 'Test';
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Perfil> = {
        data: [{ id: 1, nome: 'Test Perfil' } as Perfil],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockPerfisService.findByNomeContaining.mockResolvedValue(expectedResponse);

      const result = await controller.findByNome(nome, paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findByNomeContaining).toHaveBeenCalledWith(nome, paginationDto);
    });
  });

  describe('update', () => {
    it('should update a perfil', async () => {
      const id = '1';
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Updated Perfil' };
      const expectedPerfil = { id: 1, ...updatePerfilDto } as Perfil;
      mockPerfisService.update.mockResolvedValue(expectedPerfil);

      const result = await controller.update(id, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(service.update).toHaveBeenCalledWith(+id, updatePerfilDto);
    });
  });

  describe('remove', () => {
    it('should remove a perfil', async () => {
      const id = '1';
      mockPerfisService.remove.mockResolvedValue(undefined);

      await controller.remove(id);
      expect(service.remove).toHaveBeenCalledWith(+id);
    });
  });
});
