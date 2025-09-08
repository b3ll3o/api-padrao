import * as bcrypt from 'bcrypt';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';

export class Usuario {
  id: number;
  email: string;
  senha?: string;
  createdAt: Date;
  updatedAt: Date;
  perfilId?: number;
  perfil?: Perfil;

  async comparePassword(password: string): Promise<boolean> {
    if (!this.senha) {
      return false;
    }
    return bcrypt.compare(password, this.senha);
  }
}
