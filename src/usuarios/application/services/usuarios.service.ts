import { ConflictException, Injectable } from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import * as bcrypt from 'bcrypt';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Usuario } from '../../domain/entities/usuario.entity';

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

    const newUsuario = new Usuario();
    newUsuario.email = createUsuarioDto.email;

    if (createUsuarioDto.senha) {
      const salt = await bcrypt.genSalt();
      newUsuario.senha = await bcrypt.hash(createUsuarioDto.senha, salt);
    }

    // Assign perfilId if provided
    if (createUsuarioDto.perfisIds) {
      newUsuario.perfis = createUsuarioDto.perfisIds.map(id => ({ id } as any));
    }

    const usuario = await this.usuarioRepository.create(newUsuario);

    delete usuario.senha;
    return usuario;
  }
}
