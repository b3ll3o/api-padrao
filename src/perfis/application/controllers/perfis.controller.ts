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
  Req,
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

@ApiTags('Perfis')
@ApiBearerAuth()
@Controller('perfis')
export class PerfisController {
  constructor(private readonly perfisService: PerfisService) {}

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

  @Get()
  @ApiOperation({ summary: 'Listar todos os perfis' })
  @ApiResponse({
    status: 200,
    description: 'Retorna todos os perfis.',
    type: [Perfil],
  })
  findAll(@Req() req): Promise<Perfil[]> {
    return this.perfisService.findAll();
  }

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

  @Get('nome/:nome')
  @ApiOperation({ summary: 'Buscar um perfil por nome' })
  @ApiResponse({
    status: 200,
    description: 'Retorna o perfil com o nome especificado.',
    type: Perfil,
  })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado.' })
  findByNome(@Param('nome') nome: string): Promise<Perfil> {
    return this.perfisService.findByNome(nome);
  }

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
