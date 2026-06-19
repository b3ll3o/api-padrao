// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/application/controllers/auth.controller.spec.ts

import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { RefreshTokenDto } from '../../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../../dto/forgot-password.dto';
import { ResetPasswordDto } from '../../dto/reset-password.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';

// O decorator @Throttle aceita apenas valores estáticos (metadata), por isso
// lemos o env em tempo de carregamento do módulo. Em produção, o limite
// fica em 5 req/min (login) e 10 req/min (refresh). Em testes E2E
// (.env.test), o limite sobe para 10000 para acomodar múltiplas chamadas
// em sequência sem disparar 429.
// TDD: features/autenticacao.feature:limites de throttling
const LOGIN_THROTTLE_LIMIT = parseInt(
  process.env.THROTTLER_SENSITIVE_LIMIT || '5',
  10,
);
const REFRESH_THROTTLE_LIMIT = parseInt(
  process.env.THROTTLER_SENSITIVE_LIMIT_REFRESH || '10',
  10,
);
const FORGOT_PASSWORD_THROTTLE_LIMIT = parseInt(
  process.env.THROTTLER_SENSITIVE_LIMIT_FORGOT || '5',
  10,
);
const RESET_PASSWORD_THROTTLE_LIMIT = parseInt(
  process.env.THROTTLER_SENSITIVE_LIMIT_RESET || '10',
  10,
);

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  @Public()
  @Throttle({ sensitive: { limit: LOGIN_THROTTLE_LIMIT, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Autentica um usuário e retorna tokens JWT' })
  @ApiResponse({ status: 201, description: 'Autenticação bem-sucedida.' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.' })
  async login(
    @Body() loginUsuarioDto: LoginUsuarioDto,
    @Req() req: FastifyRequest,
  ) {
    return this.authService.login(
      loginUsuarioDto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Public()
  @Throttle({ sensitive: { limit: REFRESH_THROTTLE_LIMIT, ttl: 60000 } })
  @Post('refresh')
  @ApiOperation({
    summary: 'Renova o access token utilizando um refresh token',
  })
  @ApiResponse({ status: 201, description: 'Tokens renovados com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido ou expirado.',
  })
  @ApiResponse({ status: 403, description: 'Atividade suspeita detectada.' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refresh_token);
  }

  @Public()
  @Throttle({
    sensitive: { limit: FORGOT_PASSWORD_THROTTLE_LIMIT, ttl: 60000 },
  })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solicitar recuperação de senha' })
  @ApiResponse({
    status: 200,
    description: 'Se o e-mail existir, um link será enviado.',
  })
  // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail válido
  // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail inexistente
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.passwordRecoveryService.forgotPassword(dto);
  }

  @Public()
  @Throttle({
    sensitive: { limit: RESET_PASSWORD_THROTTLE_LIMIT, ttl: 60000 },
  })
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Redefinir senha com token' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Token inválido ou expirado.',
  })
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token válido
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token expirado
  // BDD: features/autenticacao.feature:Cenário: Resetar senha com token já utilizado
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwordRecoveryService.resetPassword(dto);
  }
}
