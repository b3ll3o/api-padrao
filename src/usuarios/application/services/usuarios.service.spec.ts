import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { ConflictException } from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let repository: UsuarioRepository;

  const mockUsuarioRepository = {
    create: jest.fn(),
    findByEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    repository = module.get<UsuarioRepository>(UsuarioRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user successfully', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue({
        id: 1,
        ...createUsuarioDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createUsuarioDto);

      expect(result).toBeDefined();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createUsuarioDto.email,
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalled();
      expect(result).not.toHaveProperty('senha');
    });

    it('should throw a ConflictException if email already exists', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: 'hashedpassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.create(createUsuarioDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
