/**
 * Elige el proveedor de base de datos a partir de `DATABASE_URL`.
 *
 * Prisma no admite `env()` en el campo `provider`: tiene que ser un literal en
 * el esquema. Para no mantener dos esquemas en paralelo (que acabarian
 * divergiendo) se conserva uno solo, `schema.prisma`, y aqui se genera una
 * copia con el proveedor sustituido justo antes de invocar la CLI.
 *
 * La copia se escribe en el mismo directorio que el original a proposito: asi
 * una ruta relativa como `file:./dev.db` sigue resolviendo al mismo sitio.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Nombre del esquema temporal. Esta en .gitignore. */
export const RUNTIME_SCHEMA_NAME = 'schema.runtime.prisma';

/**
 * Traduce una cadena de conexion al proveedor de Prisma correspondiente.
 *
 * Se admiten los que tienen sentido para este proyecto: SQLite en local y
 * PostgreSQL en produccion (Neon, Supabase, Render o cualquier otro).
 */
export function providerFor(databaseUrl) {
  const url = String(databaseUrl ?? '').trim();
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('file:')) return 'sqlite';
  // Sin prefijo reconocible se asume SQLite, que es el valor por defecto del
  // proyecto y nunca necesita servicios externos.
  return 'sqlite';
}

/** Devuelve el esquema con la linea `provider` del datasource sustituida. */
export function withProvider(schema, provider) {
  let insideDatasource = false;
  return schema
    .split('\n')
    .map((line) => {
      if (/^\s*datasource\s+\w+\s*\{/.test(line)) insideDatasource = true;
      else if (insideDatasource && /^\s*\}/.test(line)) insideDatasource = false;
      else if (insideDatasource && /^\s*provider\s*=/.test(line)) {
        const indent = line.match(/^\s*/)?.[0] ?? '  ';
        return indent + 'provider = "' + provider + '"';
      }
      return line;
    })
    .join('\n');
}

/**
 * Escribe el esquema efectivo y devuelve su ruta.
 *
 * Si el proveedor coincide con el del esquema original no se toca nada y se
 * devuelve el original, para que el flujo habitual en local sea idéntico al de
 * siempre.
 */
export function prepareSchema(prismaDir, databaseUrl) {
  const source = path.join(prismaDir, 'schema.prisma');
  const schema = readFileSync(source, 'utf8');
  const provider = providerFor(databaseUrl);

  if (new RegExp('provider\\s*=\\s*"' + provider + '"').test(schema)) return source;

  const target = path.join(prismaDir, RUNTIME_SCHEMA_NAME);
  writeFileSync(target, withProvider(schema, provider), 'utf8');
  return target;
}
