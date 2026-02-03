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
    const empresa = await this.prisma.extended.empresa.create({
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
      this.prisma.extended.empresa.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.extended.empresa.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item: any) => new Empresa(item)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(id: string): Promise<Empresa | null> {
    const empresa = await this.prisma.extended.empresa.findUnique({
      where: { id },
    });

    if (!empresa) return null;
    return new Empresa(empresa);
  }

  async update(id: string, data: UpdateEmpresaDto): Promise<Empresa> {
    const empresa = await this.prisma.extended.empresa.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    return new Empresa(empresa);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.extended.empresa.delete({
      where: { id },
    });
  }

  async addUserToCompany(
    empresaId: string,
    usuarioId: number,
    perfilIds: number[],
  ): Promise<void> {
    // Check if user is already in company
    const existingLink = await this.prisma.extended.usuarioEmpresa.findUnique({
      where: {
        usuarioId_empresaId: {
          usuarioId,
          empresaId,
        },
      },
    });

    if (existingLink) {
      // Update profiles
      await this.prisma.extended.usuarioEmpresa.update({
        where: { id: existingLink.id },
        data: {
          perfis: {
            set: perfilIds.map((id) => ({ id })),
          },
        },
      });
    } else {
      // Create new link
      await this.prisma.extended.usuarioEmpresa.create({
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
      this.prisma.extended.usuarioEmpresa.findMany({
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
      this.prisma.extended.usuarioEmpresa.count({ where: { empresaId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item: any) => ({
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
      this.prisma.extended.usuarioEmpresa.findMany({
        where: { usuarioId },
        include: {
          empresa: true,
          perfis: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.extended.usuarioEmpresa.count({ where: { usuarioId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item: any) => ({
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
