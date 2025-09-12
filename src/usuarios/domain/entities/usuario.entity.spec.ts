import { Usuario } from './usuario.entity';

describe('Usuario', () => {
  it('should be defined', () => {
    const usuario = new Usuario();
    expect(usuario).toBeDefined();
  });
});
