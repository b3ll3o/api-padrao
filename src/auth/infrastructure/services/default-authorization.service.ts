import { Injectable } from '@nestjs/common';
import { AuthorizationService } from '../../../shared/domain/services/authorization.service';
import { JwtPayload } from '../../infrastructure/strategies/jwt.strategy';

@Injectable()
export class DefaultAuthorizationService implements AuthorizationService {
  isAdmin(usuario: JwtPayload): boolean {
    return usuario.perfis?.some((p) => p.codigo === 'ADMIN');
  }
}
