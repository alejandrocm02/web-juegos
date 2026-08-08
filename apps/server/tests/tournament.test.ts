import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_MAX_ROUNDS,
  TOURNAMENT_MIN_ROUNDS,
  TOURNAMENT_POINTS,
  TOURNAMENT_PRESETS,
  computeStandings,
  isValidTournamentGames,
  pointsForRank,
  pointsFromResult,
  tournamentModeSchema,
  type MatchResult,
  type ScoreRow,
} from '@arcade/shared';
import { Tournament } from '../src/rooms/tournament.js';

const PLAYERS = [
  { id: 'p1', name: 'Ana', color: '#38bdf8', icon: 'circle' },
  { id: 'p2', name: 'Bruno', color: '#f472b6', icon: 'triangle' },
  { id: 'p3', name: 'Cleo', color: '#facc15', icon: 'square' },
];

function row(playerId: string, rank: number, score = 0): ScoreRow {
  const player = PLAYERS.find((p) => p.id === playerId)!;
  return {
    playerId,
    name: player.name,
    color: player.color,
    icon: 'circle',
    score,
    rank,
    tied: false,
  };
}

/** Resultado de prueba con las posiciones indicadas, en orden. */
function result(game: MatchResult['game'], order: string[]): MatchResult {
  const rows = order.map((id, index) => row(id, index + 1, order.length - index));
  return {
    game,
    rows,
    winnerIds: rows.filter((r) => r.rank === 1).map((r) => r.playerId),
    finishedAt: Date.now(),
  };
}

describe('reparto de puntos', () => {
  it('la curva es la publicada y no premia mas alla del quinto', () => {
    expect(TOURNAMENT_POINTS).toEqual([10, 7, 5, 3, 1]);
    expect(pointsForRank(1)).toBe(10);
    expect(pointsForRank(5)).toBe(1);
    expect(pointsForRank(6)).toBe(0);
    expect(pointsForRank(0)).toBe(0);
  });

  it('los empatados cobran lo mismo', () => {
    const empate: MatchResult = {
      game: 'quiz',
      rows: [row('p1', 1), row('p2', 1), row('p3', 3)],
      winnerIds: ['p1', 'p2'],
      finishedAt: Date.now(),
    };
    const points = pointsFromResult(empate);
    expect(points.p1).toBe(10);
    expect(points.p2).toBe(10);
    expect(points.p3).toBe(5);
  });
});

describe('clasificacion acumulada', () => {
  it('suma las pruebas y ordena por puntos', () => {
    const tournament = new Tournament({ games: ['quiz', 'darts', 'bowling'], preset: 'clasico' });
    tournament.recordResult(result('quiz', ['p1', 'p2', 'p3']));
    tournament.recordResult(result('darts', ['p2', 'p3', 'p1']));

    const standings = tournament.publicState(PLAYERS).standings;
    // Ana 10+5=15, Bruno 7+10=17, Cleo 5+7=12.
    expect(standings.map((s) => [s.playerId, s.points])).toEqual([
      ['p2', 17],
      ['p1', 15],
      ['p3', 12],
    ]);
    expect(standings[0]!.rank).toBe(1);
  });

  it('desempata por pruebas ganadas', () => {
    // Los dos suman lo mismo, pero uno ha ganado una prueba y el otro ninguna.
    const rounds = [
      {
        index: 0,
        game: 'quiz' as const,
        rows: [row('p1', 1), row('p2', 3)],
        points: { p1: 10, p2: 5 },
        finishedAt: 1,
      },
      {
        index: 1,
        game: 'darts' as const,
        rows: [row('p2', 2), row('p1', 4)],
        points: { p1: 3, p2: 7 },
        finishedAt: 2,
      },
      {
        index: 2,
        game: 'bowling' as const,
        rows: [row('p2', 2), row('p1', 2)],
        points: { p1: 7, p2: 8 },
        finishedAt: 3,
      },
    ];
    const standings = computeStandings(PLAYERS.slice(0, 2), rounds);
    expect(standings[0]!.playerId).toBe('p1');
    expect(standings[0]!.wins).toBe(1);
    expect(standings[1]!.wins).toBe(0);
  });

  it('marca el empate real cuando coinciden puntos y victorias', () => {
    const rounds = [
      {
        index: 0,
        game: 'quiz' as const,
        rows: [row('p1', 2), row('p2', 2)],
        points: { p1: 7, p2: 7 },
        finishedAt: 1,
      },
    ];
    const standings = computeStandings(PLAYERS.slice(0, 2), rounds);
    expect(standings.every((s) => s.rank === 1)).toBe(true);
    expect(standings.every((s) => s.tied)).toBe(true);
  });
});

describe('avance del torneo', () => {
  it('recorre las pruebas en orden y termina en la ultima', () => {
    const tournament = new Tournament({ games: ['quiz', 'darts', 'pool'], preset: 'clasico' });
    expect(tournament.currentGame).toBe('quiz');
    expect(tournament.roundNumber).toBe(1);

    tournament.recordResult(result('quiz', ['p1', 'p2']));
    expect(tournament.currentGame).toBe('darts');
    expect(tournament.finished).toBe(false);

    tournament.recordResult(result('darts', ['p1', 'p2']));
    expect(tournament.currentGame).toBe('pool');

    tournament.recordResult(result('pool', ['p2', 'p1']));
    expect(tournament.finished).toBe(true);
    expect(tournament.currentGame).toBeNull();
  });

  it('el resultado final usa los puntos acumulados como marcador', () => {
    const tournament = new Tournament({ games: ['quiz', 'darts', 'pool'], preset: 'clasico' });
    tournament.recordResult(result('quiz', ['p1', 'p2', 'p3']));
    tournament.recordResult(result('darts', ['p1', 'p3', 'p2']));
    tournament.recordResult(result('pool', ['p1', 'p2', 'p3']));

    const final = tournament.finalResult(PLAYERS);
    expect(final.winnerIds).toEqual(['p1']);
    expect(final.rows[0]!.score).toBe(30);
    expect(final.rows[0]!.detail).toContain('3 pruebas ganadas');
    expect(final.extra).toMatchObject({ tournament: true, rounds: 3 });
  });

  it('quien abandona desaparece de la general sin borrar el historial', () => {
    const tournament = new Tournament({ games: ['quiz', 'darts', 'pool'], preset: 'clasico' });
    tournament.recordResult(result('quiz', ['p3', 'p1', 'p2']));

    const restantes = PLAYERS.filter((player) => player.id !== 'p3');
    const state = tournament.publicState(restantes);
    expect(state.standings.map((s) => s.playerId)).toEqual(['p1', 'p2']);
    // La ronda jugada conserva a quien se fue.
    expect(state.rounds[0]!.points.p3).toBe(10);
  });
});

describe('validacion de la configuracion', () => {
  it('acepta entre tres y cinco pruebas distintas', () => {
    expect(isValidTournamentGames(['quiz', 'darts', 'pool'])).toBe(true);
    expect(isValidTournamentGames(['quiz', 'darts'])).toBe(false);
    expect(isValidTournamentGames(['quiz', 'darts', 'pool', 'golf', 'karts', 'tanks'])).toBe(false);
    expect(isValidTournamentGames(['quiz', 'darts', 'no-existe'])).toBe(false);
  });

  it('el esquema rechaza pruebas repetidas y tamanos invalidos', () => {
    const base = { enabled: true as const, preset: 'personalizado' as const };
    expect(
      tournamentModeSchema.safeParse({
        enabled: true,
        settings: { games: ['quiz', 'quiz', 'darts'], preset: base.preset },
      }).success,
    ).toBe(false);
    expect(
      tournamentModeSchema.safeParse({
        enabled: true,
        settings: { games: ['quiz', 'darts'], preset: base.preset },
      }).success,
    ).toBe(false);
    expect(
      tournamentModeSchema.safeParse({
        enabled: true,
        settings: { games: ['quiz', 'darts', 'pool'], preset: base.preset },
      }).success,
    ).toBe(true);
    expect(tournamentModeSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('los presets caben dentro de los limites', () => {
    // Presets publicados al cliente: si alguno se pasa de tamano, el lobby
    // ofreceria una configuracion que el servidor rechazaria.
    for (const preset of Object.values(TOURNAMENT_PRESETS)) {
      expect(preset.games.length).toBeGreaterThanOrEqual(TOURNAMENT_MIN_ROUNDS);
      expect(preset.games.length).toBeLessThanOrEqual(TOURNAMENT_MAX_ROUNDS);
      expect(new Set(preset.games).size).toBe(preset.games.length);
    }
  });
});
