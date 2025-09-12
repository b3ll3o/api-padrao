import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Request } from 'express';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let service: UsuariosService;

  const mockUsuariosService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
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

  describe('findOne', () => {
    it('should return a user', async () => {
      const user = new Usuario();
      mockUsuariosService.findOne.mockResolvedValue(user);
      const req = {
        usuarioLogado: { userId: 1, email: 'test@example.com', perfis: [] },
      } as unknown as Request;

      const result = await controller.findOne('1', req);

      expect(result).toEqual(user);
      expect(service.findOne).toHaveBeenCalledWith(1, req.usuarioLogado);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = new Usuario();
      mockUsuariosService.update.mockResolvedValue(updatedUser);
      const req = {
        usuarioLogado: { userId: 1, email: 'test@example.com', perfis: [] },
      } as unknown as Request;

      const result = await controller.update('1', updateDto, req);

      expect(result).toEqual(updatedUser);
      expect(service.update).toHaveBeenCalledWith(
        1,
        updateDto,
        req.usuarioLogado,
      );
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      const user = new Usuario();
      mockUsuariosService.remove.mockResolvedValue(user);
      const req = {
        usuarioLogado: { userId: 1, email: 'test@example.com', perfis: [] },
      } as unknown as Request;

      const result = await controller.remove('1', req);

      expect(result).toEqual(user);
      expect(service.remove).toHaveBeenCalledWith(1, req.usuarioLogado);
    });
  });

  describe('restore', () => {
    it('should restore a user', async () => {
      const user = new Usuario();
      mockUsuariosService.restore.mockResolvedValue(user);
      const req = {
        usuarioLogado: { userId: 1, email: 'test@example.com', perfis: [] },
      } as unknown as Request;

      const result = await controller.restore('1', req);

      expect(result).toEqual(user);
      expect(service.restore).toHaveBeenCalledWith(1, req.usuarioLogado);
    });
  });
});
