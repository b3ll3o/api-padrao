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
  abstract restore(id: number): Promise<Perfil>;
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
}
