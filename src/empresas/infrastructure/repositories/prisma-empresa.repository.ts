import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmpresaRepository } from '../../domain/repositories/empresa.repository';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { Empresa } from '../../domain/entities/empresa.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';

@Injectable()
export class PrismaEmpresaRepository implements EmpresaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEmpresaDto): Promise<Empresa> {
    const empresa = await this.prisma.empresa.create({
      data,
    });
    return new Empresa(empresa);
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Empresa>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.empresa.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.empresa.count({ where: { deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item) => new Empresa(item)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(id: string): Promise<Empresa | null> {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id, deletedAt: null },
    });

    if (!empresa) return null;
    return new Empresa(empresa);
  }

  async update(id: string, data: UpdateEmpresaDto): Promise<Empresa> {
    const empresa = await this.prisma.empresa.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    return new Empresa(empresa);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.empresa.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });
  }

  async addUserToCompany(
    empresaId: string,
    usuarioId: number,
    perfilIds: number[],
  ): Promise<void> {
    // Check if user is already in company
    const existingLink = await this.prisma.usuarioEmpresa.findUnique({
      where: {
        usuarioId_empresaId: {
          usuarioId,
          empresaId,
        },
      },
    });

    if (existingLink) {
      // Update profiles
      await this.prisma.usuarioEmpresa.update({
        where: { id: existingLink.id },
        data: {
          perfis: {
            set: perfilIds.map((id) => ({ id })),
          },
        },
      });
    } else {
      // Create new link
      await this.prisma.usuarioEmpresa.create({
        data: {
          usuarioId,
          empresaId,
          perfis: {
            connect: perfilIds.map((id) => ({ id })),
          },
        },
      });
    }
  }

  async findUsersByCompany(
    empresaId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.usuarioEmpresa.findMany({
        where: { empresaId },
        include: {
          usuario: {
            select: {
              id: true,
              email: true,
              ativo: true,
            },
          },
          perfis: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.usuarioEmpresa.count({ where: { empresaId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item) => ({
        ...item.usuario,
        perfis: item.perfis,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findCompaniesByUser(
    usuarioId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.usuarioEmpresa.findMany({
        where: { usuarioId },
        include: {
          empresa: true,
          perfis: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.usuarioEmpresa.count({ where: { usuarioId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item) => ({
        ...item.empresa,
        perfis: item.perfis,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
