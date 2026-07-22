import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true conserva el cuerpo crudo para verificar la firma HMAC de
  // los webhooks de Meta (ver WhatsappController).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Validación global de DTOs en los límites del sistema (REQUIREMENTS.md).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`WhatsFlow AI escuchando en http://localhost:${port}`);
}

void bootstrap();
