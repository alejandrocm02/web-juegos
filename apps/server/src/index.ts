import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GAME_META, GOLF_LEVELS } from '@arcade/shared';
import { env } from './env.js';
import { logger } from './logger.js';
import { registerSocketHandlers } from './socket.js';
import { getStats, initStats } from './stats.js';

export async function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.isProduction ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), env: env.NODE_ENV });
  });

  app.get('/api/games', (_req, res) => {
    res.json({
      games: Object.entries(GAME_META).map(([id, meta]) => ({ id, ...meta })),
      golfLevels: GOLF_LEVELS.map((level) => ({
        id: level.id,
        name: level.name,
        par: level.par,
        difficulty: level.difficulty,
        aceRoute: level.aceRoute,
      })),
    });
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      res.json({ rows: await getStats().leaderboard() });
    } catch {
      res.status(200).json({ rows: [] });
    }
  });

  // En produccion el mismo servicio sirve el cliente ya compilado, de modo que
  // no hay CORS entre cliente y servidor y basta con un unico despliegue.
  const clientDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'web',
    'dist',
  );
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
    logger.info('Sirviendo el cliente compilado desde ' + clientDir);
  } else if (env.isProduction) {
    logger.warn(
      'No se encontro el cliente compilado en ' + clientDir + '. Ejecuta "npm run build".',
    );
  }

  // Manejo centralizado de errores.
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Error HTTP no controlado', error.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    },
  );

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: env.isProduction ? env.corsOrigins : true, credentials: true },
    maxHttpBufferSize: 1e5,
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  const manager = registerSocketHandlers(io);
  return { app, httpServer, io, manager };
}

async function main() {
  await initStats();
  const { httpServer } = await createApp();
  httpServer.listen(env.PORT, () => {
    logger.info('Servidor escuchando en http://localhost:' + env.PORT);
    logger.info('Origenes CORS permitidos: ' + env.corsOrigins.join(', '));
  });

  const shutdown = () => {
    logger.info('Apagando servidor...');
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isDirectRun = entryPath !== '' && path.resolve(selfPath) === entryPath;

if (isDirectRun || process.env.START_SERVER === '1') {
  main().catch((error) => {
    logger.error('Fallo al arrancar', String(error));
    process.exit(1);
  });
}
