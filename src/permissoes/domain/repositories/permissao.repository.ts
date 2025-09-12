import { Permissao } from '../entities/permissao.entity';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';

export abstract class PermissaoRepository {
  abstract create(data: CreatePermissaoDto): Promise<Permissao>;
  // Modified findAll to include an optional includeDeleted parameter
  abstract findAll(
    skip: number,
    take: number,
    includeDeleted?: boolean,
  ): Promise<[Permissao[], number]>;
  // Modified findOne to include an optional includeDeleted parameter
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
  ): Promise<Permissao | undefined>;
  abstract update(
    id: number,
    data: UpdatePermissaoDto,
  ): Promise<Permissao | undefined>;
  // Modified remove to return Permissao (the soft-deleted entity)
  abstract remove(id: number): Promise<Permissao>;
  // Added restore method
  abstract restore(id: number): Promise<Permissao>;
  // Modified findByNome to include an optional includeDeleted parameter
  abstract findByNome(
    nome: string,
    includeDeleted?: boolean,
  ): Promise<Permissao | null>;
  // Modified findByNomeContaining to include an optional includeDeleted parameter
  abstract findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted?: boolean,
  ): Promise<[Permissao[], number]>;
}
