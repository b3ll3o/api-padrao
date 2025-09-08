import { Permissao } from '../entities/permissao.entity';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';

export abstract class PermissaoRepository {
  abstract create(data: CreatePermissaoDto): Promise<Permissao>;
  abstract findAll(skip: number, take: number): Promise<[Permissao[], number]>;
  abstract findOne(id: number): Promise<Permissao | undefined>;
  abstract update(
    id: number,
    data: UpdatePermissaoDto,
  ): Promise<Permissao | undefined>;
  abstract remove(id: number): Promise<void>;
  abstract findByNome(nome: string): Promise<Permissao | null>;
  abstract findByNomeContaining(nome: string): Promise<Permissao[]>;
}
