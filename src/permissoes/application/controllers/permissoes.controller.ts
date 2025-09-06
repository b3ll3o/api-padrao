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

@ApiTags('Permissoes')
@ApiBearerAuth()
@Controller('permissoes')
export class PermissoesController {
  constructor(private readonly permissoesService: PermissoesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new permissao' })
  @ApiResponse({
    status: 201,
    description: 'The permissao has been successfully created.',
    type: Permissao,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  create(@Body() createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    return this.permissoesService.create(createPermissaoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all permissoes' })
  @ApiResponse({
    status: 200,
    description: 'Returns all permissoes.',
    type: [Permissao],
  })
  findAll(): Promise<Permissao[]> {
    return this.permissoesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a permissao by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the permissao with the specified ID.',
    type: Permissao,
  })
  @ApiResponse({ status: 404, description: 'Permissao not found.' })
  findOne(@Param('id') id: string): Promise<Permissao> {
    return this.permissoesService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing permissao' })
  @ApiResponse({
    status: 200,
    description: 'The permissao has been successfully updated.',
    type: Permissao,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 404, description: 'Permissao not found.' })
  update(
    @Param('id') id: string,
    @Body() updatePermissaoDto: UpdatePermissaoDto,
  ): Promise<Permissao> {
    return this.permissoesService.update(+id, updatePermissaoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a permissao by ID' })
  @ApiResponse({
    status: 204,
    description: 'The permissao has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Permissao not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.permissoesService.remove(+id);
  }
}
