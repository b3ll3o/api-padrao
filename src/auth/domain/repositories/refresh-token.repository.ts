// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/domain/repositories/refresh-token.repository.spec.ts

/**
 * Porta (interface) para persistência de `RefreshToken`.
 *
 * Concentra o ciclo de vida: criação, busca por valor, revogação individual
 * e revogação em massa (defesa em profundidade na detecção de reuso).
 *
 * O `AuthService` (camada Application) depende desta abstração, não de
 * `PrismaService` — preservando o Princípio da Inversão de Dependência
 * (DIP) e a portabilidade para outro mecanismo de persistência.
 *
 * BDD: features/autenticacao.feature:Funcionalidade: Autenticação
 * SDD: .openspec/changes/auth-jwt-rotation/design.md:REQ-AUTH-001..005
 */
export interface RefreshTokenWithUser {
  id: string;
  // [SEC-001] `tokenHash` em vez de `token` bruto — o repositório
  // armazena apenas o hash SHA-256 do token. O cliente continua
  // recebendo o token bruto no login; o hash é apenas a forma de
  // lookup no DB (defesa contra dump da tabela).
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  revokedAt: Date | null;
  user: {
    id: number;
    email: string;
    empresas: Array<{
      empresaId: string;
      perfis?: Array<{
        id: number;
        nome: string;
        codigo: string;
        descricao: string;
        permissoes?: Array<{
          id: number;
          nome: string;
          codigo: string;
          descricao: string;
        }>;
      }>;
    }>;
  };
}

export abstract class RefreshTokenRepository {
  /**
   * Persiste um novo refresh token opaco.
   * @param data `{ tokenHash, userId, expiresAt }` — `tokenHash` é
   *   SHA-256(token bruto) calculado pelo serviço chamador.
   */
  abstract create(data: {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void>;

  /**
   * Busca pelo **hash** do token (SHA-256), incluindo o `user` e suas
   * `empresas.perfis.permissoes` (necessário para re-emitir access
   * token após rotação). Retorna `null` se o hash não existir.
   */
  abstract findByTokenWithUser(
    tokenHash: string,
  ): Promise<RefreshTokenWithUser | null>;

  /** Revoga o token específico (rotação). */
  abstract revoke(id: string): Promise<void>;

  /**
   * Revoga **todos** os tokens do usuário. Usado na detecção de reuso
   * (defesa em profundidade — usuário comprometido).
   */
  abstract revokeAllForUser(userId: number): Promise<void>;
}
