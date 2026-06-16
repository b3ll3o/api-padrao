import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioRepository } from 'src/usuarios/domain/repositories/usuario.repository';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';
import { ForgotPasswordDto } from '../../dto/forgot-password.dto';
import { ResetPasswordDto } from '../../dto/reset-password.dto';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Orquestra o fluxo de recuperação de senha:
 *
 * - `forgotPassword` — gera token opaco, persiste SHA256 do token e dispara envio
 *   de e-mail (mock). SEMPRE retorna void para não revelar se o e-mail existe
 *   (anti-enumeração — REQ-PR-001, NFR-PR-003).
 * - `resetPassword` — valida hash do token + expiração + `usedAt`, atualiza a
 *   senha do usuário via `PasswordHasher`, marca token como usado e **revoga
 *   todos os `RefreshToken` ativos** do usuário em uma única transação
 *   (cascade — REQ-PR-006, NFR-PR-005).
 *
 * Após ALT-002, a transação é encapsulada via `UnitOfWork` (porta) — o service
 * não conhece `prisma.$transaction` diretamente. Após ALT-004, falhas
 * críticas são logadas via `Logger` (Pino).
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-001..010
// ATDD: test/auth-password-recovery.e2e-spec.ts
// TDD: src/auth/application/services/password-recovery.service.spec.ts
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private usuarioRepository: UsuarioRepository,
    private resetTokenRepository: PasswordResetTokenRepository,
    private passwordHasher: PasswordHasher,
    private unitOfWork: UnitOfWork,
    private configService: ConfigService,
    @Inject(EMAIL_SENDER_SERVICE)
    private emailSenderService: EmailSenderService,
  ) {}

  /**
   * Solicita um link de redefinição de senha. Resposta silenciosa: nunca
   * revela se o e-mail existe, está soft-deletado ou inativo.
   *
   * @param dto DTO com `email` do solicitante.
   */
  // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail válido
  // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail inexistente
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usuarioRepository.findByEmail(dto.email);

    if (!user || !user.ativo) {
      // [ALT-004] Loga tentativa (sem revelar se email existe) para auditoria.
      this.logger.debug(
        { event: 'auth.forgot_password.silenced', email: dto.email },
        'forgotPassword silenciado',
      );
      return;
    }

    // Invalida tokens anteriores do mesmo usuário (cascade — REQ-PR-005)
    await this.resetTokenRepository.invalidateAllForUser(user.id);

    // Gera novo token: 32 bytes random (256 bits) → 64 hex chars
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.resetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // [email-notifications] Delega ao EmailSenderService (template auth.password_reset).
    // O EmailSenderService cuida de: kill-switch, validação de templateId,
    // render de placeholders, injeção de APP_NAME/APP_LOGIN_URL/ano_atual,
    // e logging estruturado.
    // SDD: .openspec/changes/email-notifications/design.md:REQ-EM-07
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    const validade = '1 hora';
    await this.emailSenderService.send('auth.password_reset', user.email, {
      nome: user.email,
      link: resetUrl,
      validade,
    });

    this.logger.log(
      { event: 'auth.forgot_password.token_issued', userId: user.id },
      'Token de reset emitido',
    );
  }

  /**
   * Confirma a redefinição de senha validando o token recebido e aplicando
   * a nova senha. Em caso de sucesso, **revoga todos os `RefreshToken` ativos**
   * do usuário — defesa em profundidade (NFR-PR-005).
   *
   * @param dto DTO com `token` (plain) e `novaSenha`.
   * @throws UnauthorizedException se o token for inválido, expirado ou já usado.
   */
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token válido
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token expirado
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token já utilizado
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const token = await this.resetTokenRepository.findValidByHash(tokenHash);

    if (!token) {
      this.logger.warn(
        {
          event: 'auth.reset_password.fail',
          motivo: 'token_invalido_ou_expirado',
        },
        'Tentativa de reset com token inválido',
      );
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const newPasswordHash = await this.passwordHasher.hash(dto.novaSenha);

    // [ALT-002] Transação atômica encapsulada via UnitOfWork (DIP).
    // O service não conhece mais `prisma.$transaction` — apenas o "T"
    // genérico (Prisma.TransactionClient) injetado pelo adapter.
    await this.unitOfWork.execute<Prisma.TransactionClient, void>(
      async (tx) => {
        await tx.usuario.update({
          where: { id: token.userId },
          data: { senha: newPasswordHash },
        });
        await tx.refreshToken.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.passwordResetToken.update({
          where: { id: token.id },
          data: { usedAt: new Date() },
        });
      },
    );

    this.logger.log(
      { event: 'auth.reset_password.success', userId: token.userId },
      'Senha redefinida com sucesso',
    );

    // [email-notifications] Notifica o usuário sobre a troca de senha.
    // Best-effort: EmailSenderService.send() é não-bloqueante (try/catch interno).
    const usuario = await this.usuarioRepository.findOne(token.userId, false);
    if (usuario) {
      const dataHora = new Date().toISOString();
      await this.emailSenderService.send(
        'usuarios.password_changed',
        usuario.email,
        {
          nome: usuario.email,
          dataHora,
          ip: 'desconhecido',
        },
      );
    }
  }
}
