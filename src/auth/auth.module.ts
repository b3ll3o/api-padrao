import { Module } from '@nestjs/common';
import { AuthController } from './application/controllers/auth.controller';
import { AuthService } from './application/services/auth.service';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthorizationService } from '../shared/domain/services/authorization.service';
import { DefaultAuthorizationService } from './infrastructure/services/default-authorization.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    UsuariosModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') as any,
        },
      }),
      inject: [ConfigService],
    }),
    SharedModule,
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
