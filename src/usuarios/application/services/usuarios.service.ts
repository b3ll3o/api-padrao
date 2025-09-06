import { ConflictException, Injectable } from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import * as bcrypt from 'bcrypt';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';

@Injectable()
export class UsuariosService {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}
  async create(createUsuarioDto: CreateUsuarioDto) {
    const usuarioExistente = await this.usuarioRepository.findByEmail(
      createUsuarioDto.email,
    );

    if (usuarioExistente) {
      throw new ConflictException('Usuário com este email já cadastrado');
    }

    if (createUsuarioDto.senha) {
      const salt = await bcrypt.genSalt();
      createUsuarioDto.senha = await bcrypt.hash(createUsuarioDto.senha, salt);
    }

    const usuario = await this.usuarioRepository.create(createUsuarioDto);

    delete usuario.senha;
    return usuario;
  }
}
