// BDD: features/usuarios.feature
// SDD: .openspec/changes/usuarios/design.md
// ATDD: test/usuarios.e2e-spec.ts
// TDD: src/usuarios/domain/repositories/usuario.repository.spec.ts

import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Partial<Usuario>): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
  /**
   * Variante explícita de `findByEmail` que **inclui** o campo `senha`.
   * Deve ser usada APENAS no fluxo de autenticação (comparação de hash
   * bcrypt). Retorna `null` se o usuário não existir.
   *
   * [ALT-006] LGPD/segurança: callers que NÃO precisam comparar hash
   * devem usar `findByEmail` (sem `senha`).
   */
  abstract findByEmailWithCredentials(email: string): Promise<{
    id: number;
    email: string;
    senha: string | null;
    ativo: boolean;
    deletedAt: Date | null;
  } | null>;
  abstract findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null>;
  /**
   * [A5] Invalida o cache Redis (TTL 60s) do payload de perfis+permissões
   * para um usuário. Deve ser chamado por callers que alteram estado que
   * afeta a autorização (ativo, senha, perfis, permissões).
   *
   * Best-effort: erros do Redis são logados mas não propagados — a fonte
   * de verdade é o Postgres.
   */
  abstract invalidateUserCache(userId: number): Promise<void>;
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
  ): Promise<Usuario | undefined>;
  abstract findAll(
    paginationDto: PaginationDto,
    includeDeleted?: boolean,
  ): Promise<PaginatedResponseDto<Usuario>>;
  abstract update(id: number, data: Partial<Usuario>): Promise<Usuario>;
  abstract remove(id: number): Promise<Usuario>;
  abstract restore(id: number): Promise<Usuario>;
}
