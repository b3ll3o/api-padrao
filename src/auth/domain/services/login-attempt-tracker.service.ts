// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/domain/services/login-attempt-tracker.service.spec.ts

/**
 * Porta (interface) para rastreio de tentativas de login falhas.
 *
 * Implementa **account lockout** (OWASP A07): após N tentativas com senha
 * inválida para o mesmo email, bloqueia a conta por X minutos.
 *
 * O `AuthService.login` consulta esta porta:
 * - Antes de validar a senha: `isLocked(email)` → lança 429 se sim.
 * - Em falha: `recordFailure(email)` → incrementa contador com TTL.
 * - Em sucesso: `clearFailures(email)` → reseta contador.
 *
 * Implementação default usa Redis (cache manager). Adapters alternativos
 * (memória para testes) podem ser plugados via `useClass`.
 *
 * BDD: features/autenticacao.feature:Cenário: Bloquear após N tentativas
 * SDD: .openspec/changes/account-lockout/design.md (a criar)
 */
export abstract class LoginAttemptTracker {
  /**
   * Retorna `true` se o email está bloqueado por excesso de tentativas.
   * O adapter deve consultar o storage (Redis) com TTL e contagem.
   */
  abstract isLocked(email: string): Promise<boolean>;

  /**
   * Registra uma tentativa falha, incrementando o contador com TTL.
   * Se o contador ultrapassar o limite, `isLocked` retorna `true` nas
   * próximas chamadas.
   */
  abstract recordFailure(email: string): Promise<void>;

  /**
   * Reseta o contador de tentativas falhas (chamado em login bem-sucedido).
   */
  abstract clearFailures(email: string): Promise<void>;
}
