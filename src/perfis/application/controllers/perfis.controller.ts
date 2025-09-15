import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
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

@ApiTags('Perfis')
@ApiBearerAuth()
@Controller('perfis')
export class PerfisController {
  constructor(private readonly perfisService: PerfisService) {}

  @TemPermissao('CREATE_PERFIL')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar um novo perfil' })
  @ApiResponse({
    status: 201,
    description: 'O perfil foi criado com sucesso.',
    type: Perfil,
  })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  create(@Body() createPerfilDto: CreatePerfilDto): Promise<Perfil> {
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
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.perfisService.findAll(paginationDto);
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
  findOne(@Param('id') id: string): Promise<Perfil> {
    return this.perfisService.findOne(+id);
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
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.perfisService.findByNomeContaining(nome, paginationDto);
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
    @Req() req: Request,
  ): Promise<Perfil> {
    if (!req.usuarioLogado) {
      throw new ForbiddenException('Usuário não autenticado');
    }
    return this.perfisService.update(+id, updatePerfilDto, req.usuarioLogado);
  }

  

  
}
