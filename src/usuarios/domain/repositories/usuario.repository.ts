import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Partial<Usuario>): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
  abstract findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null>;
}
