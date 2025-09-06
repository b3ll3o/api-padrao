import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Usuario): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
}
