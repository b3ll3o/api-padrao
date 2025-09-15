import { Usuario } from './usuario.entity';

describe('Usuario', () => {
  it('deve ser definido', () => {
    const usuario = new Usuario();
    expect(usuario).toBeDefined();
  });
});
