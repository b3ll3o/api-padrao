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

@Controller('permissoes')
export class PermissoesController {
  constructor(private readonly permissoesService: PermissoesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    return this.permissoesService.create(createPermissaoDto);
  }

  @Get()
  findAll(): Promise<Permissao[]> {
    return this.permissoesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Permissao> {
    return this.permissoesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePermissaoDto: UpdatePermissaoDto,
  ): Promise<Permissao> {
    return this.permissoesService.update(+id, updatePermissaoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.permissoesService.remove(+id);
  }
}
