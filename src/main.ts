import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true conserva el cuerpo crudo para verificar la firma HMAC de
  // los webhooks de Meta (ver WhatsappController).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Panel web mínimo (HTML/JS estático) servido desde /public — sin dependencias
  // extra (usa el express que ya trae @nestjs/platform-express). __dirname es
  // dist/ en ejecución, así que ../public apunta a la carpeta del repo.
  app.useStaticAssets(join(__dirname, '..', 'public'));

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
