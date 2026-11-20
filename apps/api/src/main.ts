import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express, { json } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const origins = (config.getOrThrow<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const webRoot = config.get<string>('WEB_ROOT') || '';
  app.setGlobalPrefix('v1', {
    exclude: webRoot ? [] : [{ path: '/', method: RequestMethod.GET }],
  });
  app.use(helmet(webRoot ? {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Google's sign-in window has to be able to return to this page.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  } : {}));
  app.use(cookieParser());
  app.use(json({ limit: '32kb' }));
  const privateOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?$/;
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (config.get<string>('NODE_ENV') !== 'production' && privateOrigin.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  if (config.get<string>('NODE_ENV') === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  if (webRoot) {
    const server = app.getHttpAdapter().getInstance();
    const page = readFileSync(join(webRoot, 'index.html'), 'utf8')
      .replace('name="cinnarios-api" content=""', 'name="cinnarios-api" content="same"');
    server.get(['/', '/index.html'], (_req: unknown, res: express.Response) => {
      // The page itself is always checked again, so a new deploy shows up straight away.
      res.set('Cache-Control', 'no-cache').type('html').send(page);
    });
    // Files asked for with a version (?v=12) never change under that version, so browsers keep
    // them for a year; index.html bumps the version when a file changes. Anything else is rechecked.
    server.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
      next();
    });
    server.use(express.static(webRoot, { index: false, cacheControl: false }));
  }

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
