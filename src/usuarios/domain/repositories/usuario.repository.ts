import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Usuario } from '../entities/usuario.entity';

export abstract class UsuarioRepository {
  abstract create(data: Partial<Usuario>): Promise<Usuario>;
  abstract findByEmail(email: string): Promise<Usuario | null>;
  abstract findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null>;
  abstract findOne(
    id: number,
    includeDeleted?: boolean,
  ): Promise<Usuario | undefined>;
  abstract findAll(
    paginationDto: PaginationDto,
    includeDeleted?: boolean,
  ): Promise<PaginatedResponseDto<Usuario>>;
  abstract update(id: number, data: Partial<Usuario>): Promise<Usuario>;
  abstract remove(id: number): Promise<Usuario>;
  abstract restore(id: number): Promise<Usuario>;
}
