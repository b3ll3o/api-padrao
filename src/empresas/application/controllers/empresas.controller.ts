import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { EmpresasService } from '../services/empresas.service';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Empresas')
@ApiBearerAuth('JWT-auth')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  create(@Body() createEmpresaDto: CreateEmpresaDto) {
    return this.empresasService.create(createEmpresaDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as empresas paginadas' })
  @ApiResponse({
    status: 200,
    description: 'Lista de empresas retornada com sucesso.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.empresasService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar uma empresa pelo ID' })
  @ApiResponse({ status: 200, description: 'Empresa encontrada.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  findOne(@Param('id') id: string) {
    return this.empresasService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa atualizada com sucesso.' })
  update(@Param('id') id: string, @Body() updateEmpresaDto: UpdateEmpresaDto) {
    return this.empresasService.update(id, updateEmpresaDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover (soft delete) uma empresa' })
  @ApiResponse({ status: 204, description: 'Empresa removida com sucesso.' })
  remove(@Param('id') id: string) {
    return this.empresasService.remove(id);
  }

  @Post(':id/usuarios')
  @ApiOperation({ summary: 'Adicionar usuário à empresa com perfis' })
  addUser(
    @Param('id') id: string,
    @Body('usuarioId') usuarioId: number,
    @Body('perfilIds') perfilIds: number[],
  ) {
    return this.empresasService.addUser(id, usuarioId, perfilIds);
  }
}
