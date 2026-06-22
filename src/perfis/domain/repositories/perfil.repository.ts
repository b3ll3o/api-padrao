// BDD: features/perfis.feature
// SDD: .openspec/changes/perfis/design.md
// ATDD: test/perfis.e2e-spec.ts
// TDD: src/perfis/domain/repositories/perfil.repository.spec.ts

import { Perfil } from '../entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';

export abstract class PerfilRepository {
  abstract create(data: CreatePerfilDto): Promise<Perfil>;
  abstract findAll(
    skip: number,
    take: number,
    includeDeleted?: boolean,
    empresaId?: string,
  ): Promise<[Perfil[], number]>;
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
    empresaId?: string,
  ): Promise<Perfil | undefined>;
  abstract update(
    id: number,
    data: UpdatePerfilDto,
  ): Promise<Perfil | undefined>;
  abstract remove(id: number): Promise<Perfil>;
  abstract restore(id: number, empresaId?: string): Promise<Perfil>;
  abstract findByNome(
    nome: string,
    includeDeleted?: boolean,
    empresaId?: string,
  ): Promise<Perfil | null>;
  abstract findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted?: boolean,
    empresaId?: string,
  ): Promise<[Perfil[], number]>;
  // [email-notifications] Batch lookup em 1 round-trip (substitui N findOne).
  abstract findManyByIds(ids: number[]): Promise<Perfil[]>;
  /**
   * [A5] DevSecOps 2026-06-21 — Lista os `usuarioId` que possuem o perfil
   * (direta ou indiretamente, via pivot `UsuarioEmpresa`). Usado por
   * `PerfisService.update()` para invalidar o cache de
   * perfis+permissões de todos os usuários afetados quando as
   * permissões do perfil mudam.
   *
   * Retorna `number[]` (apenas IDs), porque o objetivo é só invalidação
   * — sem precisar hidratar entidades inteiras.
   */
  abstract findUserIdsByPerfilId(perfilId: number): Promise<number[]>;
}
