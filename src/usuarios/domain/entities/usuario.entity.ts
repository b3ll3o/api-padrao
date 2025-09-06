import * as bcrypt from 'bcrypt';

export class Usuario {
  email: string;
  senha?: string;

  async comparePassword(password: string): Promise<boolean> {
    if (!this.senha) {
      return false;
    }
    return bcrypt.compare(password, this.senha);
  }
}
