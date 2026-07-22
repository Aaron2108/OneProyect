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

  // Panel web (React + Vite, ver /frontend) servido como build estático — Nest
  // no compila ni sirve el frontend en dev; `npm run build` (raíz) construye
  // frontend/dist antes de este paso. __dirname es dist/ en ejecución, así que
  // ../frontend/dist apunta al build generado por Vite.
  app.useStaticAssets(join(__dirname, '..', 'frontend', 'dist'));

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
