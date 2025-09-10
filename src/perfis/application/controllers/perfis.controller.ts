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
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

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
  @ApiOperation({ summary: 'Listar todos os perfis' })
  @ApiResponse({
    status: 200,
    description: 'Retorna todos os perfis.',
    type: PaginatedResponseDto, // Change type here
  })
  findAll(
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Perfil>> {
    // Change return type here
    return this.perfisService.findAll(paginationDto);
  }

  @TemPermissao('READ_PERFIL_BY_ID')
  @Get(':id')
  @ApiOperation({ summary: 'Buscar um perfil por ID' })
  @ApiResponse({
    status: 200,
    description: 'Retorna o perfil com o ID especificado.',
    type: Perfil,
  })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado.' })
  findOne(@Param('id') id: string): Promise<Perfil> {
    return this.perfisService.findOne(+id);
  }

  @TemPermissao('READ_PERFIL_BY_NOME')
  @Get('nome/:nome')
  @ApiOperation({ summary: 'Buscar perfis por nome contendo a string' })
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
  @ApiOperation({ summary: 'Atualizar um perfil existente' })
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
  ): Promise<Perfil> {
    return this.perfisService.update(+id, updatePerfilDto);
  }

  @TemPermissao('DELETE_PERFIL')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover um perfil por ID' })
  @ApiResponse({
    status: 204,
    description: 'O perfil foi removido com sucesso.',
  })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.perfisService.remove(+id);
  }
}
