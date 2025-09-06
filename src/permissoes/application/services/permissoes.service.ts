import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { Permissao } from '../../domain/entities/permissao.entity';

@Injectable()
export class PermissoesService {
  constructor(private readonly permissaoRepository: PermissaoRepository) {}

  async create(createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    return this.permissaoRepository.create(createPermissaoDto);
  }

  async findAll(): Promise<Permissao[]> {
    return this.permissaoRepository.findAll();
  }

  async findOne(id: number): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(id);
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada`);
    }
    return permissao;
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
