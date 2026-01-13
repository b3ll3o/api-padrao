import { Empresa } from '../entities/empresa.entity';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';

export abstract class EmpresaRepository {
  abstract create(createEmpresaDto: CreateEmpresaDto): Promise<Empresa>;
  abstract findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Empresa>>;
  abstract findOne(id: string): Promise<Empresa | null>;
  abstract update(
    id: string,
    updateEmpresaDto: UpdateEmpresaDto,
  ): Promise<Empresa>;
  abstract remove(id: string): Promise<void>;
  abstract addUserToCompany(
    empresaId: string,
    usuarioId: number,
    perfilIds: number[],
  ): Promise<void>;
  abstract findUsersByCompany(
    empresaId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>>;
  abstract findCompaniesByUser(
    usuarioId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>>;
}
