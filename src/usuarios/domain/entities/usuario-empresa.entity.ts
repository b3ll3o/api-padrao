import { Empresa } from '../../../empresas/domain/entities/empresa.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';

/**
 * Entidade de domínio `UsuarioEmpresa`.
 *
 * Representa o **vínculo** entre um `Usuario` e uma `Empresa`, com
 * os perfis (papéis) que o usuário exerce nessa empresa.
 *
 * ## Aggregate
 *
 * Esta entidade é um **Value Object** dentro do agregado `Usuario`.
 * Ela **não** tem identidade própria fora do contexto do usuário
 * (a chave única `[usuarioId, empresaId]` é composta, não há um
 * `id` de domínio significativo para o agregado).
 *
 * **Acesso:** nunca persistir, atualizar ou remover `UsuarioEmpresa`
 * diretamente — todas as operações passam pela raiz do agregado
 * `Usuario`. O repositório do `Usuario` (e não o da `UsuarioEmpresa`)
 * é o portão de entrada para escrita.
 *
 * ## Multi-tenancy
 *
 * O `empresaId` é o discriminador do tenant. O Prisma extension
 * (`softDeleteExtension`) injeta automaticamente esse filtro em
 * todas as queries — não é necessário passá-lo manualmente.
 *
 * ## Perfis denormalizados
 *
 * `perfis` carrega os perfis que o usuário tem NESSA empresa
 * específica. A relação é N-N: um mesmo usuário pode ter perfis
 * diferentes em empresas diferentes. As permissões efetivas são
 * a união dos códigos de permissão de todos os perfis daquela
 * empresa (resolvidas em runtime pela `UsuarioAuthorizationService`).
 *
 * @see Usuario (raiz do agregado)
 * @see features/multi-tenancy.feature para os invariantes do escopo
 */
export class UsuarioEmpresa {
  id: number;
  usuarioId: number;
  empresaId: string;
  empresa?: Empresa;
  perfis?: Perfil[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<UsuarioEmpresa>) {
    Object.assign(this, partial);
  }
}
