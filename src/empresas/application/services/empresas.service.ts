import { Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmpresaRepository } from '../../domain/repositories/empresa.repository';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { PerfilRepository } from '../../../perfis/domain/repositories/perfil.repository';
import { AddUsuarioEmpresaDto } from '../../dto/add-usuario-empresa.dto';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';

@Injectable()
export class EmpresasService {
  private readonly logger = new Logger(EmpresasService.name);

  constructor(
    private readonly empresaRepository: EmpresaRepository,
    private readonly usuarioRepository: UsuarioRepository,
    private readonly perfilRepository: PerfilRepository,
    private readonly configService: ConfigService,
    @Inject(EMAIL_SENDER_SERVICE)
    private readonly emailSenderService: EmailSenderService,
  ) {}

  async create(createEmpresaDto: CreateEmpresaDto) {
    const empresa = await this.empresaRepository.create(createEmpresaDto);
    this.logger.log(`Empresa criada: ${empresa.nome} (ID: ${empresa.id})`);
    return empresa;
  }

  async findAll(paginationDto: PaginationDto) {
    return this.empresaRepository.findAll(paginationDto);
  }

  async findOne(id: string) {
    const empresa = await this.empresaRepository.findOne(id);
    if (!empresa) {
      throw new NotFoundException(`Empresa com ID ${id} não encontrada`);
    }
    return empresa;
  }

  async update(id: string, updateEmpresaDto: UpdateEmpresaDto) {
    await this.findOne(id); // Check existence
    const empresa = await this.empresaRepository.update(id, updateEmpresaDto);
    this.logger.log(`Empresa atualizada: ${empresa.nome} (ID: ${id})`);
    return empresa;
  }

  async remove(id: string) {
    await this.findOne(id); // Check existence
    await this.empresaRepository.remove(id);
    this.logger.log(`Empresa removida (soft-delete): ID ${id}`);
  }

  async addUser(empresaId: string, addUsuarioEmpresaDto: AddUsuarioEmpresaDto) {
    const { usuarioId, perfilIds } = addUsuarioEmpresaDto;

    // Validar existência da empresa
    const empresa = await this.findOne(empresaId);

    // Validar existência do usuário
    const usuario = await this.usuarioRepository.findOne(usuarioId);
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${usuarioId} não encontrado`);
    }

    // [email-notifications + performance] Batch lookup de perfis em 1 round-trip.
    // SDD: .openspec/changes/email-notifications/design.md (1 query)
    const perfis = await this.perfilRepository.findManyByIds(perfilIds);
    const encontrados = new Set(perfis.map((p) => p.id));
    const perfilFaltando = perfilIds.find((id) => !encontrados.has(id));
    if (perfilFaltando !== undefined) {
      throw new NotFoundException(
        `Perfil com ID ${perfilFaltando} não encontrado`,
      );
    }

    await this.empresaRepository.addUserToCompany(
      empresaId,
      usuarioId,
      perfilIds,
    );
    this.logger.log(
      `Usuário ${usuarioId} adicionado à empresa ${empresaId} com perfis ${perfilIds.join(', ')}`,
    );

    // [email-notifications] Best-effort: dispara e-mail de boas-vindas à empresa.
    // O EmailSenderService.send() é não-bloqueante (try/catch interno).
    const perfisNomes = perfis
      .map((p) => p.nome ?? `perfil-${p.id}`)
      .join(', ');
    const loginUrl =
      this.configService.get<string>('APP_LOGIN_URL') ??
      'http://localhost:3000';
    await this.emailSenderService.send('empresas.user_added', usuario.email, {
      nomeUsuario: usuario.email,
      nomeEmpresa: empresa.nome,
      perfis: perfisNomes,
      loginUrl,
    });
  }

  async findUsersByCompany(empresaId: string, paginationDto: PaginationDto) {
    await this.findOne(empresaId); // Valida existência
    return this.empresaRepository.findUsersByCompany(empresaId, paginationDto);
  }

  async findCompaniesByUser(usuarioId: number, paginationDto: PaginationDto) {
    // Validar existência do usuário
    const usuario = await this.usuarioRepository.findOne(usuarioId);
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${usuarioId} não encontrado`);
    }
    return this.empresaRepository.findCompaniesByUser(usuarioId, paginationDto);
  }
}
