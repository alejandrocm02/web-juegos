import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');

/**
 * Lee las variables VITE_* del .env compartido de la raiz del monorepo.
 *
 * No se usa `envDir` ni `loadEnv` a proposito: ambos hacen que Vite herede el
 * `NODE_ENV=development` que el servidor necesita en local (loadEnv analiza el
 * archivo entero aunque se filtre por prefijo), y entonces el bundle de
 * produccion incluye React en modo desarrollo: 539 kB en lugar de 303 kB.
 * Leyendo el archivo aqui, el entorno del servidor no puede contaminar la
 * compilacion del cliente y se mantiene un unico .env compartido.
 */
function readSharedViteEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) {
    let content: string;
    try {
      content = readFileSync(path.join(repoRoot, file), 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      if (!key.startsWith('VITE_')) continue;
      result[key] = line
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

const sharedEnv = readSharedViteEnv();

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SERVER_URL': JSON.stringify(sharedEnv.VITE_SERVER_URL ?? ''),
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
