import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // El .env compartido vive en la raiz del monorepo.
  envDir: path.resolve(__dirname, '../..'),
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
