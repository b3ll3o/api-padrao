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
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

@ApiTags('Permissoes')
@ApiBearerAuth()
@Controller('permissoes')
export class PermissoesController {
  constructor(private readonly permissoesService: PermissoesService) {}

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

  @Get()
  @ApiOperation({ summary: 'Listar todas as permissões' })
  @ApiResponse({
    status: 200,
    description: 'Retorna todas as permissões.',
    type: PaginatedResponseDto, // Change type here
  })
  findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponseDto<Permissao>> { // Change return type here
    return this.permissoesService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar uma permissão por ID' })
  @ApiResponse({
    status: 200,
    description: 'Retorna a permissão com o ID especificado.',
    type: Permissao,
  })
  @ApiResponse({ status: 404, description: 'Permissão não encontrada.' })
  findOne(@Param('id') id: string): Promise<Permissao> {
    return this.permissoesService.findOne(+id);
  }

  @Get('nome/:nome')
  @ApiOperation({ summary: 'Buscar permissões por nome contendo a string' })
  @ApiResponse({
    status: 200,
    description: 'Retorna uma lista de permissões que contêm a string no nome.',
    type: [Permissao],
  })
  findByName(@Param('nome') nome: string): Promise<Permissao[]> {
    return this.permissoesService.findByNomeContaining(nome);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma permissão existente' })
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
  ): Promise<Permissao> {
    return this.permissoesService.update(+id, updatePermissaoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover uma permissão por ID' })
  @ApiResponse({
    status: 204,
    description: 'A permissão foi removida com sucesso.',
  })
  @ApiResponse({ status: 404, description: 'Permissão não encontrada.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.permissoesService.remove(+id);
  }
}
