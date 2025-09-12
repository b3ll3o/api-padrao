import { Injectable } from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
// import { Usuario } from '../domain/entities/usuario.entity'; // Não é mais necessário importar Usuario aqui

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
export class UsuarioAuthorizationService
  implements IUsuarioAuthorizationService
{
  canAccessUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner = usuarioId === usuarioLogado.userId;
    const isAdmin =
      usuarioLogado.perfis?.some((perfil) => perfil.codigo === 'ADMIN') ||
      false; // Garante que isAdmin seja sempre boolean
    return isOwner || isAdmin;
  }

  canUpdateUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner = usuarioId === usuarioLogado.userId;
    const isAdmin =
      usuarioLogado.perfis?.some((perfil) => perfil.codigo === 'ADMIN') ||
      false; // Garante que isAdmin seja sempre boolean
    return isOwner || isAdmin;
  }

  canDeleteUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isOwner = usuarioId === usuarioLogado.userId;
    const isAdmin =
      usuarioLogado.perfis?.some((perfil) => perfil.codigo === 'ADMIN') ||
      false; // Garante que isAdmin seja sempre boolean
    return isOwner || isAdmin;
  }

  canRestoreUsuario(usuarioId: number, usuarioLogado: JwtPayload): boolean {
    const isAdmin =
      usuarioLogado.perfis?.some((perfil) => perfil.codigo === 'ADMIN') ||
      false; // Garante que isAdmin seja sempre boolean
    return isAdmin;
  }
}
