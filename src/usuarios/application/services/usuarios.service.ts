// BDD: features/usuarios.feature
// SDD: .openspec/changes/usuarios/design.md
// ATDD: test/usuarios.e2e-spec.ts
// TDD: src/usuarios/application/services/usuarios.service.spec.ts

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';

import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Usuario } from '../../domain/entities/usuario.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Roles } from '../../../shared/domain/constants/auth.constants';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';
import { RefreshTokenRepository } from '../../../auth/domain/repositories/refresh-token.repository';
import { UnitOfWork } from '../../../auth/domain/services/unit-of-work.service';

type UsuarioLogado = JwtPayload;

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly usuarioAuthorizationService: IUsuarioAuthorizationService,
    private readonly configService: ConfigService,
    @Inject(EMAIL_SENDER_SERVICE)
    private readonly emailSenderService: EmailSenderService,
    // [H4] Port para revogação em massa dos refresh tokens. Resolvida via
    // `forwardRef(AuthModule)` em `UsuariosModule`.
    private readonly refreshTokenRepository: RefreshTokenRepository,
    // [A3] Port para atomicidade do findOne + mutate em uma única transação
    // (evita race condition entre 2 admins chamando PATCH simultâneo no
    // mesmo usuário — HIGH finding DevSecOps 2026-06-21).
    private readonly unitOfWork: UnitOfWork,
  ) {}

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
      newUsuario.senha = await this.passwordHasher.hash(createUsuarioDto.senha);
    }

    // perfisIds logic removed as profiles are now company-scoped.

    const usuario = await this.usuarioRepository.create(newUsuario);

    this.logger.log(`Usuário criado com sucesso: ${usuario.email}`);

    // [email-notifications] Dispara e-mail de boas-vindas (template usuarios.welcome).
    // Best-effort: EmailSenderService.send() é não-bloqueante.
    const loginUrl =
      this.configService.get<string>('APP_LOGIN_URL') ??
      'http://localhost:3000';
    await this.emailSenderService.send('usuarios.welcome', usuario.email, {
      nome: usuario.email,
      email: usuario.email,
      link: `${loginUrl}/auth/forgot-password`,
    });

    return usuario;
  }

  async findAll(
    paginationDto: PaginationDto,
    usuarioLogado: UsuarioLogado,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<PaginatedResponseDto<Usuario>> {
    const isAdminGlobal = usuarioLogado.empresas?.some((e) =>
      e.perfis?.some((p) => p.codigo === Roles.ADMIN),
    );

    const isAdminInEmpresa =
      empresaId &&
      usuarioLogado.empresas?.some(
        (e) =>
          e.id === empresaId && e.perfis?.some((p) => p.codigo === Roles.ADMIN),
      );

    if (!isAdminGlobal && !isAdminInEmpresa) {
      throw new ForbiddenException(
        'Você não tem permissão para listar usuários',
      );
    }

    return this.usuarioRepository.findAll(paginationDto, includeDeleted);
  }

  async findOne(
    id: number,
    usuarioLogado: UsuarioLogado,
    includeDeleted: boolean = false,
  ): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne(id, includeDeleted); // Pass includeDeleted
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    if (
      !this.usuarioAuthorizationService.canAccessUsuario(
        usuario.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar os dados deste usuário',
      );
    }

    return usuario;
  }

  /**
   * [A3] Atualiza um usuário em uma única transação atômica.
   *
   * ## Race scenario resolvido
   *
   * Antes desta versão, a operação fazia `findOne` + `restore()`/`remove()`
   * em queries separadas. Cenário:
   *
   *   T1: admin A lê `deletedAt=null`
   *   T2: admin B lê `deletedAt=null`
   *   T1: A aplica soft-delete (UPDATE deletedAt=now())
   *   T2: B aplica soft-delete de novo → estado inconsistente
   *      (Prisma P2025 ou duplo `deletedAt`)
   *
   * ## Estratégia de locking (escolhida)
   *
   * Prisma `$transaction` com isolation default `READ COMMITTED` +
   * `updateMany` com `WHERE` condicional incluindo o **estado esperado**
   * (`deletedAt: <expected>`). Postgres adquire row-level lock no
   * candidato; o segundo admin concorrente vê `count: 0` (estado já
   * mudou) → ConflictException (409).
   *
   * Trade-offs considerados e descartados:
   *  - `SERIALIZABLE`: correto mas caro (serialization failure → retry).
   *  - `SELECT FOR UPDATE` via `$queryRaw`: mais SQL cru, mesmo efeito.
   *  - `version` field (optimistic concurrency): exige migration.
   *
   * Pragma: usar a coluna existente `deletedAt` como discriminator de
   * conflito é mais barato e dispensa migration.
   *
   * ## Atomicidade
   *
   * Tudo dentro de `unitOfWork.execute`:
   *   1. tx.usuario.findUnique (estado atual)
   *   2. tx.usuario.updateMany (mutação atômica com lock implícito)
   *   3. tx.refreshToken.updateMany (revogação se senha mudou)
   *   4. leitura final via tx.usuario.findUnique
   *
   * Falha em qualquer passo → ROLLBACK.
   */
  async update(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    usuarioLogado: UsuarioLogado,
    empresaId?: string,
  ): Promise<Usuario> {
    // Pré-leitura fora da transação: usada para checar permissão,
    // validar email duplicado, detectar mudança de email e capturar
    // estado inicial. Barata porque é uma única query.
    const preCheck = await this.usuarioRepository.findOne(id, true);
    if (!preCheck) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    if (
      !this.usuarioAuthorizationService.canUpdateUsuario(
        preCheck.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar os dados deste usuário',
      );
    }

    let emailChanged = false;
    if (
      updateUsuarioDto.email !== undefined &&
      updateUsuarioDto.email !== preCheck.email
    ) {
      const usuarioExistente = await this.usuarioRepository.findByEmail(
        updateUsuarioDto.email,
      );
      if (usuarioExistente && usuarioExistente.id !== id) {
        throw new ConflictException(
          'Este e-mail já está em uso por outro usuário.',
        );
      }
      emailChanged = true;
    }

    // Pré-computar o hash da senha fora da transação (bcrypt é CPU-bound).
    let passwordChanged = false;
    let newPasswordHash: string | undefined;
    if (updateUsuarioDto.senha) {
      newPasswordHash = await this.passwordHasher.hash(updateUsuarioDto.senha);
      passwordChanged = true;
    }

    // Decidir intenção de soft-delete / restore para validar permissão
    // fora da transação.
    let wantsRestore = false;
    let wantsSoftDelete = false;
    if (updateUsuarioDto.ativo !== undefined) {
      if (updateUsuarioDto.ativo === true) {
        wantsRestore = true;
        if (
          !this.usuarioAuthorizationService.canRestoreUsuario(
            preCheck.id,
            usuarioLogado,
          )
        ) {
          throw new ForbiddenException(
            'Você não tem permissão para restaurar este usuário',
          );
        }
      } else {
        wantsSoftDelete = true;
        const isAdminInEmpresa =
          empresaId &&
          usuarioLogado.empresas?.some(
            (e) =>
              e.id === empresaId &&
              e.perfis?.some((p) => p.codigo === Roles.ADMIN),
          );
        if (!isAdminInEmpresa) {
          throw new ForbiddenException(
            'Você não tem permissão para deletar este usuário',
          );
        }
      }
    }

    // [A3] ============ TRANSAÇÃO ATÔMICA ============
    // Tudo dentro deste callback roda em uma única transação Prisma.
    // Falha em qualquer op → ROLLBACK automático.
    const txResult = await this.unitOfWork.execute<
      Prisma.TransactionClient,
      {
        entity: Usuario;
        disabledNow: boolean;
      }
    >(async (tx) => {
      // 1. Re-leitura DENTRO da transação — ponto de coerência.
      //    Usamos `select` enxuto (sem senha, LGPD/ALT-006).
      const current = await tx.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          ativo: true,
          deletedAt: true,
        },
      });
      if (!current) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
      }

      let disabledNow = false;

      // 2a. Soft-delete / restore com optimistic-style guard via `where`.
      if (wantsRestore) {
        if (current.deletedAt === null) {
          throw new ConflictException(
            `Usuário com ID ${id} não está deletado.`,
          );
        }
        // Guard atômico: WHERE deletedAt: current.deletedAt — se outro
        // admin mudou o estado entre nosso findUnique e este updateMany,
        // count=0 → 409.
        const res = await tx.usuario.updateMany({
          where: { id, deletedAt: current.deletedAt },
          data: { deletedAt: null, ativo: true },
        });
        if (res.count === 0) {
          throw new ConflictException(
            `Usuário ${id} foi modificado por outra requisição — recarregue e tente novamente.`,
          );
        }
      } else if (wantsSoftDelete) {
        if (current.deletedAt !== null) {
          throw new ConflictException(`Usuário com ID ${id} já está deletado.`);
        }
        const res = await tx.usuario.updateMany({
          where: { id, deletedAt: null },
          data: { deletedAt: new Date(), ativo: false },
        });
        if (res.count === 0) {
          throw new ConflictException(
            `Usuário ${id} foi modificado por outra requisição — recarregue e tente novamente.`,
          );
        }
        disabledNow = true;
      }

      // 2b. Email / senha (mutações in-place). Usamos `updateMany` para
      // também detectar conflito em email/senha caso outro request
      // tenha mutado o registro entre findUnique e este update.
      const data: Prisma.UsuarioUpdateInput = {};
      if (emailChanged && updateUsuarioDto.email !== undefined) {
        data.email = updateUsuarioDto.email;
      }
      if (passwordChanged && newPasswordHash !== undefined) {
        data.senha = newPasswordHash;

        // [H4] Revoga refresh tokens ATIVOS na MESMA transação.
        // Garante que, se a senha mudou, tokens antigos não sobrevivem
        // mesmo em caso de crash/rollback subsequente.
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      if (Object.keys(data).length > 0) {
        const res = await tx.usuario.updateMany({
          where: { id, deletedAt: current.deletedAt },
          data,
        });
        if (res.count === 0) {
          throw new ConflictException(
            `Usuário ${id} foi modificado por outra requisição — recarregue e tente novamente.`,
          );
        }
      }

      // 3. Leitura final dentro da transação (dados frescos + pós-mutação).
      const updatedRow = await tx.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ativo: true,
        },
      });
      if (!updatedRow) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
      }

      const entity = new Usuario();
      entity.id = updatedRow.id;
      entity.email = updatedRow.email;
      entity.createdAt = updatedRow.createdAt;
      entity.updatedAt = updatedRow.updatedAt;
      entity.deletedAt = updatedRow.deletedAt;
      entity.ativo = updatedRow.ativo;

      return { entity, disabledNow };
    });
    // ============ /TRANSAÇÃO ATÔMICA ============

    const updatedUsuario = txResult.entity;
    const disabledNow = txResult.disabledNow;

    this.logger.log(`Usuário atualizado: ${updatedUsuario.email}`);

    // [A5] DevSecOps 2026-06-21 — invalida cache Redis (TTL 60s) do
    // payload de perfis+permissões sempre que algo que afeta autorização
    // muda (ativo/email/senha). Sem isso, até 60s de staleness após a
    // mudança — janela aceitável mas que pode ser evitada quando sabemos
    // explicitamente que algo mudou.
    if (passwordChanged || disabledNow || emailChanged) {
      await this.usuarioRepository.invalidateUserCache(id);
      this.logger.log(
        { event: 'auth.user_cache.invalidated', userId: id },
        'Cache de perfis/permissões invalidado após mutação',
      );
    }

    // [H4] DevSecOps 2026-06-21 — defesa em profundidade. Quando a senha
    // é alterada (por self-service ou por admin), TODOS os refresh tokens
    // ativos do usuário são revogados. Já feito atomicamente DENTRO da
    // transação (acima); aqui apenas registramos o evento de auditoria.
    if (passwordChanged) {
      this.logger.log(
        { event: 'auth.password_changed', userId: id },
        'Senha alterada — todos os refresh tokens revogados',
      );
    }

    // [email-notifications] Notifica o usuário quando ele for desativado
    // (transição ativo: true → false). Best-effort.
    if (disabledNow) {
      const dataHora = new Date().toISOString();
      await this.emailSenderService.send(
        'usuarios.account_disabled',
        updatedUsuario.email,
        {
          nome: updatedUsuario.email,
          dataHora,
        },
      );
    }

    return updatedUsuario;
  }
}
