import { Test, TestingModule } from '@nestjs/testing';
import { PerfisController } from './perfis.controller';
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

describe('PerfisController', () => {
  let controller: PerfisController;
  let service: PerfisService;

  const mockPerfisService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByNomeContaining: jest.fn(),
    update: jest.fn(),
  };

  const mockUsuarioLogado: JwtPayload = {
    userId: 1,
    email: 'test@test.com',
    empresas: [],
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

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('deve criar um novo perfil', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST',
        descricao: 'Test description',
        empresaId: 'empresa-1',
      };
      const expectedResult = { id: 1, ...createPerfilDto } as Perfil;
      mockPerfisService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createPerfilDto);

      expect(result).toBe(expectedResult);
      expect(service.create).toHaveBeenCalledWith(createPerfilDto);
    });
  });

  describe('findAll', () => {
    it('deve retornar uma lista paginada de perfis', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResult: PaginatedResponseDto<Perfil> = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      mockPerfisService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(paginationDto, 'empresa-1');

      expect(result).toBe(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(
        paginationDto,
        false,
        'empresa-1',
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar um perfil pelo ID', async () => {
      const expectedResult = { id: 1, nome: 'Test' } as Perfil;
      mockPerfisService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne('1', 'empresa-1');

      expect(result).toBe(expectedResult);
      expect(service.findOne).toHaveBeenCalledWith(1, false, 'empresa-1');
    });
  });

  describe('update', () => {
    it('deve atualizar um perfil', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Updated' };
      const expectedResult = { id: 1, nome: 'Updated' } as Perfil;
      mockPerfisService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(
        '1',
        updatePerfilDto,
        mockUsuarioLogado,
        undefined,
      );

      expect(result).toBe(expectedResult);
      expect(service.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
        mockUsuarioLogado,
        undefined,
      );
    });
  });
});
