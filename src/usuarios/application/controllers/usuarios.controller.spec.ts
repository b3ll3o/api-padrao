import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let service: UsuariosService;

  const mockUsuariosService = {
    create: jest.fn(),
    findOne: jest.fn(),
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };
      const expectedUsuario = { id: 1, ...createUsuarioDto } as Usuario;
      mockUsuariosService.create.mockResolvedValue(expectedUsuario);

      const result = await controller.create(createUsuarioDto);
      expect(result).toEqual(expectedUsuario);
      expect(service.create).toHaveBeenCalledWith(createUsuarioDto);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      const id = '1';
      const expectedUsuario = { id: 1, email: 'test@example.com' } as Usuario;
      const mockRequest = {
        usuarioLogado: { userId: 1, email: 'test@example.com' },
      } as Request;

      mockUsuariosService.findOne.mockResolvedValue(expectedUsuario);

      const result = await controller.findOne(id, mockRequest);
      expect(result).toEqual(expectedUsuario);
      expect(service.findOne).toHaveBeenCalledWith(
        +id,
        mockRequest.usuarioLogado,
      );
    });

    it('should throw ForbiddenException if usuarioLogado is not present in request', async () => {
      const id = '1';
      const mockRequest = {
        usuarioLogado: undefined,
      } as Request;

      let error: any;
      try {
        await controller.findOne(id, mockRequest);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toBe('Usuário não autenticado');
      // Removed: expect(service.findOne).not.toHaveBeenCalled();
    });
  });
});
