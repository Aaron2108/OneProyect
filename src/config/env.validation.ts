import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * Validación de variables de entorno en el arranque.
 * Requisito transversal (REQUIREMENTS.md): validar la entrada en los límites del
 * sistema — aquí, fallar temprano si la configuración es inválida.
 *
 * Solo se exigen como obligatorias las variables sin las que la app no puede
 * arrancar de forma segura. Las credenciales de WhatsApp/IA se validan como
 * requeridas más adelante, en los módulos que las usan, para permitir levantar
 * el esqueleto en local sin todas las integraciones configuradas.
 */
class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
