import { Module } from '@nestjs/common';
import { AuthController } from './application/controllers/auth.controller';
import { AuthService } from './application/services/auth.service';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './infrastructure/constants/jwt.constants';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthorizationService } from '../shared/domain/services/authorization.service';
import { DefaultAuthorizationService } from './infrastructure/services/default-authorization.service';

@Module({
  imports: [
    UsuariosModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: AuthorizationService,
      useClass: DefaultAuthorizationService,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, AuthorizationService],
})
export class AuthModule {}
