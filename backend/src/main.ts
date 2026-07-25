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

  // Backend y frontend son repos/despliegues independientes (ver /CLAUDE.md):
  // Nest ya no sirve el build de React como estático, solo expone la API. El
  // panel (origen distinto) necesita CORS habilitado para poder consumirla.
  const config = app.get(ConfigService);
  const frontendBaseUrl = config.get<string>('frontend.baseUrl');
  app.enableCors({
    origin: frontendBaseUrl || 'http://localhost:5173',
    credentials: true,
  });

  // Validación global de DTOs en los límites del sistema (REQUIREMENTS.md).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`WhatsFlow AI escuchando en http://localhost:${port}`);
}

void bootstrap();
