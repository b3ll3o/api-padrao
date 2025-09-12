import { Usuario } from './usuario.entity';
import * as bcrypt from 'bcrypt';

// Mock the entire bcrypt module
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('Usuario Entity', () => {
  let usuario: Usuario;

  beforeEach(() => {
    usuario = new Usuario();
  });

  describe('comparePassword', () => {
    it('should return false if senha is not set', async () => {
      usuario.senha = undefined;
      const result = await usuario.comparePassword('anyPassword');
      expect(result).toBe(false);
    });

    it('should return true for a correct password', async () => {
      usuario.senha = 'hashedPassword';
      (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Cast to jest.Mock

      const result = await usuario.comparePassword('correctPassword');
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('correctPassword', 'hashedPassword');
    });

    it('should return false for an incorrect password', async () => {
      usuario.senha = 'hashedPassword';
      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Cast to jest.Mock

      const result = await usuario.comparePassword('incorrectPassword');
      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith('incorrectPassword', 'hashedPassword');
    });
  });
});
