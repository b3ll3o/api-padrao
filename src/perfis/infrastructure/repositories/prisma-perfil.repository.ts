// BDD: features/perfis.feature
// SDD: .openspec/changes/perfis/design.md
// ATDD: test/perfis.e2e-spec.ts
// TDD: src/perfis/infrastructure/repositories/prisma-perfil.repository.spec.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { Perfil } from '../../domain/entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

@Injectable()
export class PrismaPerfilRepository implements PerfilRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toPermissaoDomain(permissao: any): Permissao {
    const newPermissao = new Permissao();
    newPermissao.id = permissao.id;
    newPermissao.nome = permissao.nome;
    newPermissao.codigo = permissao.codigo;
    newPermissao.descricao = permissao.descricao;
    newPermissao.deletedAt = permissao.deletedAt;
    newPermissao.ativo = permissao.ativo;
    return newPermissao;
  }

  private toDomain(perfil: any): Perfil {
    const newPerfil = new Perfil();
    newPerfil.id = perfil.id;
    newPerfil.nome = perfil.nome;
    newPerfil.codigo = perfil.codigo;
    newPerfil.descricao = perfil.descricao;
    newPerfil.deletedAt = perfil.deletedAt;
    newPerfil.ativo = perfil.ativo;
    newPerfil.empresaId = perfil.empresaId;
    newPerfil.permissoes = perfil.permissoes?.map((p: any) =>
      this.toPermissaoDomain(p),
    );
    return newPerfil;
  }

  async create(data: CreatePerfilDto): Promise<Perfil> {
    const { permissoesIds, ...perfilData } = data;
    const perfil = await this.prisma.extended.perfil.create({
      data: {
        ...perfilData,
        permissoes: {
          connect: permissoesIds?.map((id) => ({ id })),
        },
      },
      // [ALT-006] `select` específico (mesma justificativa do findAll).
      select: {
        id: true,
        nome: true,
        codigo: true,
        descricao: true,
        empresaId: true,
        deletedAt: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        permissoes: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            descricao: true,
            deletedAt: true,
            ativo: true,
          },
        },
      },
    });
    return this.toDomain(perfil);
  }

  async findAll(
    skip: number,
    take: number,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<[Perfil[], number]> {
    const whereClause: any = {};
    if (empresaId) {
      whereClause.empresaId = empresaId;
    }

    const client = includeDeleted
      ? this.prisma.perfil
      : this.prisma.extended.perfil;

    const data = await client.findMany({
      skip,
      take,
      where: whereClause,
      // [ALT-006] `select` específico: lista apenas os campos públicos do Perfil
      // e das Permissões (sem expor `createdAt/updatedAt` interno da pivot).
      select: {
        id: true,
        nome: true,
        codigo: true,
        descricao: true,
        empresaId: true,
        deletedAt: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        permissoes: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            descricao: true,
            deletedAt: true,
            ativo: true,
          },
        },
      },
    });
    const total = await client.count({ where: whereClause });
    return [data.map((p: any) => this.toDomain(p)), total];
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<Perfil | undefined> {
    const whereClause: any = { id };
    if (empresaId) {
      whereClause.empresaId = empresaId;
    }

    const client = includeDeleted
      ? this.prisma.perfil
      : this.prisma.extended.perfil;

    const perfil = await client.findFirst({
      where: whereClause,
      // [ALT-006] `select` específico (mesma justificativa do findAll).
      select: {
        id: true,
        nome: true,
        codigo: true,
        descricao: true,
        empresaId: true,
        deletedAt: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        permissoes: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            descricao: true,
            deletedAt: true,
            ativo: true,
          },
        },
      },
    });
    return perfil ? this.toDomain(perfil) : undefined;
  }

  async update(id: number, data: UpdatePerfilDto): Promise<Perfil | undefined> {
    const { permissoesIds, ...perfilData } = data;
    try {
      // Allow updating soft-deleted profiles
      const existingPerfil = await this.prisma.perfil.findFirst({
        where: { id },
      });
      if (!existingPerfil) {
        return undefined; // Or throw NotFoundException
      }

      const perfil = await this.prisma.extended.perfil.update({
        where: { id },
        data: {
          ...perfilData,
          permissoes: {
            set: permissoesIds?.map((id) => ({ id })),
          },
        },
        // [ALT-006] `select` específico (mesma justificativa do findAll).
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          empresaId: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          permissoes: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              descricao: true,
              deletedAt: true,
              ativo: true,
            },
          },
        },
      });
      return this.toDomain(perfil);
    } catch (error) {
      if (error.code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<Perfil> {
    try {
      const softDeletedPerfil = await this.prisma.extended.perfil.delete({
        where: { id },
        // [ALT-006] `select` específico (mesma justificativa do findAll).
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          empresaId: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          permissoes: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              descricao: true,
              deletedAt: true,
              ativo: true,
            },
          },
        },
      });
      return this.toDomain(softDeletedPerfil);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  async restore(id: number, empresaId?: string): Promise<Perfil> {
    // Para suportar multi-tenant, o `where` precisa carregar o `empresaId`
    // do contexto. Sem isso, um admin poderia restaurar um Perfil de
    // OUTRA empresa inadvertidamente.
    const where: any = { id };
    if (empresaId) {
      where.empresaId = empresaId;
    }
    try {
      const restoredPerfil = await this.prisma.extended.perfil.update({
        where,
        data: { deletedAt: null, ativo: true },
        // [ALT-006] `select` específico (mesma justificativa do findAll).
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          empresaId: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          permissoes: {
            select: {
              id: true,
              nome: true,
              codigo: true,
              descricao: true,
              deletedAt: true,
              ativo: true,
            },
          },
        },
      });
      return this.toDomain(restoredPerfil);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  async findByNome(
    nome: string,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<Perfil | null> {
    const whereClause: any = { nome };
    if (empresaId) {
      whereClause.empresaId = empresaId;
    }

    const client = includeDeleted
      ? this.prisma.perfil
      : this.prisma.extended.perfil;

    const perfil = await client.findFirst({
      where: whereClause,
      include: { permissoes: true },
    });
    return perfil ? this.toDomain(perfil) : null;
  }

  async findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<[Perfil[], number]> {
    const whereClause: any = {
      nome: {
        contains: nome,
        mode: 'insensitive',
      },
    };
    if (empresaId) {
      whereClause.empresaId = empresaId;
    }

    const client = includeDeleted
      ? this.prisma.perfil
      : this.prisma.extended.perfil;

    const data = await client.findMany({
      skip,
      take,
      where: whereClause,
      include: { permissoes: true },
    });
    const total = await client.count({
      where: whereClause,
    });
    return [data.map((p: any) => this.toDomain(p)), total];
  }

  // [email-notifications] Batch lookup: 1 round-trip em vez de N findOne.
  async findManyByIds(ids: number[]): Promise<Perfil[]> {
    if (ids.length === 0) return [];
    const data = await this.prisma.extended.perfil.findMany({
      where: { id: { in: ids } },
    });
    return data.map((p: any) => this.toDomain(p));
  }

  // [A5] DevSecOps 2026-06-21 — Lista os `usuarioId` que possuem o perfil
  // via pivot `UsuarioEmpresa` (relação N-N Perfil ↔ UsuarioEmpresa).
  // 1 round-trip + dedup em JS (mesma eficiência, evita armadilha do
  // `distinct` quando há join implícito via tabela `_PerfilToUsuarioEmpresa`).
  async findUserIdsByPerfilId(perfilId: number): Promise<number[]> {
    const rows = await this.prisma.extended.usuarioEmpresa.findMany({
      where: { perfis: { some: { id: perfilId } } },
      select: { usuarioId: true },
    });
    const seen = new Set<number>();
    const out: number[] = [];
    for (const r of rows) {
      if (!seen.has(r.usuarioId)) {
        seen.add(r.usuarioId);
        out.push(r.usuarioId);
      }
    }
    return out;
  }
}
