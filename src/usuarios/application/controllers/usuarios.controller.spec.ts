import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { EmpresasService } from '../../../empresas/application/services/empresas.service';

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

  const mockEmpresasService = {
    findCompaniesByUser: jest.fn(),
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
        {
          provide: EmpresasService,
          useValue: mockEmpresasService,
        },
      ],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
    service = module.get<UsuariosService>(UsuariosService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(UsuariosController);
  });

  describe('criação', () => {
    // REQ-USER-001: POST /usuarios (público, auto-cadastro)
    // REQ-USER-008: 201 com id, email, timestamps
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
    // REQ-USER-020: GET /usuarios/:id
    // REQ-USER-021: exigir JWT + READ_USUARIO_BY_ID
    // REQ-USER-026: excluir senha da resposta
    it('deve retornar um usuário', async () => {
      const user = new Usuario();
      mockUsuariosService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('1', mockUsuarioLogado);

      expect(result).toEqual(user);
    });
  });

  describe('atualização', () => {
    // REQ-USER-030: PATCH /usuarios/:id
    // REQ-USER-031: exigir permissão UPDATE_USUARIO
    // REQ-USER-032: throttling 10 req/min
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
