import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let service: UsuariosService;

  const mockUsuariosService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    findAll: jest.fn(),
  };

  const mockUsuarioLogado: JwtPayload = {
    userId: 1,
    email: 'test@example.com',
    empresas: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        {
          provide: UsuariosService,
          useValue: mockUsuariosService,
        },
      ],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
    service = module.get<UsuariosService>(UsuariosService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um usuário', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const createdUser = new Usuario();
      mockUsuariosService.create.mockResolvedValue(createdUser);

      const result = await controller.create(createDto);

      expect(result).toEqual(createdUser);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('busca por um', () => {
    it('deve retornar um usuário', async () => {
      const user = new Usuario();
      mockUsuariosService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('1', mockUsuarioLogado);

      expect(result).toEqual(user);
    });
  });

  describe('atualização', () => {
    it('deve atualizar um usuário', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = new Usuario();
      mockUsuariosService.update.mockResolvedValue(updatedUser);

      const result = await controller.update(
        '1',
        updateDto,
        mockUsuarioLogado,
        undefined,
      );

      expect(result).toEqual(updatedUser);
      expect(service.update).toHaveBeenCalledWith(
        1,
        updateDto,
        mockUsuarioLogado,
        undefined,
      );
    });
  });
});
