/**
 * Lanza la CLI de Prisma cargando el .env de la raiz del monorepo.
 *
 * Prisma solo busca el archivo .env junto al schema o en el directorio actual,
 * y aqui la configuracion vive en la raiz del repositorio. Este script carga
 * primero apps/server/.env (si existe) y despues el .env de la raiz, y pasa las
 * variables al proceso hijo.
 *
 * Se invoca el binario de Prisma directamente con el ejecutable de Node (sin
 * shell) para que funcione igual en Windows, macOS y Linux y para evitar el
 * aviso DEP0190 de Node al pasar argumentos a un proceso con shell.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const rootDir = path.resolve(serverDir, '..', '..');

for (const candidate of [path.join(serverDir, '.env'), path.join(rootDir, '.env')]) {
  if (existsSync(candidate)) config({ path: candidate });
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
  console.warn('[prisma] No se encontro DATABASE_URL en .env, se usa file:./dev.db');
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/run-prisma.mjs <comando de prisma>');
  process.exit(1);
}

const require = createRequire(import.meta.url);

function resolvePrismaCli() {
  const packageJsonPath = require.resolve('prisma/package.json');
  const packageJson = require('prisma/package.json');
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.prisma;
  if (!bin) throw new Error('No se encontro el binario de Prisma en su package.json');
  return path.join(path.dirname(packageJsonPath), bin);
}

let cli;
try {
  cli = resolvePrismaCli();
} catch (error) {
  console.error('[prisma] No se pudo localizar la CLI. Ejecuta "npm install" primero.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const child = spawn(process.execPath, [cli, ...args], {
  cwd: serverDir,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
  console.error('[prisma] No se pudo ejecutar la CLI:', error.message);
  process.exit(1);
});
