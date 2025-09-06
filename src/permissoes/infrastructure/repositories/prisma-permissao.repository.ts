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

  async findAll(): Promise<Permissao[]> {
    return this.prisma.permissao.findMany();
  }

  async findOne(id: number): Promise<Permissao | undefined> {
    const permissao = await this.prisma.permissao.findUnique({ where: { id } });
    return permissao || undefined;
  }

  async update(id: number, data: UpdatePermissaoDto): Promise<Permissao> {
    return this.prisma.permissao.update({ where: { id }, data });
  }

  async remove(id: number): Promise<void> {
    await this.prisma.permissao.delete({ where: { id } });
  }
}
