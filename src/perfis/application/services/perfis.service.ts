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
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

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

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Perfil>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.perfilRepository.findAll(skip, take);
    const totalPages = Math.ceil(total / limit);
    return { 
      data,
      total,
      page,
      limit,
      totalPages
    };
  }

  async findOne(id: number): Promise<Perfil> {
    const perfil = await this.perfilRepository.findOne(id);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado`);
    }
    return perfil;
  }

  async findByNome(
    nome: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.findByNomeContaining(nome, paginationDto);
  }

  async findByNomeContaining(
    nome: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Perfil>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.perfilRepository.findByNomeContaining(
      nome,
      skip,
      take,
    );
    const totalPages = Math.ceil(total / limit);
    return { 
      data,
      total,
      page,
      limit,
      totalPages
    };
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
