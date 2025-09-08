import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../auth/application/decorators/public.decorator';
import { PaginationDto } from '../../../dto/pagination.dto';
import { Usuario } from 'src/usuarios/domain/entities/usuario.entity';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';

@ApiTags('Usuários')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Cria um novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado.' })
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os usuários' })
  @ApiResponse({
    status: 200,
    description: 'Retorna todos os usuários.',
    type: PaginatedResponseDto, // Change type here
  })
  @ApiBearerAuth()
  findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponseDto<Usuario>> { // Change return type here
    return this.usuariosService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar um usuário por ID' })
  @ApiResponse({
    status: 200,
    description: 'Retorna o usuário com o ID especificado.',
    type: Usuario,
  })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiBearerAuth()
  findOne(@Param('id') id: string): Promise<Usuario> {
    return this.usuariosService.findOne(+id);
  }
}
