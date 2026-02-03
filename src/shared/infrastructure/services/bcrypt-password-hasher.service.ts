import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '../../domain/services/password-hasher.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BcryptPasswordHasherService implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
