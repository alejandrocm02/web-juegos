/**
 * Configuracion de la CLI de Prisma, obligatoria desde la version 7.
 *
 * En Prisma 7 el `url` desaparece del bloque `datasource` del esquema: la
 * cadena que usan `generate`, `db push` y `studio` se declara aqui, y la que
 * usa la aplicacion en caliente la aporta el adaptador de driver de stats.ts.
 * Son dos caminos distintos a proposito y los dos leen `DATABASE_URL`.
 *
 * El esquema que se pasa es el derivado que escribe run-prisma.mjs, no el
 * original, porque el proveedor se elige segun la URL.
 */
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.runtime.prisma',
  datasource: { url: env('DATABASE_URL') },
});
