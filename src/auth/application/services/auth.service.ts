// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/application/services/auth.service.spec.ts

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { LoginHistoryRepository } from '../../domain/repositories/login-history.repository';
import { LoginAttemptTracker } from '../../domain/services/login-attempt-tracker.service';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';
import {
  EmpresaAuthPayload,
  EmpresaJwtPayload,
  JwtAccessTokenPayload,
} from '../../domain/types/jwt-payload';

/**
 * [SEC-001] SHA-256 do token bruto é a forma persistida no DB.
 * O token bruto continua sendo retornado ao cliente (cookie/resposta),
 * mas o `RefreshTokenRepository` armazena apenas o hash — defesa contra
 * dump da tabela expor tokens válidos.
 */
const hashRefreshToken = (rawToken: string): string =>
  createHash('sha256').update(rawToken).digest('hex');

/**
 * `AuthService` (camada Application) — orquestra autenticação e refresh
 * token rotation. Após o ALT-001, depende apenas de **portas** (interfaces
 * de domínio), nunca de `PrismaService` diretamente. Isto satisfaz o DIP
 * e facilita testes unitários com mocks simples.
 *
 * Logs estruturados [ALT-004] são emitidos via `Logger` (Pino) com chaves
 * `userId`, `email`, `ip`, `userAgent` e `motivo` — sem expor senha/token.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Autenticação
// SDD: .openspec/changes/auth-jwt-rotation/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/application/services/auth.service.spec.ts
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usuarioRepository: UsuarioRepository,
    private jwtService: JwtService,
    private passwordHasher: PasswordHasher,
    private configService: ConfigService,
    private refreshTokenRepository: RefreshTokenRepository,
    private loginHistoryRepository: LoginHistoryRepository,
    private loginAttemptTracker: LoginAttemptTracker,
    // [A2] UnitOfWork (porta) — encapsula transação atômica para evitar
    // race condition no refresh: 2 chamadas simultâneas com o mesmo token
    // precisam ser serializadas (revoke + create em única transação).
    private unitOfWork: UnitOfWork,
  ) {}

  async login(
    loginUsuarioDto: LoginUsuarioDto,
    ip?: string,
    userAgent?: string,
  ) {
    // [ALT-003] Account lockout (OWASP A07) — verifica ANTES de consultar o DB.
    if (await this.loginAttemptTracker.isLocked(loginUsuarioDto.email)) {
      this.logger.warn(
        {
          event: 'auth.login.blocked',
          email: loginUsuarioDto.email,
          ip,
          userAgent,
        },
        'Login bloqueado — excesso de tentativas',
      );
      throw new HttpException(
        'Conta temporariamente bloqueada. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // [ALT-006] Step 1: busca mínima apenas com credenciais (id, email,
    // senha, ativo, deletedAt). NÃO carrega perfis/permissões aqui —
    // a comparação de hash é o gargalo de CPU, mas não de dados.
    const credentials = await this.usuarioRepository.findByEmailWithCredentials(
      loginUsuarioDto.email,
    );

    if (
      !credentials ||
      !credentials.senha ||
      !loginUsuarioDto.senha ||
      !(await this.passwordHasher.compare(
        loginUsuarioDto.senha,
        credentials.senha,
      ))
    ) {
      // [ALT-003] Registra tentativa falha (incrementa contador com TTL).
      await this.loginAttemptTracker.recordFailure(loginUsuarioDto.email);

      // [ALT-004] Loga falha sem expor a senha — usa só o email.
      this.logger.warn(
        {
          event: 'auth.login.fail',
          email: loginUsuarioDto.email,
          ip,
          userAgent,
          motivo: !credentials ? 'usuario_nao_encontrado' : 'senha_invalida',
        },
        'Falha no login',
      );
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // [ALT-003] Login bem-sucedido → reseta contador de tentativas.
    await this.loginAttemptTracker.clearFailures(loginUsuarioDto.email);

    // Persiste histórico de login via porta (DIP) — antes era `prisma.loginHistory.create`
    await this.loginHistoryRepository.record({
      userId: credentials.id,
      ip,
      userAgent,
    });

    // [ALT-004] Loga sucesso com duração para correlação operacional.
    this.logger.log(
      {
        event: 'auth.login.success',
        userId: credentials.id,
        email: credentials.email,
        ip,
        userAgent,
      },
      'Login bem-sucedido',
    );

    // [ALT-006] Step 2: APÓS validar hash, carrega perfis/permissões para
    // montar o JWT. Esta query NÃO retorna `senha` (select explícito).
    const user =
      await this.usuarioRepository.findByEmailWithPerfisAndPermissoes(
        loginUsuarioDto.email,
      );

    if (!user) {
      // Edge case raro: usuário foi deletado entre o step 1 e o step 2.
      // Consideramos falha de autenticação.
      this.logger.error(
        {
          event: 'auth.login.race_condition',
          userId: credentials.id,
          email: credentials.email,
        },
        'Usuário desapareceu entre validação de credencial e carga de perfis',
      );
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return this.generateTokens(user.id, user.email, user.empresas);
  }

  async generateTokens(
    userId: number,
    email: string,
    empresas: EmpresaAuthPayload[] | undefined,
  ) {
    // [MED-002] Downcast da forma completa (vinda do `UsuarioRepository`)
    // para a forma minimalista que vai no JWT. Apenas `id` (empresa) e
    // `codigo` (perfil/permissão) — o resto o frontend resolve via lookup.
    const mappedEmpresas: EmpresaJwtPayload[] =
      empresas?.map((ue) => ({
        id: ue.empresaId,
        perfis: ue.perfis?.map((perfil) => ({
          codigo: perfil.codigo,
          permissoes: perfil.permissoes?.map((permissao) => ({
            codigo: permissao.codigo,
          })),
        })),
      })) ?? [];

    const payload: JwtAccessTokenPayload = {
      email,
      sub: userId,
      empresas: mappedEmpresas,
    };

    const accessToken = this.jwtService.sign(payload, {
      // @nestjs/jwt 11 tipa expiresIn como `number | StringValue | undefined`.
      // O ConfigService retorna `string | undefined` (ex.: '15m' do Joi default).
      // O cast `as any` é a forma mais segura: @nestjs/jwt revalida internamente.
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') as any,
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    });

    const refreshTokenValue = uuidv4();
    const expiresInDays =
      this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS') ?? 2;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // [SEC-001] Persiste o HASH do token, não o token bruto.
    await this.refreshTokenRepository.create({
      tokenHash: hashRefreshToken(refreshTokenValue),
      userId,
      expiresAt,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
    };
  }

  async refreshTokens(refreshToken: string) {
    // [SEC-001] Lookup pelo HASH — nunca pelo token bruto. Tokens em
    // plaintext não existem no DB.
    const tokenHash = hashRefreshToken(refreshToken);

    // [A2] Atomicidade: revoke + create em única transação.
    // Cenário de race: 2 refreshes simultâneos com o mesmo token (cliente
    // com retry agressivo). Sem transação, ambos leem válido, ambos chamam
    // `revoke` e ambos chamam `generateTokens()` que cria 2 refresh tokens
    // novos — bypass da rotação, conta pode ser comprometida.
    // A transação força lock row-level no Postgres: a 2ª chamada concorrente
    // só lê o estado DEPOIS do commit da 1ª, vendo `revokedAt != null`
    // e disparando a detecção de reuso (defesa em profundidade).
    const result = await this.unitOfWork.execute<
      Prisma.TransactionClient,
      { access_token: string; refresh_token: string }
    >(async (tx) => {
      // 1. Busca token DENTRO da transação (força lock row-level)
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              ativo: true,
              deletedAt: true,
              empresas: {
                select: {
                  empresaId: true,
                  perfis: {
                    select: {
                      id: true,
                      nome: true,
                      codigo: true,
                      descricao: true,
                      permissoes: {
                        select: {
                          id: true,
                          nome: true,
                          codigo: true,
                          descricao: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!stored) {
        throw new UnauthorizedException('Refresh token inválido.');
      }

      // Detecção de Reuso de Token (Ataque Detectado) — defesa em profundidade.
      // Se um token já revogado for apresentado, revogamos TODOS os tokens
      // ativos do usuário e abortamos a transação. Esse caminho trata 2
      // cenários:
      //   (a) Atacante roubou token já usado (vazamento).
      //   (b) Race: 2 refreshes simultâneos — a 2ª chamada chega após o
      //       commit da 1ª e vê `revokedAt != null`.
      if (stored.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.error(
          {
            event: 'auth.refresh.reuse_detected',
            userId: stored.userId,
          },
          'Reuso de refresh token detectado — todos os tokens revogados',
        );
        throw new ForbiddenException(
          'Atividade suspeita detectada. Todos os tokens revogados.',
        );
      }

      if (stored.expiresAt < new Date()) {
        this.logger.warn(
          { event: 'auth.refresh.expired', userId: stored.userId },
          'Refresh token expirado',
        );
        throw new UnauthorizedException('Refresh token expirado.');
      }

      // Usuário soft-deletado ou inativo: nada de refresh.
      if (!stored.user.ativo || stored.user.deletedAt) {
        this.logger.warn(
          {
            event: 'auth.refresh.user_inactive',
            userId: stored.userId,
          },
          'Tentativa de refresh com usuário inativo/deletado',
        );
        throw new UnauthorizedException('Usuário inativo.');
      }

      // 2. Revoga o token atual (rotação) — atomicamente
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      // 3. Cria novo refresh token — atomicamente
      const newRefreshTokenValue = uuidv4();
      const expiresInDays =
        this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS') ?? 2;
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + expiresInDays);

      await tx.refreshToken.create({
        data: {
          tokenHash: hashRefreshToken(newRefreshTokenValue),
          userId: stored.userId,
          expiresAt: newExpiresAt,
        },
      });

      // 4. Gera novo access token (não escreve no DB, apenas assina JWT)
      const mappedEmpresas: EmpresaJwtPayload[] =
        stored.user.empresas?.map((ue) => ({
          id: ue.empresaId,
          perfis: ue.perfis?.map((perfil) => ({
            codigo: perfil.codigo,
            permissoes: perfil.permissoes?.map((permissao) => ({
              codigo: permissao.codigo,
            })),
          })),
        })) ?? [];

      const payload: JwtAccessTokenPayload = {
        email: stored.user.email,
        sub: stored.userId,
        empresas: mappedEmpresas,
      };

      const accessToken = this.jwtService.sign(payload, {
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as any,
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      return {
        access_token: accessToken,
        refresh_token: newRefreshTokenValue,
      };
    });

    return result;
  }
}
