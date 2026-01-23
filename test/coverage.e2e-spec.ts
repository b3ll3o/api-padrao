import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PerfilRepository } from '../src/perfis/domain/repositories/perfil.repository';
import { UsuarioRepository } from '../src/usuarios/domain/repositories/usuario.repository';

describe('Coverage Tests (e2e)', () => {
  let app: INestApplication;
  let perfilRepository: PerfilRepository;
  let usuarioRepository: UsuarioRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    perfilRepository = app.get<PerfilRepository>(PerfilRepository);
    usuarioRepository = app.get<UsuarioRepository>(UsuarioRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PrismaPerfilRepository Coverage', () => {
    it('should return undefined when updating a non-existent profile', async () => {
      const result = await perfilRepository.update(999999, {
        nome: 'Non-existent',
      });
      expect(result).toBeUndefined();
    });

    it('should throw "Perfil ... não encontrado" when removing a non-existent profile', async () => {
      await expect(perfilRepository.remove(999999)).rejects.toThrow(
        /Perfil com ID 999999 não encontrado/,
      );
    });

    it('should throw "Perfil ... não encontrado" when restoring a non-existent profile', async () => {
      await expect(perfilRepository.restore(999999)).rejects.toThrow(
        /Perfil com ID 999999 não encontrado/,
      );
    });
  });

  describe('PrismaUsuarioRepository Coverage', () => {
    it('should throw "Usuário ... não encontrado" when removing a non-existent user', async () => {
      await expect(usuarioRepository.remove(999999)).rejects.toThrow(
        /Usuário com ID 999999 não encontrado/,
      );
    });

    it('should throw "Usuário ... não encontrado" when restoring a non-existent user', async () => {
      await expect(usuarioRepository.restore(999999)).rejects.toThrow(
        /Usuário com ID 999999 não encontrado/,
      );
    });
  });
});
