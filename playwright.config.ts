import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo con dos navegadores compartiendo sala.
 * Arranca el servidor y el cliente automaticamente.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    // La 3D es la vista por defecto, pero la mayoria de las pruebas manejan los
    // tableros 2D (arrastrar en el lienzo, leer etiquetas). Arrancan con la 2D
    // elegida; las de e2e/mode3d.spec.ts piden la 3D con ?mode=3d o vacian el
    // almacenamiento para comprobar el valor por defecto.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5173',
          localStorage: [{ name: 'arcade:vista', value: '2d' }],
        },
      ],
    },
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      // Se prueba el servidor compilado: evita diferencias del watcher de tsx
      // y se acerca mas al proceso que se ejecuta en produccion.
      command: 'npm run start -w @arcade/server',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm exec --workspace=@arcade/web -- vite --host 127.0.0.1',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
