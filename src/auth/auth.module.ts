import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.decorator';

/**
 * Autenticación JWT con scope de tenant. Exporta el `JwtAuthGuard`, el
 * `RolesGuard` y el `JwtModule` para que otros módulos protejan sus endpoints
 * importando `AuthModule`.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        // expiresIn admite formato `ms` (ej. '1d'); el tipo de la librería exige
        // un literal, así que se castea el valor tomado de configuración.
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ?? '1d') as `${number}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [AuthService, GoogleAuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
