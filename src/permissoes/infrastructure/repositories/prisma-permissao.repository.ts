import { Injectable } from '@nestjs/common';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { Permissao } from '../../domain/entities/permissao.entity';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PrismaPermissaoRepository implements PermissaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePermissaoDto): Promise<Permissao> {
    return this.prisma.permissao.create({ data });
  }

  async findAll(skip: number, take: number): Promise<[Permissao[], number]> {
    const data = await this.prisma.permissao.findMany({
      skip,
      take,
    });
    const total = await this.prisma.permissao.count();
    return [data, total];
  }

  async findOne(id: number): Promise<Permissao | undefined> {
    const permissao = await this.prisma.permissao.findUnique({ where: { id } });
    return permissao || undefined;
  }

  async update(
    id: number,
    data: UpdatePermissaoDto,
  ): Promise<Permissao | undefined> {
    try {
      return await this.prisma.permissao.update({ where: { id }, data });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.permissao.delete({ where: { id } });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.code === 'P2025') {
        // If the record to delete is not found, do nothing, as the goal is to ensure it's removed.
        return;
      }
      throw error;
    }
  }

  async findByNome(nome: string): Promise<Permissao | null> {
    return this.prisma.permissao.findUnique({
      where: { nome },
    });
  }

  async findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
  ): Promise<[Permissao[], number]> {
    const data = await this.prisma.permissao.findMany({
      skip,
      take,
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
    });
    const total = await this.prisma.permissao.count({
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
    });
    return [data, total];
  }
}
