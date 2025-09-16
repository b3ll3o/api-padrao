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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { PermissoesService } from '../services/permissoes.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TemPermissao } from '../../../auth/application/decorators/temPermissao.decorator';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Request } from 'express';

@ApiTags('Permissoes')
@ApiBearerAuth()
@Controller('permissoes')
export class PermissoesController {
  constructor(private readonly permissoesService: PermissoesService) {}

  @TemPermissao('CREATE_PERMISSAO')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar uma nova permissão' })
  @ApiResponse({
    status: 201,
    description: 'A permissão foi criada com sucesso.',
    type: Permissao,
  })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  create(@Body() createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    return this.permissoesService.create(createPermissaoDto);
  }

  @TemPermissao('READ_PERMISSOES')
  @Get()
  @ApiOperation({
    summary: 'Listar todas as permissões',
    description: 'Retorna todas as permissões não deletadas por padrão.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna todas as permissões.',
    type: PaginatedResponseDto, // Change type here
  })
  findAll(
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Permissao>> {
    // Change return type here
    return this.permissoesService.findAll(paginationDto);
  }

  @TemPermissao('READ_PERMISSAO_BY_ID')
  @Get(':id')
  @ApiOperation({
    summary: 'Buscar uma permissão por ID',
    description:
      'Retorna a permissão com o ID especificado. Não retorna permissões deletadas por padrão.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna a permissão com o ID especificado.',
    type: Permissao,
  })
  @ApiResponse({
    status: 404,
    description: 'Permissão não encontrada ou deletada.',
  })
  findOne(@Param('id') id: string): Promise<Permissao> {
    return this.permissoesService.findOne(+id);
  }

  @TemPermissao('READ_PERMISSAO_BY_NOME')
  @Get('nome/:nome')
  @ApiOperation({
    summary: 'Buscar permissões por nome contendo a string',
    description:
      'Retorna uma lista de permissões não deletadas que contêm a string no nome.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna uma lista de permissões que contêm a string no nome.',
    type: PaginatedResponseDto,
  })
  findByNome(
    @Param('nome') nome: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Permissao>> {
    return this.permissoesService.findByNomeContaining(nome, paginationDto);
  }

  @TemPermissao('UPDATE_PERMISSAO')
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar uma permissão existente',
    description:
      'Atualiza uma permissão existente. Pode atualizar permissões deletadas.',
  })
  @ApiResponse({
    status: 200,
    description: 'A permissão foi atualizada com sucesso.',
    type: Permissao,
  })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  @ApiResponse({ status: 404, description: 'Permissão não encontrada.' })
  update(
    @Param('id') id: string,
    @Body() updatePermissaoDto: UpdatePermissaoDto,
    @Req() req: Request,
  ): Promise<Permissao> {
    if (!req.usuarioLogado) {
      throw new ForbiddenException('Usuário não autenticado');
    }
    return this.permissoesService.update(
      +id,
      updatePermissaoDto,
      req.usuarioLogado,
    );
  }
}
