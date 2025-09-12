import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import * as bcrypt from 'bcrypt';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

type UsuarioLogado = JwtPayload;

@Injectable()
export class UsuariosService {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}

  async create(createUsuarioDto: CreateUsuarioDto) {
    const usuarioExistente = await this.usuarioRepository.findByEmail(
      createUsuarioDto.email,
    );

    if (usuarioExistente) {
      throw new ConflictException('Usuário com este e-mail já cadastrado.');
    }

    const newUsuario = new Usuario();
    newUsuario.email = createUsuarioDto.email;
    newUsuario.senha = undefined; // Initialize senha to undefined

    if (createUsuarioDto.senha) {
      const salt = await bcrypt.genSalt();
      newUsuario.senha = await bcrypt.hash(createUsuarioDto.senha, salt);
    }

    // Assign perfilId if provided
    if (createUsuarioDto.perfisIds) {
      newUsuario.perfis = createUsuarioDto.perfisIds.map(
        (id) => ({ id }) as Perfil,
      );
    }

    const usuario = await this.usuarioRepository.create(newUsuario);

    delete usuario.senha;
    return usuario;
  }

  async findOne(id: number, usuarioLogado: UsuarioLogado): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne(id);
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const isOwner = usuario.id === usuarioLogado.userId;
    const isAdmin = usuarioLogado.perfis?.some(
      (perfil) => perfil.codigo === 'ADMIN',
    );

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar os dados deste usuário',
      );
    }

    // Remove sensitive data
    delete usuario.senha;
    delete usuario.perfis;
    return usuario;
  }
}
