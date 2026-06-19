// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/domain/repositories/login-history.repository.spec.ts

/**
 * Porta (interface) para registro do histórico de login.
 *
 * Persistência simples — apenas cria o registro após sucesso de autenticação.
 * Mantém a abstração para o `AuthService` não depender diretamente de
 * `PrismaService`.
 *
 * BDD: features/autenticacao.feature:Funcionalidade: Autenticação
 * SDD: .openspec/changes/auth-jwt-rotation/design.md:REQ-AUTH-006
 */
export abstract class LoginHistoryRepository {
  /**
   * Registra um login bem-sucedido para auditoria e detecção de anomalias.
   * @param data `{ userId, ip?, userAgent? }`
   */
  abstract record(data: {
    userId: number;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
}
