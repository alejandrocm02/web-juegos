import type { PlayerIcon, ScoreRow } from '@arcade/shared';
import type { RoomPlayer } from '../rooms/types.js';

export interface RankInput {
  playerId: string;
  score: number;
  detail?: string;
  /** Criterio de desempate: menor es mejor (por ejemplo, tiempo total). */
  tiebreak?: number;
}

export interface RankOptions {
  lowerIsBetter?: boolean;
}

/** Ordena y asigna posiciones marcando los empates reales. */
export function rankPlayers(
  players: RoomPlayer[],
  entries: RankInput[],
  options: RankOptions = {},
): ScoreRow[] {
  const lower = options.lowerIsBetter ?? false;
  const byId = new Map(players.map((p) => [p.id, p]));

  const sorted = entries.slice().sort((a, b) => {
    const primary = lower ? a.score - b.score : b.score - a.score;
    if (primary !== 0) return primary;
    const at = a.tiebreak ?? 0;
    const bt = b.tiebreak ?? 0;
    return at - bt;
  });

  const rows: ScoreRow[] = [];
  let rank = 0;
  let previousKey: string | null = null;
  sorted.forEach((entry, index) => {
    const key = entry.score + '|' + (entry.tiebreak ?? 0);
    if (key !== previousKey) rank = index + 1;
    previousKey = key;
    const player = byId.get(entry.playerId);
    rows.push({
      playerId: entry.playerId,
      name: player?.name ?? 'Jugador',
      color: player?.color ?? '#94a3b8',
      icon: (player?.icon ?? 'circle') as PlayerIcon,
      score: entry.score,
      detail: entry.detail,
      rank,
      tied: false,
    });
  });

  for (const row of rows) {
    row.tied = rows.filter((other) => other.rank === row.rank).length > 1;
  }
  return rows;
}

export function winnersFrom(rows: ScoreRow[]): string[] {
  return rows.filter((row) => row.rank === 1).map((row) => row.playerId);
}
