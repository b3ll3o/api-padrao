// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/infrastructure/strategies/jwt.strategy.spec.ts

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';

export interface JwtPayload {
  email: string;
  userId?: number;
  sub?: number;
  empresas?: {
    id: string;
    perfis?: {
      codigo: string;
      permissoes?: {
        codigo: string;
      }[];
    }[];
  }[];
}

// `ExtractJwt` é declarado como `namespace` em `@types/passport-jwt`
// (type-only), mas em runtime é um objeto com funções. O cast abaixo
// tipa a superfície que usamos, evitando `as any`.
type ExtractJwtRuntime = {
  fromAuthHeaderAsBearerToken: () => (req: unknown) => string | null;
};

// [M3 — REQ-AUTH-VALIDITY] Cache local para o resultado de
// "este usuário ainda está ativo e não foi deletado?". TTL de 60s é
// bem menor que a janela do access token (15min), o que significa
// que após desativar/deletar um usuário, no máximo 60s depois o JWT
// passa a ser rejeitado — sem martelar o banco a cada request.
const USER_VALIDITY_CACHE_PREFIX = 'auth:user-validity:';
const USER_VALIDITY_CACHE_TTL_MS = 60_000; // 60 segundos

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    // Mantido por simetria com DI pré-existente — `validate()` não usa
    // diretamente, mas garante compat caso algum Decorator/Provider
    // dependa da mesma injeção.
    private usuariosService: UsuariosService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly usuarioRepository: UsuarioRepository,
  ) {
    super({
      jwtFromRequest: (
        ExtractJwt as unknown as ExtractJwtRuntime
      ).fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    // [M3 — REQ-AUTH-VALIDITY] Garante que o usuário por trás do JWT
    // ainda está ativo e não foi soft-deletado. Sem este check, um
    // `update(ativo: false)` ou soft-delete não revoga o access token
    // em circulação até ele expirar.
    await this.assertUserStillValid(payload);

    const mappedEmpresas = payload.empresas?.map((empresa) => ({
      id: empresa.id,
      perfis: empresa.perfis?.map((perfil) => ({
        codigo: perfil.codigo,
        permissoes: perfil.permissoes?.map((permissao) => ({
          codigo: permissao.codigo,
        })),
      })),
    }));

    return {
      userId: payload.sub,
      email: payload.email,
      empresas: mappedEmpresas,
    };
  }

  private async assertUserStillValid(payload: JwtPayload): Promise<void> {
    const userId = payload.sub;
    if (typeof userId !== 'number') {
      // Sem `sub` válido não há como consultar o usuário. Mantém o
      // comportamento legado da strategy (que já devolvia payload
      // normalizado com `userId: undefined`) — quem depende dessa
      // forma continua funcionando.
      return;
    }

    const cacheKey = `${USER_VALIDITY_CACHE_PREFIX}${userId}`;
    let isValid: boolean | undefined;

    try {
      const cached = await this.cache.get<boolean>(cacheKey);
      isValid = typeof cached === 'boolean' ? cached : undefined;
    } catch {
      // Cache offline — degrada para consulta no banco.
      isValid = undefined;
    }

    if (isValid === undefined) {
      const usuario = await this.usuarioRepository.findOne(userId, true);
      isValid = !!(usuario && usuario.ativo && !usuario.deletedAt);

      try {
        await this.cache.set(cacheKey, isValid, USER_VALIDITY_CACHE_TTL_MS);
      } catch {
        // Best-effort: falha ao cachear não pode bloquear auth.
      }
    }

    if (!isValid) {
      throw new UnauthorizedException('Usuário inativo ou removido');
    }
  }
}
