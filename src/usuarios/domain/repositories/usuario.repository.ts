import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Partial<Usuario>): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
  abstract findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null>;
  // Modified findOne to include an optional includeDeleted parameter
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
  ): Promise<Usuario | undefined>;
  // Added findAll with an optional includeDeleted parameter
  abstract findAll(includeDeleted?: boolean): Promise<Usuario[]>;
  abstract update(id: number, data: Partial<Usuario>): Promise<Usuario>;
  // Modified remove to return Usuario (the soft-deleted entity)
  abstract remove(id: number): Promise<Usuario>;
  // Added restore method
  abstract restore(id: number): Promise<Usuario>;
}
