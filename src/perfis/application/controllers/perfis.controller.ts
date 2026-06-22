// BDD: features/perfis.feature
// SDD: .openspec/changes/perfis/design.md
// ATDD: test/perfis.e2e-spec.ts
// TDD: src/perfis/application/controllers/perfis.controller.spec.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { TemPermissao } from '../../../auth/application/decorators/temPermissao.decorator';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { UsuarioLogado } from '../../../shared/application/decorators/usuario-logado.decorator';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { EmpresaId } from '../../../shared/application/decorators/empresa-id.decorator';
import { Idempotent } from '../../../shared/infrastructure/interceptors/idempotent.decorator';

@ApiTags('Perfis')
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'x-empresa-id',
  description: 'ID da empresa para contexto de permissões',
  required: false,
})
@Controller('perfis')
export class PerfisController {
  constructor(private readonly perfisService: PerfisService) {}

  // [REQ-CC-IDEMPOTENT-001.6] Idempotency opt-in: retry de rede não cria
  // 2 perfis duplicados. 409 já protege contra duplicação por payload
  // diferente; idempotency cobre o caso de retry legítimo.
  @TemPermissao('CREATE_PERFIL')
  @Idempotent()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar um novo perfil' })
  @ApiResponse({
    status: 201,
    description: 'O perfil foi criado com sucesso.',
    type: Perfil,
  })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  async create(@Body() createPerfilDto: CreatePerfilDto): Promise<Perfil> {
    return this.perfisService.create(createPerfilDto);
  }

  @TemPermissao('READ_PERFIS')
  @Get()
  @ApiOperation({
    summary: 'Listar todos os perfis',
    description: 'Retorna todos os perfis não deletados por padrão.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna todos os perfis.',
    type: PaginatedResponseDto,
  })
  findAll(
    @Query() paginationDto: PaginationDto,
    @EmpresaId() empresaId?: string,
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.perfisService.findAll(paginationDto, false, empresaId);
  }

  @TemPermissao('READ_PERFIL_BY_ID')
  @Get(':id')
  @ApiOperation({
    summary: 'Buscar um perfil por ID',
    description:
      'Retorna o perfil com o ID especificado. Não retorna perfis deletados por padrão.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna o perfil com o ID especificado.',
    type: Perfil,
  })
  @ApiResponse({
    status: 404,
    description: 'Perfil não encontrado ou deletado.',
  })
  findOne(
    @Param('id') id: string,
    @EmpresaId() empresaId?: string,
  ): Promise<Perfil> {
    return this.perfisService.findOne(+id, false, empresaId);
  }

  @TemPermissao('READ_PERFIL_BY_NOME')
  @Get('nome/:nome')
  @ApiOperation({
    summary: 'Buscar perfis por nome contendo a string',
    description:
      'Retorna uma lista de perfis não deletados que contêm a string no nome.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna uma lista de perfis que contêm a string no nome.',
    type: PaginatedResponseDto,
  })
  findByNome(
    @Param('nome') nome: string,
    @Query() paginationDto: PaginationDto,
    @EmpresaId() empresaId?: string,
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.perfisService.findByNomeContaining(
      nome,
      paginationDto,
      false,
      empresaId,
    );
  }

  @TemPermissao('UPDATE_PERFIL')
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar um perfil existente',
    description:
      'Atualiza um perfil existente. Pode atualizar perfis deletados.',
  })
  @ApiResponse({
    status: 200,
    description: 'O perfil foi atualizado com sucesso.',
    type: Perfil,
  })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado.' })
  update(
    @Param('id') id: string,
    @Body() updatePerfilDto: UpdatePerfilDto,
    @UsuarioLogado() usuarioLogado: JwtPayload,
    @EmpresaId() empresaId?: string,
  ): Promise<Perfil> {
    return this.perfisService.update(
      +id,
      updatePerfilDto,
      usuarioLogado,
      empresaId,
    );
  }

  // REQ-PERF-014 — Cenário movido de permissoes.feature (escopo correto: perfis).
  // Listar permissões vinculadas a um perfil (escopo multi-tenant).
  @TemPermissao('READ_PERFIL_BY_ID')
  @Get(':id/permissoes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Listar permissões de um perfil',
    description:
      'Retorna todas as permissões vinculadas ao perfil, respeitando o escopo da empresa (x-empresa-id).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de permissões do perfil.',
    type: 'array',
  })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado.' })
  async listPermissoes(
    @Param('id') id: string,
    @EmpresaId() empresaId?: string,
  ): Promise<string[]> {
    return this.perfisService.listPermissoesByPerfilId(id, empresaId);
  }
}
