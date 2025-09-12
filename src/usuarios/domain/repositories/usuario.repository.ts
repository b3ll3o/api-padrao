import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Partial<Usuario>): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
  abstract findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null>;
  abstract findOne(id: number): Promise<Usuario | undefined>;
  abstract update(id: number, data: Partial<Usuario>): Promise<Usuario>; // Added
  abstract remove(id: number): Promise<void>; // Added
}
