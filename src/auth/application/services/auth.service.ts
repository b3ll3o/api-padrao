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
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { LoginHistoryRepository } from '../../domain/repositories/login-history.repository';
import { LoginAttemptTracker } from '../../domain/services/login-attempt-tracker.service';
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

    const user =
      await this.usuarioRepository.findByEmailWithPerfisAndPermissoes(
        loginUsuarioDto.email,
      );

    if (
      !user ||
      !user.senha ||
      !loginUsuarioDto.senha ||
      !(await this.passwordHasher.compare(loginUsuarioDto.senha, user.senha))
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
          motivo: !user ? 'usuario_nao_encontrado' : 'senha_invalida',
        },
        'Falha no login',
      );
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // [ALT-003] Login bem-sucedido → reseta contador de tentativas.
    await this.loginAttemptTracker.clearFailures(loginUsuarioDto.email);

    // Persiste histórico de login via porta (DIP) — antes era `prisma.loginHistory.create`
    await this.loginHistoryRepository.record({
      userId: user.id,
      ip,
      userAgent,
    });

    // [ALT-004] Loga sucesso com duração para correlação operacional.
    this.logger.log(
      {
        event: 'auth.login.success',
        userId: user.id,
        email: user.email,
        ip,
        userAgent,
      },
      'Login bem-sucedido',
    );

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
      this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS') ?? 7;
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
    const tokenRecord = await this.refreshTokenRepository.findByTokenWithUser(
      hashRefreshToken(refreshToken),
    );

    if (!tokenRecord) {
      this.logger.warn(
        { event: 'auth.refresh.invalid', motivo: 'token_nao_encontrado' },
        'Refresh token inválido',
      );
      throw new UnauthorizedException('Refresh token inválido.');
    }

    // Detecção de Reuso de Token (Ataque Detectado)
    if (tokenRecord.revokedAt) {
      // Se um token já revogado for usado, revogamos TODOS os tokens do usuário
      // por precaução. A defesa em profundidade é parte do protocolo OAuth.
      await this.refreshTokenRepository.revokeAllForUser(tokenRecord.userId);
      this.logger.error(
        {
          event: 'auth.refresh.reuse_detected',
          userId: tokenRecord.userId,
        },
        'Reuso de refresh token detectado — todos os tokens revogados',
      );
      throw new ForbiddenException(
        'Atividade suspeita detectada. Todos os tokens revogados.',
      );
    }

    if (new Date() > tokenRecord.expiresAt) {
      this.logger.warn(
        { event: 'auth.refresh.expired', userId: tokenRecord.userId },
        'Refresh token expirado',
      );
      throw new UnauthorizedException('Refresh token expirado.');
    }

    // Revoga o token atual (rotação)
    await this.refreshTokenRepository.revoke(tokenRecord.id);

    return this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.empresas,
    );
  }
}
