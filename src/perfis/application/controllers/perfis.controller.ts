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
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';

@Controller('perfis')
export class PerfisController {
  constructor(private readonly perfisService: PerfisService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPerfilDto: CreatePerfilDto): Promise<Perfil> {
    return this.perfisService.create(createPerfilDto);
  }

  @Get()
  findAll(): Promise<Perfil[]> {
    return this.perfisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Perfil> {
    return this.perfisService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePerfilDto: UpdatePerfilDto,
  ): Promise<Perfil> {
    return this.perfisService.update(+id, updatePerfilDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.perfisService.remove(+id);
  }
}
