import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error El script de Prisma es JavaScript plano, sin tipos.
import { providerFor, withProvider, prepareSchema } from '../scripts/prisma-schema.mjs';

const SCHEMA = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model SoloRecord {
  id        String @id @default(cuid())
  profileId String
}
`;

describe('proveedor de base de datos', () => {
  it('reconoce PostgreSQL por el esquema de la URL', () => {
    expect(providerFor('postgres://user:pass@host:5432/db')).toBe('postgresql');
    expect(providerFor('postgresql://user:pass@host:5432/db?sslmode=require')).toBe('postgresql');
  });

  it('reconoce SQLite', () => {
    expect(providerFor('file:./dev.db')).toBe('sqlite');
  });

  it('cae a SQLite cuando la URL falta o no se reconoce', () => {
    // Es el valor por defecto del proyecto: nunca exige servicios externos.
    expect(providerFor(undefined)).toBe('sqlite');
    expect(providerFor('')).toBe('sqlite');
    expect(providerFor('mongodb://host/db')).toBe('sqlite');
  });
});

describe('sustitucion del proveedor en el esquema', () => {
  it('cambia solo el datasource, nunca el generador', () => {
    const result = withProvider(SCHEMA, 'postgresql');
    expect(result).toContain('provider = "postgresql"');
    // El generador sigue siendo el cliente de Prisma: si se tocara, no compilaria.
    expect(result).toContain('provider = "prisma-client-js"');
    expect(result).not.toContain('provider = "sqlite"');
  });

  it('conserva el resto del esquema intacto', () => {
    const result = withProvider(SCHEMA, 'postgresql');
    expect(result).toContain('model SoloRecord');
    expect(result).toContain('url      = env("DATABASE_URL")');
    expect(result.split('\n')).toHaveLength(SCHEMA.split('\n').length);
  });
});

describe('preparacion del esquema efectivo', () => {
  function sandbox(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'prisma-schema-'));
    writeFileSync(path.join(dir, 'schema.prisma'), SCHEMA, 'utf8');
    return dir;
  }

  it('usa el esquema original cuando el proveedor ya coincide', () => {
    const dir = sandbox();
    const chosen = prepareSchema(dir, 'file:./dev.db');
    expect(chosen).toBe(path.join(dir, 'schema.prisma'));
    // No se ensucia el directorio con un archivo derivado innecesario.
    expect(existsSync(path.join(dir, 'schema.runtime.prisma'))).toBe(false);
  });

  it('escribe un esquema derivado para PostgreSQL junto al original', () => {
    const dir = sandbox();
    const chosen = prepareSchema(dir, 'postgresql://user:pass@host:5432/db');
    expect(chosen).toBe(path.join(dir, 'schema.runtime.prisma'));
    expect(readFileSync(chosen, 'utf8')).toContain('provider = "postgresql"');
    // El original no se modifica: es la unica fuente de verdad.
    expect(readFileSync(path.join(dir, 'schema.prisma'), 'utf8')).toBe(SCHEMA);
  });

  it('deja el derivado en el mismo directorio para no romper rutas relativas', () => {
    // `file:./dev.db` se resuelve respecto al directorio del esquema: si el
    // derivado viviera en otro sitio, SQLite apuntaria a un archivo distinto.
    const dir = sandbox();
    const chosen = prepareSchema(dir, 'postgres://host/db');
    expect(path.dirname(chosen)).toBe(dir);
  });
});
