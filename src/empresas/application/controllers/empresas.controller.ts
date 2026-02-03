import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmpresasService } from '../services/empresas.service';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { AddUsuarioEmpresaDto } from '../../dto/add-usuario-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { TemPermissao } from '../../../auth/application/decorators/temPermissao.decorator';
import { Auditar } from '../../../shared/application/decorators/audit.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Empresas')
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'x-empresa-id',
  description: 'ID da empresa para contexto de permissões',
  required: false, // Só é obrigatório para rotas com @TemPermissao, mas documentamos no controller
})
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Post()
  @TemPermissao('CREATE_EMPRESA')
  @Auditar({ acao: 'CRIAR', recurso: 'EMPRESA' })
  @Throttle({ sensitive: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Criar uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  create(@Body() createEmpresaDto: CreateEmpresaDto) {
    return this.empresasService.create(createEmpresaDto);
  }

  @Get()
  @TemPermissao('READ_EMPRESAS')
  @ApiOperation({ summary: 'Listar todas as empresas paginadas' })
  @ApiResponse({
    status: 200,
    description: 'Lista de empresas retornada com sucesso.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.empresasService.findAll(paginationDto);
  }

  @Get(':id')
  @TemPermissao('READ_EMPRESA_BY_ID')
  @ApiOperation({ summary: 'Buscar uma empresa pelo ID' })
  @ApiResponse({ status: 200, description: 'Empresa encontrada.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  findOne(@Param('id') id: string) {
    return this.empresasService.findOne(id);
  }

  @Patch(':id')
  @TemPermissao('UPDATE_EMPRESA')
  @Auditar({ acao: 'ATUALIZAR', recurso: 'EMPRESA' })
  @Throttle({ sensitive: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Atualizar uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa atualizada com sucesso.' })
  update(@Param('id') id: string, @Body() updateEmpresaDto: UpdateEmpresaDto) {
    return this.empresasService.update(id, updateEmpresaDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @TemPermissao('DELETE_EMPRESA')
  @Auditar({ acao: 'REMOVER', recurso: 'EMPRESA' })
  @Throttle({ sensitive: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Remover (soft delete) uma empresa' })
  @ApiResponse({ status: 204, description: 'Empresa removida com sucesso.' })
  remove(@Param('id') id: string) {
    return this.empresasService.remove(id);
  }

  @Post(':id/usuarios')
  @TemPermissao('ADD_USER_TO_EMPRESA')
  @ApiOperation({ summary: 'Adicionar usuário à empresa com perfis' })
  @ApiResponse({
    status: 201,
    description: 'Usuário adicionado à empresa com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa, usuário ou perfil não encontrado.',
  })
  addUser(
    @Param('id') id: string,
    @Body() addUsuarioEmpresaDto: AddUsuarioEmpresaDto,
  ) {
    return this.empresasService.addUser(id, addUsuarioEmpresaDto);
  }

  @Get(':id/usuarios')
  @TemPermissao('READ_EMPRESA_USUARIOS')
  @ApiOperation({ summary: 'Listar usuários vinculados a uma empresa' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso.',
  })
  findUsersByCompany(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.empresasService.findUsersByCompany(id, paginationDto);
  }
}
