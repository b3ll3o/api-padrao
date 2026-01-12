import { Injectable, NotFoundException } from '@nestjs/common';
import { EmpresaRepository } from '../../domain/repositories/empresa.repository';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';

@Injectable()
export class EmpresasService {
  constructor(private readonly empresaRepository: EmpresaRepository) {}

  async create(createEmpresaDto: CreateEmpresaDto) {
    return this.empresaRepository.create(createEmpresaDto);
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
    return this.empresaRepository.update(id, updateEmpresaDto);
  }

  async remove(id: string) {
    await this.findOne(id); // Check existence
    return this.empresaRepository.remove(id);
  }

  async addUser(empresaId: string, usuarioId: number, perfilIds: number[]) {
    await this.findOne(empresaId);
    return this.empresaRepository.addUserToCompany(
      empresaId,
      usuarioId,
      perfilIds,
    );
  }
}
