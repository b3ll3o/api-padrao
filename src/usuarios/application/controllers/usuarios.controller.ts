import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../auth/application/decorators/public.decorator';
import { Usuario } from 'src/usuarios/domain/entities/usuario.entity';

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

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar um usuário por ID',
    description:
      'Retorna os dados do usuário. Requer autenticação e só permite que o usuário acesse seus próprios dados.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Retorna o usuário com o ID especificado, excluindo dados sensíveis como senha e perfis.',
    type: Usuario,
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado - Token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Acesso negado - O usuário autenticado não tem permissão para acessar os dados de outro usuário.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Usuário não encontrado - O ID especificado não existe no sistema.',
  })
  @ApiBearerAuth('JWT')
  findOne(@Param('id') id: string, @Req() req: Request): Promise<Usuario> {
    if (!req.usuarioLogado) {
      throw new ForbiddenException('Usuário não autenticado');
    }
    return this.usuariosService.findOne(+id, req.usuarioLogado);
  }
}
