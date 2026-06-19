// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/domain/services/authorization.service.spec.ts

import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

export abstract class AuthorizationService {
  abstract isAdmin(usuario: JwtPayload): boolean;
}
