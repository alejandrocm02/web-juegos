import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GAME_META, GOLF_LEVELS, recordsQuerySchema } from '@arcade/shared';
import { env } from './env.js';
import { logger } from './logger.js';
import { listSoloRecords } from './records.js';
import { registerSocketHandlers } from './socket.js';
import { getStats, initStats } from './stats.js';

export async function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: env.isProduction ? env.corsOrigins : true, credentials: true },
    maxHttpBufferSize: 1e5,
    pingTimeout: 20000,
    pingInterval: 10000,
  });
  // El gestor de salas se crea antes que las rutas porque `/api/metrics` lo
  // consulta. Registrar los handlers de socket no abre ninguna conexion: solo
  // deja preparados los listeners.
  const manager = registerSocketHandlers(io);

  // Render termina TLS en un proxy. Confiar solo en el primer salto permite
  // que express-rate-limit use la IP real sin aceptar cabeceras arbitrarias.
  if (env.isProduction) app.set('trust proxy', 1);
  // CSP explicita en vez de desactivada. El cliente son bundles propios y no
  // carga nada de terceros, asi que 'self' basta. Se permite 'unsafe-inline'
  // solo en estilos porque las vistas usan variables CSS en atributos style.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          // WebSocket de Socket.IO, mismo origen en produccion.
          connectSrc: ["'self'", 'ws:', 'wss:'],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.isProduction ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  // El limite se aplica solo a la API. Si cubriera tambien los estaticos, cinco
  // amigos tras el mismo NAT gastarian el presupuesto solo con recargar la
  // pagina, porque cada carga son varias peticiones (HTML, JS, CSS, icono).
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      // El sondeo de salud de la plataforma no debe consumir cuota.
      skip: (req) => req.path === '/health',
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

  // Marcas personales del modo individual. El identificador de perfil es
  // anonimo y lo genera el propio navegador, asi que no expone nada del usuario.
  app.get('/api/records', async (req, res) => {
    const parsed = recordsQuerySchema.safeParse({ profileId: req.query.profileId });
    if (!parsed.success) {
      res.status(400).json({ error: 'Identificador de perfil invalido', records: [] });
      return;
    }
    res.json({ records: await listSoloRecords(parsed.data.profileId) });
  });

  // Metricas de proceso en texto plano, sin dependencias ni formato exotico.
  // Sirve para saber de un vistazo si el servidor esta sufriendo: cuantas salas
  // sostiene, cuantas partidas hay en curso y cuanta memoria consume.
  app.get('/api/metrics', (_req, res) => {
    const rooms = manager.snapshotMetrics();
    const memory = process.memoryUsage();
    const lines = [
      'uptime_seconds ' + Math.round(process.uptime()),
      'rooms_total ' + rooms.rooms,
      'rooms_max ' + rooms.maxRooms,
      'rooms_playing ' + rooms.playing,
      'rooms_lobby ' + rooms.lobby,
      'rooms_solo ' + rooms.solo,
      'players_total ' + rooms.players,
      'players_connected ' + rooms.connected,
      'bots_total ' + rooms.bots,
      'memory_heap_used_bytes ' + memory.heapUsed,
      'memory_rss_bytes ' + memory.rss,
    ];
    res.type('text/plain').send(lines.join('\n') + '\n');
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

  return { app, httpServer, io, manager };
}

/** Segundos de cortesia entre el aviso de apagado y el cierre real. */
const SHUTDOWN_GRACE_SECONDS = 8;

async function main() {
  await initStats();
  const { httpServer, io, manager } = await createApp();
  httpServer.listen(env.PORT, () => {
    logger.info('Servidor escuchando en http://localhost:' + env.PORT);
    logger.info('Origenes CORS permitidos: ' + env.corsOrigins.join(', '));
  });

  let shuttingDown = false;
  /**
   * Apagado ordenado.
   *
   * Antes el proceso moria de golpe y las partidas en curso se cortaban sin
   * explicacion. Ahora se avisa a las salas ocupadas, se les dan unos segundos
   * para que el jugador vea el mensaje y copie el codigo, y despues se cierra.
   */
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const busy = manager.all().filter((room) => !room.isEmpty).length;
    logger.info('Apagando servidor (' + signal + '). Salas ocupadas: ' + busy);

    if (busy > 0) manager.announceShutdown(SHUTDOWN_GRACE_SECONDS);
    const wait = busy > 0 ? SHUTDOWN_GRACE_SECONDS * 1000 : 0;

    setTimeout(() => {
      manager.stopSweeper();
      for (const room of manager.all()) room.dispose();
      io.close();
      httpServer.close(() => process.exit(0));
      // Red de seguridad: si algun socket se queda colgado, no bloqueamos el
      // reinicio de la plataforma indefinidamente.
      setTimeout(() => process.exit(0), 3000).unref();
    }, wait).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
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
