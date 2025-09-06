import { Permissao } from '../entities/permissao.entity';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';

export abstract class PermissaoRepository {
  abstract create(data: CreatePermissaoDto): Promise<Permissao>;
  abstract findAll(): Promise<Permissao[]>;
  abstract findOne(id: number): Promise<Permissao | undefined>;
  abstract update(
    id: number,
    data: UpdatePermissaoDto,
  ): Promise<Permissao | undefined>;
  abstract remove(id: number): Promise<void>;
}
