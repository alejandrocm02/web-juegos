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

export async function initStats(): Promise<StatsRepository> {
  try {
    const mod = await import('@prisma/client');
    const PrismaClient = (mod as { PrismaClient?: new () => unknown }).PrismaClient;
    if (!PrismaClient) throw new Error('PrismaClient no disponible');
    const client = new PrismaClient();
    // Comprobacion rapida: si alguna tabla no existe caemos al almacen en
    // memoria. Se comprueban las dos, porque una base de datos creada antes de
    // añadir el modo individual tiene `MatchRecord` pero no `SoloRecord`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).matchRecord.count();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).soloRecord.count();
    repository = new PrismaStats(client);
    logger.info('Persistencia SQLite lista (Prisma)');
  } catch (error) {
    repository = new MemoryStats();
    logger.warn(
      'Prisma no disponible, se usa almacenamiento en memoria. Ejecuta "npm run db:push" para habilitar SQLite.',
      error instanceof Error ? error.message : String(error),
    );
  }
  return repository;
}

export function getStats(): StatsRepository {
  return repository;
}
