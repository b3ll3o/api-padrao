import { Injectable } from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import {
  Roles,
  Permissoes,
} from '../../../shared/domain/constants/auth.constants';

export abstract class IUsuarioAuthorizationService {
  abstract canAccessUsuario(
    usuarioId: number,
    usuarioLogado: JwtPayload,
  ): boolean;
  abstract canUpdateUsuario(
    usuarioId: number,
    usuarioLogado: JwtPayload,
  ): boolean;
  abstract canDeleteUsuario(
    usuarioId: number,
    usuarioLogado: JwtPayload,
  ): boolean;
  abstract canRestoreUsuario(
    usuarioId: number,
    usuarioLogado: JwtPayload,
  ): boolean;
}

@Injectable()
export class UsuarioAuthorizationService implements IUsuarioAuthorizationService {
  private isAdmin(usuarioLogado: JwtPayload): boolean {
    return (
      usuarioLogado.empresas?.some((e) =>
        e.perfis?.some((p) => p.codigo === Roles.ADMIN),
      ) || false
    );
  }

  canAccessUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner =
      usuarioId === usuarioLogado.sub || usuarioId === usuarioLogado.userId;
    return isOwner || this.isAdmin(usuarioLogado);
  }

  canUpdateUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner =
      usuarioId === usuarioLogado.sub || usuarioId === usuarioLogado.userId;
    return isOwner || this.isAdmin(usuarioLogado);
  }

  canDeleteUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner =
      usuarioId === usuarioLogado.sub || usuarioId === usuarioLogado.userId;
    return isOwner || this.isAdmin(usuarioLogado);
  }

  canRestoreUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    if (this.isAdmin(usuarioLogado)) return true;

    return (
      usuarioLogado.empresas?.some((e) =>
        e.perfis?.some((p) =>
          p.permissoes?.some(
            (perm) => perm.codigo === Permissoes.RESTORE_USUARIO,
          ),
        ),
      ) || false
    );
  }
}
