import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../dto/pagination.dto';

@Injectable()
export class PermissoesService {
  constructor(private readonly permissaoRepository: PermissaoRepository) {}

  async create(createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    const existingPermissao = await this.permissaoRepository.findByNome(
      createPermissaoDto.nome,
    );
    if (existingPermissao) {
      throw new ConflictException(
        `Permissão com o nome '${createPermissaoDto.nome}' já existe.`,
      );
    }
    return this.permissaoRepository.create(createPermissaoDto);
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<{ data: Permissao[]; total: number }> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.permissaoRepository.findAll(skip, take);
    return { data, total };
  }

  async findOne(id: number): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(id);
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada`);
    }
    return permissao;
  }

  async findByNome(
    nome: string,
    paginationDto: PaginationDto,
  ): Promise<{ data: Permissao[]; total: number }> {
    return this.findByNomeContaining(nome, paginationDto);
  }

  async findByNomeContaining(
    nome: string,
    paginationDto: PaginationDto,
  ): Promise<{ data: Permissao[]; total: number }> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.permissaoRepository.findByNomeContaining(
      nome,
      skip,
      take,
    );
    return { data, total };
  }

  async update(
    id: number,
    updatePermissaoDto: UpdatePermissaoDto,
  ): Promise<Permissao> {
    const permissao = await this.permissaoRepository.update(
      id,
      updatePermissaoDto,
    );
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada`);
    }
    return permissao;
  }

  async remove(id: number): Promise<void> {
    const permissao = await this.permissaoRepository.findOne(id);
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada`);
    }
    await this.permissaoRepository.remove(id);
  }
}
