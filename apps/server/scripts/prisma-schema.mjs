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

/**
 * Carpeta del cliente generado para cada proveedor, relativa a `prisma/`.
 *
 * El cliente de Prisma 7 queda atado al proveedor con el que se genero, y se
 * compila con el resto del servidor. Para que una misma imagen funcione con
 * SQLite o con PostgreSQL segun `DATABASE_URL` se generan los dos clientes en
 * carpetas distintas y stats.ts carga el que toca al arrancar.
 */
export const CLIENT_OUTPUT = {
  sqlite: '../src/generated/prisma',
  postgresql: '../src/generated/prisma-pg',
};

/** URL ficticia para generar el cliente de PostgreSQL sin servidor. */
export const POSTGRES_PLACEHOLDER_URL = 'postgresql://generar:generar@localhost:5432/generar';

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

/** Devuelve el esquema con la linea `output` del generador sustituida. */
export function withOutput(schema, output) {
  let insideGenerator = false;
  return schema
    .split('\n')
    .map((line) => {
      if (/^\s*generator\s+\w+\s*\{/.test(line)) insideGenerator = true;
      else if (insideGenerator && /^\s*\}/.test(line)) insideGenerator = false;
      else if (insideGenerator && /^\s*output\s*=/.test(line)) {
        const indent = line.match(/^\s*/)?.[0] ?? '  ';
        return indent + 'output   = "' + output + '"';
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
export function prepareSchema(prismaDir, databaseUrl, provider = providerFor(databaseUrl)) {
  const source = path.join(prismaDir, 'schema.prisma');
  const schema = readFileSync(source, 'utf8');

  if (new RegExp('provider\\s*=\\s*"' + provider + '"').test(schema)) return source;

  const target = path.join(prismaDir, RUNTIME_SCHEMA_NAME);
  const output = CLIENT_OUTPUT[provider];
  const adapted = withProvider(schema, provider);
  writeFileSync(target, output ? withOutput(adapted, output) : adapted, 'utf8');
  return target;
}

/**
 * Convierte una `DATABASE_URL` de SQLite relativa en absoluta.
 *
 * Hasta Prisma 6 una ruta como `file:./dev.db` se resolvia contra la carpeta
 * del esquema, asi que daba igual desde donde se lanzara el proceso. Con el
 * adaptador de driver de Prisma 7 la resuelve SQLite contra el directorio de
 * trabajo, y eso partia la base en dos: la CLI creaba las tablas en un fichero
 * (se invoca desde apps/server) y el servidor abria otro distinto al arrancar
 * desde la raiz, con lo que no encontraba ninguna tabla y caia al almacen en
 * memoria sin avisar.
 *
 * Anclando en la carpeta `prisma` se recupera el comportamiento de siempre y
 * ambos procesos apuntan al mismo fichero. Las URLs de PostgreSQL y las rutas
 * ya absolutas se devuelven intactas.
 */
export function resolveDatabaseUrl(databaseUrl, prismaDir) {
  const url = String(databaseUrl ?? '').trim();
  if (!url.startsWith('file:')) return url;

  const target = url.slice('file:'.length);
  if (target === '' || path.isAbsolute(target) || target.startsWith('/')) return url;

  return 'file:' + path.resolve(prismaDir, target);
}
