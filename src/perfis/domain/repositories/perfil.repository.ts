import { Perfil } from '../entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';

export abstract class PerfilRepository {
  abstract create(data: CreatePerfilDto): Promise<Perfil>;
  // Modified findAll to include an optional includeDeleted parameter
  abstract findAll(
    skip: number,
    take: number,
    includeDeleted?: boolean,
  ): Promise<[Perfil[], number]>;
  // Modified findOne to include an optional includeDeleted parameter
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
  ): Promise<Perfil | undefined>;
  abstract update(
    id: number,
    data: UpdatePerfilDto,
  ): Promise<Perfil | undefined>;
  // Modified remove to return Perfil (the soft-deleted entity)
  abstract remove(id: number): Promise<Perfil>;
  // Added restore method
  abstract restore(id: number): Promise<Perfil>;
  // Modified findByNome to include an optional includeDeleted parameter
  abstract findByNome(
    nome: string,
    includeDeleted?: boolean,
  ): Promise<Perfil | null>;
  // Modified findByNomeContaining to include an optional includeDeleted parameter
  abstract findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted?: boolean,
  ): Promise<[Perfil[], number]>;
}
