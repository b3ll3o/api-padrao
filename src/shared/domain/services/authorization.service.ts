import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

export abstract class AuthorizationService {
  abstract isAdmin(usuario: JwtPayload): boolean;
}
