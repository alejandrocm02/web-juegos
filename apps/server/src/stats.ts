import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BotDifficulty, GameId, MatchResult, SoloRecord } from '@arcade/shared';
import { logger } from './logger.js';

export interface StoredMatch {
  roomCode: string;
  game: GameId;
  result: MatchResult;
  golfExtras?: Record<string, { strokes: number; holesInOne: number }>;
}

export interface StatsRepository {
  saveMatch(match: StoredMatch): Promise<void>;
  leaderboard(): Promise<{ alias: string; wins: number; matches: number }[]>;
  /** Marca personal de un perfil anonimo en un juego, o null si no tiene. */
  getRecord(profileId: string, game: GameId): Promise<SoloRecord | null>;
  saveRecord(profileId: string, record: SoloRecord): Promise<void>;
  listRecords(profileId: string): Promise<SoloRecord[]>;
  ready: boolean;
}

function recordKey(profileId: string, game: GameId): string {
  return profileId + '::' + game;
}

/**
 * Repositorio en memoria. Se usa como respaldo cuando el cliente de Prisma no
 * esta generado todavia (por ejemplo en un checkout limpio sin `npm run db:push`).
 */
class MemoryStats implements StatsRepository {
  ready = true;
  private matches: StoredMatch[] = [];
  private records = new Map<string, SoloRecord>();

  async saveMatch(match: StoredMatch): Promise<void> {
    this.matches.push(match);
    if (this.matches.length > 500) this.matches.shift();
  }

  async getRecord(profileId: string, game: GameId): Promise<SoloRecord | null> {
    return this.records.get(recordKey(profileId, game)) ?? null;
  }

  async saveRecord(profileId: string, record: SoloRecord): Promise<void> {
    this.records.set(recordKey(profileId, record.game), { ...record });
  }

  async listRecords(profileId: string): Promise<SoloRecord[]> {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(profileId + '::'))
      .map(([, record]) => ({ ...record }));
  }

  async leaderboard(): Promise<{ alias: string; wins: number; matches: number }[]> {
    const table = new Map<string, { alias: string; wins: number; matches: number }>();
    for (const match of this.matches) {
      for (const row of match.result.rows) {
        const entry = table.get(row.name) ?? { alias: row.name, wins: 0, matches: 0 };
        entry.matches += 1;
        if (match.result.winnerIds.includes(row.playerId)) entry.wins += 1;
        table.set(row.name, entry);
      }
    }
    return [...table.values()].sort((a, b) => b.wins - a.wins).slice(0, 20);
  }
}

interface GroupedRow {
  alias: string;
  _count: { _all: number };
}

class PrismaStats implements StatsRepository {
  ready = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly prisma: any) {}

  async saveMatch(match: StoredMatch): Promise<void> {
    await this.prisma.matchRecord.create({
      data: {
        roomCode: match.roomCode,
        game: match.game,
        players: match.result.rows.length,
        winners: match.result.winnerIds.join(','),
        results: {
          create: match.result.rows.map((row) => ({
            alias: row.name,
            score: Math.round(row.score),
            won: match.result.winnerIds.includes(row.playerId),
            totalStrokes: match.golfExtras?.[row.playerId]?.strokes ?? 0,
            holesInOne: match.golfExtras?.[row.playerId]?.holesInOne ?? 0,
          })),
        },
      },
    });
  }

  async leaderboard(): Promise<{ alias: string; wins: number; matches: number }[]> {
    const rows = (await this.prisma.playerResult.groupBy({
      by: ['alias'],
      _count: { _all: true },
    })) as GroupedRow[];
    const wins = (await this.prisma.playerResult.groupBy({
      by: ['alias'],
      where: { won: true },
      _count: { _all: true },
    })) as GroupedRow[];

    const winMap = new Map<string, number>(wins.map((row) => [row.alias, row._count._all]));
    return rows
      .map((row) => ({
        alias: row.alias,
        matches: row._count._all,
        wins: winMap.get(row.alias) ?? 0,
      }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 20);
  }

  async getRecord(profileId: string, game: GameId): Promise<SoloRecord | null> {
    const row = (await this.prisma.soloRecord.findUnique({
      where: { profileId_game: { profileId, game } },
    })) as PrismaSoloRecord | null;
    return row ? toSoloRecord(row) : null;
  }

  async saveRecord(profileId: string, record: SoloRecord): Promise<void> {
    const data = {
      value: Math.round(record.value),
      detail: record.detail.slice(0, 120),
      difficulty: record.difficulty,
      plays: record.plays,
      wins: record.wins,
      updatedAt: new Date(record.updatedAt),
    };
    await this.prisma.soloRecord.upsert({
      where: { profileId_game: { profileId, game: record.game } },
      create: { profileId, game: record.game, ...data },
      update: data,
    });
  }

  async listRecords(profileId: string): Promise<SoloRecord[]> {
    const rows = (await this.prisma.soloRecord.findMany({
      where: { profileId },
    })) as PrismaSoloRecord[];
    return rows.map(toSoloRecord);
  }
}

interface PrismaSoloRecord {
  game: string;
  value: number;
  detail: string;
  difficulty: string | null;
  plays: number;
  wins: number;
  updatedAt: Date;
}

function toSoloRecord(row: PrismaSoloRecord): SoloRecord {
  return {
    game: row.game as GameId,
    value: row.value,
    detail: row.detail,
    difficulty: (row.difficulty as BotDifficulty | null) ?? null,
    plays: row.plays,
    wins: row.wins,
    updatedAt: row.updatedAt.getTime(),
  };
}

let repository: StatsRepository = new MemoryStats();

interface SchemaHelpers {
  providerFor(url: string): 'sqlite' | 'postgresql';
  resolveDatabaseUrl(url: string, prismaDir: string): string;
}

/** Cliente de Prisma con su adaptador, segun el proveedor de `DATABASE_URL`. */
async function createClient(url: string, provider: 'sqlite' | 'postgresql'): Promise<unknown> {
  if (provider === 'postgresql') {
    // Se genera aparte (src/generated/prisma-pg): el cliente de Prisma 7 queda
    // atado al proveedor con el que se genero.
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import('./generated/prisma-pg/client.js'),
      import('@prisma/adapter-pg'),
    ]);
    const adapter = new PrismaPg({
      connectionString: url,
      // Un solo proceso con poco trafico: pocas conexiones bastan, y Neon
      // limita las del plan gratuito.
      max: 5,
      // Neon despierta en milisegundos, pero si no responde el servidor no
      // debe quedarse colgado al arrancar: mejor seguir en memoria.
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    return new PrismaClient({ adapter });
  }
  const [{ PrismaClient }, { PrismaBetterSqlite3 }] = await Promise.all([
    import('./generated/prisma/client.js'),
    import('@prisma/adapter-better-sqlite3'),
  ]);
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export async function initStats(): Promise<StatsRepository> {
  let label = 'SQLite';
  try {
    // @ts-expect-error El script de Prisma es JavaScript plano, sin tipos.
    const helpers = (await import('../scripts/prisma-schema.mjs')) as SchemaHelpers;
    // La ruta de SQLite se ancla en la carpeta prisma, igual que hace la CLI,
    // para que ambos abran el mismo fichero se lance el proceso desde donde se
    // lance. Las URLs de PostgreSQL se devuelven intactas.
    const prismaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma');
    const url = helpers.resolveDatabaseUrl(process.env.DATABASE_URL ?? 'file:./dev.db', prismaDir);
    const provider = helpers.providerFor(url);
    label = provider === 'postgresql' ? 'Postgres' : 'SQLite';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (await createClient(url, provider)) as any;
    // Comprobacion rapida: si alguna tabla no existe caemos al almacen en
    // memoria. Se comprueban las dos, porque una base de datos creada antes de
    // añadir el modo individual tiene `MatchRecord` pero no `SoloRecord`.
    await client.matchRecord.count();
    await client.soloRecord.count();
    repository = new PrismaStats(client);
    logger.info('Persistencia ' + label + ' lista (Prisma)');
  } catch (error) {
    repository = new MemoryStats();
    logger.warn(
      'Prisma (' +
        label +
        ') no disponible, se usa almacenamiento en memoria. ' +
        'Ejecuta "npm run db:push" para crear las tablas.',
      // Nunca se registra la URL: en produccion lleva la contraseña.
      error instanceof Error ? error.message : String(error),
    );
  }
  return repository;
}

export function getStats(): StatsRepository {
  return repository;
}
