import * as bcrypt from 'bcrypt';

export class Usuario {
  id: number;
  email: string;
  senha?: string;
  createdAt: Date;
  updatedAt: Date;

  async comparePassword(password: string): Promise<boolean> {
    if (!this.senha) {
      return false;
    }
    return bcrypt.compare(password, this.senha);
  }
}
