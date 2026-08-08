import {
  computeStandings,
  pointsFromResult,
  type GameId,
  type MatchResult,
  type TournamentPublicState,
  type TournamentRound,
  type TournamentSettings,
} from '@arcade/shared';

/**
 * Estado de un torneo dentro de una sala.
 *
 * Vive aparte de `Room` a proposito: la sala sigue sabiendo unicamente lanzar
 * una partida y recoger su resultado, y el torneo se limita a decidir cual es
 * la siguiente y a llevar la cuenta. Asi ningun juego se entera de que esta
 * dentro de un torneo, y anadir un juego nuevo no obliga a tocar nada de aqui.
 */
export class Tournament {
  private readonly rounds: TournamentRound[] = [];
  private index = 0;

  constructor(readonly settings: TournamentSettings) {}

  /** Prueba que toca jugar ahora, o `null` si ya han terminado todas. */
  get currentGame(): GameId | null {
    return this.settings.games[this.index] ?? null;
  }

  get finished(): boolean {
    return this.index >= this.settings.games.length;
  }

  /** Numero de prueba en curso, empezando por 1. Solo para mensajes. */
  get roundNumber(): number {
    return Math.min(this.index + 1, this.settings.games.length);
  }

  get totalRounds(): number {
    return this.settings.games.length;
  }

  /**
   * Registra el resultado de una prueba y avanza a la siguiente.
   *
   * Devuelve la ronda anotada para que la sala pueda avisar de cuantos puntos
   * ha repartido sin recalcular nada.
   */
  recordResult(result: MatchResult): TournamentRound {
    const round: TournamentRound = {
      index: this.index,
      game: result.game,
      rows: result.rows,
      points: pointsFromResult(result),
      finishedAt: result.finishedAt,
    };
    this.rounds.push(round);
    this.index += 1;
    return round;
  }

  /**
   * Retira a un jugador que ha abandonado.
   *
   * Sus puntos se quedan en las rondas ya jugadas (el historial no se reescribe)
   * pero deja de aparecer en la clasificacion, que se calcula sobre los
   * jugadores presentes.
   */
  publicState(players: { id: string; name: string; color: string }[]): TournamentPublicState {
    return {
      games: this.settings.games,
      currentIndex: this.index,
      rounds: this.rounds,
      standings: computeStandings(players, this.rounds),
      finished: this.finished,
    };
  }

  /**
   * Clasificacion final convertida al formato de resultado de partida.
   *
   * Reutilizar `MatchResult` permite que la pantalla de resultados y la
   * persistencia funcionen sin cambios: para ellas, un torneo es una partida
   * mas cuyo marcador son los puntos acumulados.
   */
  finalResult(players: { id: string; name: string; color: string; icon: string }[]): MatchResult {
    const standings = computeStandings(players, this.rounds);
    const byId = new Map(players.map((player) => [player.id, player]));
    return {
      // El torneo se archiva bajo la ultima prueba jugada para no inventar un
      // identificador de juego que el resto del sistema no conoce.
      game: this.settings.games[this.settings.games.length - 1] ?? 'quiz',
      rows: standings.map((standing) => ({
        playerId: standing.playerId,
        name: standing.name,
        color: standing.color,
        icon: (byId.get(standing.playerId)?.icon ??
          'circle') as MatchResult['rows'][number]['icon'],
        score: standing.points,
        detail:
          standing.points +
          ' pts · ' +
          standing.wins +
          (standing.wins === 1 ? ' prueba ganada' : ' pruebas ganadas'),
        rank: standing.rank,
        tied: standing.tied,
      })),
      winnerIds: standings.filter((standing) => standing.rank === 1).map((s) => s.playerId),
      finishedAt: Date.now(),
      extra: { tournament: true, rounds: this.rounds.length },
    };
  }
}
