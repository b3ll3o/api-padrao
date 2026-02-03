import { Controller, Post, Body, Req } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { RefreshTokenDto } from '../../dto/refresh-token.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
}
