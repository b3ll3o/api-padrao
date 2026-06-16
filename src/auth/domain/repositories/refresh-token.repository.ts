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
  token: string;
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
   * @param data `{ token, userId, expiresAt }`
   */
  abstract create(data: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void>;

  /**
   * Busca por valor bruto, **incluindo o `user` e suas `empresas.perfis.permissoes`**
   * (necessário para re-emitir access token após rotação).
   * Retorna `null` se o token não existir.
   */
  abstract findByTokenWithUser(
    token: string,
  ): Promise<RefreshTokenWithUser | null>;

  /** Revoga o token específico (rotação). */
  abstract revoke(id: string): Promise<void>;

  /**
   * Revoga **todos** os tokens do usuário. Usado na detecção de reuso
   * (defesa em profundidade — usuário comprometido).
   */
  abstract revokeAllForUser(userId: number): Promise<void>;
}
