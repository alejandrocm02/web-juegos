import { GAME_IDS, type GameId } from '../constants.js';
import type { MatchResult, ScoreRow } from '../room.js';

/**
 * Modo torneo: varias partidas seguidas con una clasificación acumulada.
 *
 * La idea es convertir catorce minijuegos sueltos en una velada. El torneo no
 * es un juego más: es un orquestador que vive por encima de la sala y va
 * lanzando partidas normales, sumando puntos entre una y otra. Por eso reutiliza
 * `MatchResult` tal cual y no necesita tocar ningún runner.
 */

/** Número de pruebas que puede tener un torneo. */
export const TOURNAMENT_MIN_ROUNDS = 3;
export const TOURNAMENT_MAX_ROUNDS = 5;

/**
 * Puntos por posición en cada prueba, al estilo de un campeonato.
 *
 * La curva es deliberadamente suave: quien gana una prueba saca cuatro puntos
 * al último, no diez. Así una mala ronda no deja a nadie fuera del torneo y la
 * última prueba sigue decidiendo.
 */
export const TOURNAMENT_POINTS = [10, 7, 5, 3, 1] as const;

/** Puntos que reparte una posición concreta (1 = primero). */
export function pointsForRank(rank: number): number {
  if (rank < 1) return 0;
  return TOURNAMENT_POINTS[rank - 1] ?? 0;
}

export type TournamentPreset = 'clasico' | 'relampago' | 'personalizado';

export interface TournamentSettings {
  /** Selección de pruebas, en orden de juego. */
  games: GameId[];
  preset: TournamentPreset;
}

/** Pruebas por defecto: variadas y todas jugables entre dos y cinco personas. */
export const DEFAULT_TOURNAMENT_GAMES: GameId[] = ['quiz', 'darts', 'bowling'];

export const TOURNAMENT_PRESETS: Record<
  Exclude<TournamentPreset, 'personalizado'>,
  { name: string; summary: string; games: GameId[] }
> = {
  clasico: {
    name: 'Clásico',
    summary: 'Cinco pruebas variadas: cabeza, puntería, física y reflejos.',
    games: ['quiz', 'darts', 'bowling', 'pool', 'karts'],
  },
  relampago: {
    name: 'Relámpago',
    summary: 'Tres pruebas rápidas para una partida corta.',
    games: ['quiz', 'darts', 'blackjack'],
  },
};

/** Una prueba ya jugada dentro del torneo. */
export interface TournamentRound {
  index: number;
  game: GameId;
  /** Clasificación de esa prueba concreta, tal y como la devolvió el juego. */
  rows: ScoreRow[];
  /** Puntos de torneo que repartió, por jugador. */
  points: Record<string, number>;
  finishedAt: number;
}

export interface TournamentStanding {
  playerId: string;
  name: string;
  color: string;
  points: number;
  /** Victorias de prueba, criterio de desempate. */
  wins: number;
  rank: number;
  tied: boolean;
}

export interface TournamentPublicState {
  games: GameId[];
  /** Índice de la prueba en curso, o `games.length` si ya han terminado todas. */
  currentIndex: number;
  rounds: TournamentRound[];
  standings: TournamentStanding[];
  finished: boolean;
}

/**
 * Reparte los puntos de una prueba.
 *
 * Los empates cobran lo mismo: dos primeros se llevan los diez puntos cada uno.
 * Es más generoso que repartir la suma entre ambos, pero mucho más fácil de
 * entender en pantalla, que es lo que importa jugando con amigos.
 */
export function pointsFromResult(result: MatchResult): Record<string, number> {
  const points: Record<string, number> = {};
  for (const row of result.rows) points[row.playerId] = pointsForRank(row.rank);
  return points;
}

/** Suma acumulada del torneo, ya ordenada y con posiciones y empates. */
export function computeStandings(
  players: { id: string; name: string; color: string }[],
  rounds: TournamentRound[],
): TournamentStanding[] {
  const totals = players.map((player) => {
    let points = 0;
    let wins = 0;
    for (const round of rounds) {
      points += round.points[player.id] ?? 0;
      if (round.rows.some((row) => row.playerId === player.id && row.rank === 1)) wins += 1;
    }
    return { playerId: player.id, name: player.name, color: player.color, points, wins };
  });

  const sorted = totals.slice().sort((a, b) => b.points - a.points || b.wins - a.wins);

  const standings: TournamentStanding[] = [];
  let rank = 0;
  let previous: string | null = null;
  sorted.forEach((entry, index) => {
    const key = entry.points + '|' + entry.wins;
    if (key !== previous) rank = index + 1;
    previous = key;
    standings.push({ ...entry, rank, tied: false });
  });

  for (const standing of standings) {
    standing.tied = standings.filter((other) => other.rank === standing.rank).length > 1;
  }
  return standings;
}

/** Comprueba que una selección de pruebas es jugable. */
export function isValidTournamentGames(games: readonly string[]): games is GameId[] {
  if (games.length < TOURNAMENT_MIN_ROUNDS || games.length > TOURNAMENT_MAX_ROUNDS) return false;
  return games.every((game) => (GAME_IDS as readonly string[]).includes(game));
}
