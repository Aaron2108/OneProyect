import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthContext, AuthResult } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Alta de empresa + usuario propietario. Devuelve un JWT. */
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  /** Inicio de sesión. Devuelve un JWT. */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  /** Datos del usuario autenticado (comprobación rápida del token). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthContext): AuthContext {
    return user;
  }
}
