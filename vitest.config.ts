import { existsSync } from 'node:fs';
import path from 'node:path';
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
  plugins: [tsExtensionResolver()],
  test: {
    environment: 'node',
    include: [
      'packages/**/tests/**/*.test.ts',
      'apps/server/tests/**/*.test.ts',
      'apps/web/tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Solo se mide la logica que se puede probar sin navegador: reglas,
      // simulaciones y servidor. Las vistas de React se cubren con Playwright,
      // no con vitest, y contarlas aqui daria un porcentaje enganoso.
      include: [
        'apps/server/src/**/*.ts',
        'packages/shared/src/**/*.ts',
        'packages/game-engine/src/**/*.ts',
        'apps/web/src/games/golf-input.ts',
        'apps/web/src/games/golf-render.ts',
      ],
      exclude: ['**/*.d.ts', '**/dist/**'],
      // Umbral de no retroceso, unos puntos por debajo de la cobertura real
      // (83% de lineas, 79% de ramas) para que no falle por ruido. Se sube
      // cuando se anaden pruebas; no se baja para que pase una entrega.
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
