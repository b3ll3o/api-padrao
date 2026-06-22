// BDD: features/usuarios.feature
// SDD: .openspec/changes/usuarios/design.md
// ATDD: test/usuarios.e2e-spec.ts
// TDD: src/usuarios/usuarios.module.spec.ts

import { Module, forwardRef } from '@nestjs/common';
import { UsuariosService } from './application/services/usuarios.service';
import { UsuariosController } from './application/controllers/usuarios.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsuarioRepository } from './domain/repositories/usuario.repository';
import { PrismaUsuarioRepository } from './infrastructure/repositories/prisma-usuario.repository';
import {
  IUsuarioAuthorizationService,
  UsuarioAuthorizationService,
} from './application/services/usuario-authorization.service';
import { SharedModule } from '../shared/shared.module';
import { EmpresasModule } from '../empresas/empresas.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // [H4] `forwardRef(() => AuthModule)` para que `UsuariosService.update()`
  // possa injetar `RefreshTokenRepository` e revogar refresh tokens ativos
  // sempre que a senha do usuário for alterada (defesa em profundidade —
  // mesmo padrão de `PasswordRecoveryService.resetPassword()`).
  imports: [
    PrismaModule,
    SharedModule,
    forwardRef(() => EmpresasModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    {
      provide: UsuarioRepository,
      useClass: PrismaUsuarioRepository,
    },
    {
      provide: IUsuarioAuthorizationService,
      useClass: UsuarioAuthorizationService,
    },
  ],
  exports: [UsuariosService, UsuarioRepository],
})
export class UsuariosModule {}
