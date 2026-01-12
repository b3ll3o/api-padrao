import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EmpresaRepository } from '../../domain/repositories/empresa.repository';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';

@Injectable()
export class EmpresasService {
  private readonly logger = new Logger(EmpresasService.name);

  constructor(private readonly empresaRepository: EmpresaRepository) {}

  async create(createEmpresaDto: CreateEmpresaDto) {
    const empresa = await this.empresaRepository.create(createEmpresaDto);
    this.logger.log(`Empresa criada: ${empresa.nome} (ID: ${empresa.id})`);
    return empresa;
  }

  async findAll(paginationDto: PaginationDto) {
    return this.empresaRepository.findAll(paginationDto);
  }

  async findOne(id: string) {
    const empresa = await this.empresaRepository.findOne(id);
    if (!empresa) {
      throw new NotFoundException(`Empresa com ID ${id} não encontrada`);
    }
    return empresa;
  }

  async update(id: string, updateEmpresaDto: UpdateEmpresaDto) {
    await this.findOne(id); // Check existence
    const empresa = await this.empresaRepository.update(id, updateEmpresaDto);
    this.logger.log(`Empresa atualizada: ${empresa.nome} (ID: ${id})`);
    return empresa;
  }

  async remove(id: string) {
    await this.findOne(id); // Check existence
    await this.empresaRepository.remove(id);
    this.logger.log(`Empresa removida (soft-delete): ID ${id}`);
  }

  async addUser(empresaId: string, usuarioId: number, perfilIds: number[]) {
    await this.findOne(empresaId);
    await this.empresaRepository.addUserToCompany(
      empresaId,
      usuarioId,
      perfilIds,
    );
    this.logger.log(
      `Usuário ${usuarioId} adicionado à empresa ${empresaId} com perfis ${perfilIds.join(', ')}`,
    );
  }
}
