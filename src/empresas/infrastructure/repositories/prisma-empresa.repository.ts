// BDD: features/empresas.feature
// SDD: .openspec/changes/empresas/design.md
// ATDD: test/empresas.e2e-spec.ts
// TDD: src/empresas/infrastructure/repositories/prisma-empresa.repository.spec.ts

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
      // [ALT-006] `select` específico (mesma justificativa do findAll).
      select: {
        id: true,
        nome: true,
        descricao: true,
        responsavelId: true,
        plano: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
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
        // [ALT-006] `select` específico: lista apenas os campos públicos da Empresa.
        select: {
          id: true,
          nome: true,
          descricao: true,
          responsavelId: true,
          plano: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
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
      // [ALT-006] `select` específico.
      select: {
        id: true,
        nome: true,
        descricao: true,
        responsavelId: true,
        plano: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
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
      // [ALT-006] `select` específico (mesma justificativa do findAll).
      select: {
        id: true,
        nome: true,
        plano: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
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
    // upsert: operação atômica que elimina race condition em chamadas
    // concorrentes (sem leitura + escrita que poderia duplicar inserts e
    // violar a constraint `@@unique([usuarioId, empresaId])`).
    await this.prisma.extended.usuarioEmpresa.upsert({
      where: {
        usuarioId_empresaId: {
          usuarioId,
          empresaId,
        },
      },
      create: {
        usuarioId,
        empresaId,
        perfis: {
          connect: perfilIds.map((id) => ({ id })),
        },
      },
      update: {
        perfis: {
          set: perfilIds.map((id) => ({ id })),
        },
      },
    });
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
        // [ALT-006] `select` específico: nunca expor `senha` no `usuario`,
        // e `perfis` com apenas campos públicos (LGPD + performance).
        select: {
          usuario: {
            select: {
              id: true,
              email: true,
              ativo: true,
            },
          },
          perfis: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              descricao: true,
              empresaId: true,
              deletedAt: true,
              ativo: true,
            },
          },
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
        // [ALT-006] `select` específico: `empresa` com apenas campos
        // públicos e `perfis` com subset enxuto.
        select: {
          empresa: {
            select: {
              id: true,
              nome: true,
              plano: true,
              ativo: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
            },
          },
          perfis: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              descricao: true,
              empresaId: true,
              deletedAt: true,
              ativo: true,
            },
          },
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
