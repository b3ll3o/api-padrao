import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiHeader,
} from '@nestjs/swagger';
import { TemPermissao } from '../../../auth/application/decorators/temPermissao.decorator';
import { Public } from '../../../auth/application/decorators/public.decorator';
import { Usuario } from 'src/usuarios/domain/entities/usuario.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { UsuarioLogado } from '../../../shared/application/decorators/usuario-logado.decorator';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { EmpresaId } from '../../../shared/application/decorators/empresa-id.decorator';
import { EmpresasService } from '../../../empresas/application/services/empresas.service';
import { Permissoes } from '../../../shared/domain/constants/auth.constants';
import { Auditar } from '../../../shared/application/decorators/audit.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Usuários')
@ApiBearerAuth('JWT-auth')
@ApiHeader({
  name: 'x-empresa-id',
  description: 'ID da empresa para contexto de permissões',
  required: false,
})
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly empresasService: EmpresasService,
  ) {}

  @Public()
  @Post()
  @Auditar({ acao: 'CRIAR', recurso: 'USUARIO' })
  @ApiOperation({ summary: 'Cria um novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado.' })
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Get()
  @TemPermissao(Permissoes.READ_USUARIOS)
  @ApiOperation({ summary: 'Listar todos os usuários paginados' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso.',
    type: PaginatedResponseDto,
  })
  findAll(
    @Query() paginationDto: PaginationDto,
    @UsuarioLogado() usuarioLogado: JwtPayload,
    @EmpresaId() empresaId?: string,
  ) {
    return this.usuariosService.findAll(
      paginationDto,
      usuarioLogado,
      false,
      empresaId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar um usuário por ID',
    description:
      'Retorna os dados do usuário. Requer autenticação e só permite que o usuário acesse seus próprios dados. Não retorna usuários deletados.',
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
      'Acesso negado - O usuário autenticado não tem permissão para acessar os dados deste usuário.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Usuário não encontrado - O ID especificado não existe no sistema ou está deletado.',
  })
  @TemPermissao(Permissoes.READ_USUARIO_BY_ID)
  findOne(
    @Param('id') id: string,
    @UsuarioLogado() usuarioLogado: JwtPayload,
  ): Promise<Usuario> {
    return this.usuariosService.findOne(+id, usuarioLogado);
  }

  @Patch(':id')
  @Auditar({ acao: 'ATUALIZAR', recurso: 'USUARIO' })
  @Throttle({ sensitive: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Atualiza um usuário por ID',
    description:
      'Atualiza os dados de um usuário. Requer autenticação e permissão. Um usuário pode atualizar seus próprios dados. Um administrador pode atualizar os dados de qualquer usuário. Pode atualizar usuários deletados.',
  })
  @ApiResponse({ status: 200, description: 'Usuário atualizado com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado - Token JWT ausente ou inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado - Sem permissão para atualizar este usuário.',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuário não encontrado - O ID especificado não existe.',
  })
  @TemPermissao(Permissoes.UPDATE_USUARIO)
  update(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @UsuarioLogado() usuarioLogado: JwtPayload,
    @EmpresaId() empresaId?: string,
  ): Promise<Usuario> {
    return this.usuariosService.update(
      +id,
      updateUsuarioDto,
      usuarioLogado,
      empresaId,
    );
  }

  @Get(':id/empresas')
  @TemPermissao(Permissoes.READ_USUARIO_EMPRESAS)
  @ApiOperation({ summary: 'Listar empresas vinculadas a um usuário' })
  @ApiResponse({
    status: 200,
    description: 'Lista de empresas retornada com sucesso.',
  })
  findCompaniesByUser(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.empresasService.findCompaniesByUser(+id, paginationDto);
  }
}
