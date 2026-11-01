import 'reflect-metadata';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // Render provides PORT. API_PORT and 3000 are fallbacks for local development.
  const rawPort = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
