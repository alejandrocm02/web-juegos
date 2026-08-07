import { existsSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Los paquetes usan imports con extension .js (obligatorio en ESM/NodeNext).
 * Este plugin los resuelve al archivo .ts equivalente durante los tests.
 */
function tsExtensionResolver(): Plugin {
  return {
    name: 'ts-extension-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('.js')) return null;
      if (!source.startsWith('./') && !source.startsWith('../')) return null;
      const absolute = path.resolve(path.dirname(importer), source);
      const candidate = absolute.replace(/\.js$/, '.ts');
      if (existsSync(candidate)) return candidate;
      return null;
    },
  };
}

export default defineConfig({
  // El plugin de React solo hace falta para los tests de componentes; el resto
  // de suites son de Node y no lo notan.
  plugins: [tsExtensionResolver(), react()],
  test: {
    // Node por defecto: la mayoria de las suites son del servidor o de logica
    // pura. Los tests de componentes piden jsdom con un docblock al inicio del
    // fichero (// @vitest-environment jsdom).
    environment: 'node',
    include: [
      'packages/**/tests/**/*.test.ts',
      'apps/server/tests/**/*.test.ts',
      'apps/web/tests/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
  },
});
