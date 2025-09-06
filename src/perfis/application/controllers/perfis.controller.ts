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
  @ApiOperation({ summary: 'Create a new perfil' })
  @ApiResponse({
    status: 201,
    description: 'The perfil has been successfully created.',
    type: Perfil,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  create(@Body() createPerfilDto: CreatePerfilDto): Promise<Perfil> {
    return this.perfisService.create(createPerfilDto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all perfis' })
  @ApiResponse({
    status: 200,
    description: 'Returns all perfis.',
    type: [Perfil],
  })
  findAll(): Promise<Perfil[]> {
    return this.perfisService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a perfil by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the perfil with the specified ID.',
    type: Perfil,
  })
  @ApiResponse({ status: 404, description: 'Perfil not found.' })
  findOne(@Param('id') id: string): Promise<Perfil> {
    return this.perfisService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing perfil' })
  @ApiResponse({
    status: 200,
    description: 'The perfil has been successfully updated.',
    type: Perfil,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 404, description: 'Perfil not found.' })
  update(
    @Param('id') id: string,
    @Body() updatePerfilDto: UpdatePerfilDto,
  ): Promise<Perfil> {
    return this.perfisService.update(+id, updatePerfilDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a perfil by ID' })
  @ApiResponse({
    status: 204,
    description: 'The perfil has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Perfil not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.perfisService.remove(+id);
  }
}
