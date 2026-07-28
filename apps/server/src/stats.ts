import type { GameId, MatchResult } from '@arcade/shared';
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
  ready: boolean;
}

/**
 * Repositorio en memoria. Se usa como respaldo cuando el cliente de Prisma no
 * esta generado todavia (por ejemplo en un checkout limpio sin `npm run db:push`).
 */
class MemoryStats implements StatsRepository {
  ready = true;
  private matches: StoredMatch[] = [];

  async saveMatch(match: StoredMatch): Promise<void> {
    this.matches.push(match);
    if (this.matches.length > 500) this.matches.shift();
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
}

let repository: StatsRepository = new MemoryStats();

export async function initStats(): Promise<StatsRepository> {
  try {
    const mod = await import('@prisma/client');
    const PrismaClient = (mod as { PrismaClient?: new () => unknown }).PrismaClient;
    if (!PrismaClient) throw new Error('PrismaClient no disponible');
    const client = new PrismaClient();
    // Comprobacion rapida: si la tabla no existe caemos al almacen en memoria.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).matchRecord.count();
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
