import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { Perfil } from '../../domain/entities/perfil.entity';
import { PermissoesService } from '../../../permissoes/application/services/permissoes.service';

@Injectable()
export class PerfisService {
  constructor(
    private readonly perfilRepository: PerfilRepository,
    private readonly permissoesService: PermissoesService,
  ) {}

  async create(createPerfilDto: CreatePerfilDto): Promise<Perfil> {
    if (
      createPerfilDto.permissoesIds &&
      createPerfilDto.permissoesIds.length > 0
    ) {
      for (const id of createPerfilDto.permissoesIds) {
        await this.permissoesService.findOne(id); // Validate if permission exists
      }
    }
    const existingPerfil = await this.perfilRepository.findByNome(
      createPerfilDto.nome,
    );
    if (existingPerfil) {
      throw new ConflictException(
        `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
      );
    }
    return this.perfilRepository.create(createPerfilDto);
  }

  async findAll(): Promise<Perfil[]> {
    return this.perfilRepository.findAll();
  }

  async findOne(id: number): Promise<Perfil> {
    const perfil = await this.perfilRepository.findOne(id);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado`);
    }
    return perfil;
  }

  async findByNome(nome: string): Promise<Perfil[]> {
    return this.perfilRepository.findByNomeContaining(nome);
  }

  async findByNomeContaining(nome: string): Promise<Perfil[]> {
    return this.perfilRepository.findByNomeContaining(nome);
  }

  async update(id: number, updatePerfilDto: UpdatePerfilDto): Promise<Perfil> {
    if (updatePerfilDto.permissoesIds) {
      for (const permId of updatePerfilDto.permissoesIds) {
        await this.permissoesService.findOne(permId); // Validate if permission exists
      }
    }
    const perfil = await this.perfilRepository.update(id, updatePerfilDto);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado`);
    }
    return perfil;
  }

  async remove(id: number): Promise<void> {
    const perfil = await this.perfilRepository.findOne(id);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado`);
    }
    await this.perfilRepository.remove(id);
  }
}
