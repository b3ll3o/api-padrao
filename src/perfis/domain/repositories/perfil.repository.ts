import { Perfil } from '../entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';

export abstract class PerfilRepository {
  abstract create(data: CreatePerfilDto): Promise<Perfil>;
  abstract findAll(): Promise<Perfil[]>;
  abstract findOne(id: number): Promise<Perfil | undefined>;
  abstract update(
    id: number,
    data: UpdatePerfilDto,
  ): Promise<Perfil | undefined>;
  abstract remove(id: number): Promise<void>;
  abstract findByNome(nome: string): Promise<Perfil | undefined>;
}
