import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// El .env vive en la raiz del monorepo, pero el servidor se ejecuta desde
// apps/server. Cargamos primero el .env local (si existe) y despues el de la
// raiz, sin sobrescribir lo que ya venga del entorno real.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(currentDir, '..');
const repoRoot = path.resolve(serverRoot, '..', '..');

for (const candidate of [path.join(serverRoot, '.env'), path.join(repoRoot, '.env')]) {
  if (existsSync(candidate)) config({ path: candidate });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  ROOM_EMPTY_TTL_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
  RECONNECT_GRACE_SECONDS: z.coerce.number().int().min(10).max(3600).default(90),
  SOCKET_RATE_LIMIT: z.coerce.number().int().min(5).max(1000).default(60),
  SOCKET_RATE_WINDOW_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  // Tope duro de salas vivas en el proceso. Sin el, un cliente automatizado
  // puede crear salas en bucle hasta agotar la memoria: cada una sobrevive
  // ROOM_EMPTY_TTL_SECONDS aunque se abandone al instante.
  MAX_ROOMS: z.coerce.number().int().min(1).max(100000).default(500),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno invalidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuracion de entorno invalida. Revisa el archivo .env');
}

const raw = parsed.data;

export const env = {
  ...raw,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
};

export type Env = typeof env;
