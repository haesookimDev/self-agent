import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';
import { config } from './config.js';

async function bootstrap(): Promise<void> {
  const appConfig = config();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 2 * 1024 * 1024 }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  app.enableCors({
    origin: appConfig.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  await app.listen(appConfig.PORT, appConfig.HOST);
  Logger.log(`Control plane listening on http://${appConfig.HOST}:${appConfig.PORT}`);
}

await bootstrap();
