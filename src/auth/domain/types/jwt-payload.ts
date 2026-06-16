/**
 * Tipos compartilhados do payload JWT usado em `AuthService`,
 * `PermissaoGuard` e `AuditInterceptor` (camada de aplicação).
 *
 * Mantidos na **camada de domínio** porque descrevem o *contrato* do
 * token, não detalhes de transporte. Após [MED-002], substituem os
 * `any` que poluíam a inferência nos consumers.
 *
 * Há **duas formas**:
 * - **Completa** (`EmpresaAuthPayload` / `PerfilCompletoPayload` / ...):
 *   representa o vínculo vindo do `UsuarioRepository`, com `id`/`nome`/
 *   `descricao` para iteração no AuthService antes de serializar.
 * - **Minimalista** (`EmpresaJwtPayload` / `PerfilJwtPayload` / ...):
 *   representa o que vai no JWT e o que é devolvido pelo
 *   `JwtStrategy.validate` — apenas `id` (empresa) e `codigo`
 *   (perfil/permissão). O token fica pequeno e o frontend resolve
 *   labels via lookup.
 *
 * @see src/auth/application/services/auth.service.ts (emite a forma completa)
 * @see src/auth/application/guards/permissao.guard.ts (consome a forma minimalista)
 * @see src/auth/infrastructure/strategies/jwt.strategy.ts (devolve a forma minimalista)
 */

/** Permissão na forma completa (vinda de `Perfil.permissoes[]`). */
export interface PermissaoCompletaPayload {
  id: number;
  nome: string;
  codigo: string;
  descricao: string;
}

/** Perfil na forma completa (vinda de `Perfil`). */
export interface PerfilCompletoPayload {
  id: number;
  nome: string;
  codigo: string;
  descricao: string;
  permissoes?: PermissaoCompletaPayload[];
}

/** Vínculo usuário↔empresa recebido pelo `AuthService` (forma completa). */
export interface EmpresaAuthPayload {
  empresaId: string;
  perfis?: PerfilCompletoPayload[];
}

/** Permissão na forma minimalista (vai no JWT). */
export interface PermissaoJwtPayload {
  codigo: string;
}

/** Perfil na forma minimalista (vai no JWT). */
export interface PerfilJwtPayload {
  codigo: string;
  permissoes?: PermissaoJwtPayload[];
}

/** Vínculo usuário↔empresa na forma minimalista (vai no JWT). */
export interface EmpresaJwtPayload {
  id: string;
  perfis?: PerfilJwtPayload[];
}

/** Payload completo do JWT — usado em `JwtService.sign` e nos guards. */
export interface JwtAccessTokenPayload {
  /** Subject (userId). Convenção RFC 7519. */
  sub: number;
  email: string;
  empresas: EmpresaJwtPayload[];
}
