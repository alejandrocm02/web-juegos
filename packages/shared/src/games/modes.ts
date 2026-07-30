/**
 * Catalogo de modos de juego.
 *
 * Vive en el paquete compartido para que cliente y servidor manejen exactamente
 * la misma lista: el lobby dibuja las opciones desde aqui y el servidor valida
 * contra la misma fuente, sin duplicar literales en ningun lado.
 */
import type { GameId } from '../constants.js';

export const QUIZ_MODES = ['clasico', 'rapido', 'eliminacion', 'equipos'] as const;
export const DARTS_MODES = ['301', '501', 'libre', 'cricket'] as const;
export const POOL_MODES = ['clasico', 'rapido', 'equipos'] as const;
export const GOLF_MODES = ['clasico', 'menos-golpes', 'contrarreloj'] as const;
export const BOWLING_MODES = ['individual', 'corta', 'equipos'] as const;

export type QuizMode = (typeof QUIZ_MODES)[number];
export type DartsMode = (typeof DARTS_MODES)[number];
export type PoolMode = (typeof POOL_MODES)[number];
export type GolfMode = (typeof GOLF_MODES)[number];
export type BowlingMode = (typeof BOWLING_MODES)[number];

export interface GameModeInfo {
  id: string;
  name: string;
  /** Frase corta que se muestra bajo el nombre en el selector del lobby. */
  summary: string;
  /** Regla concreta que cambia respecto al modo clasico. */
  rule: string;
  /** true si el modo reparte a los jugadores en dos equipos. */
  teams?: boolean;
}

export const GAME_MODE_CATALOG: Record<GameId, GameModeInfo[]> = {
  quiz: [
    {
      id: 'clasico',
      name: 'Clasico',
      summary: 'Todas las preguntas, puntos por acierto',
      rule: 'Gana quien mas puntos acumule al terminar las preguntas.',
    },
    {
      id: 'rapido',
      name: 'Rapido',
      summary: 'La mitad de tiempo y el doble de bonus',
      rule: 'El tiempo por pregunta se reduce a la mitad y la bonificacion por rapidez se duplica.',
    },
    {
      id: 'eliminacion',
      name: 'Eliminacion',
      summary: 'Fallar te deja fuera',
      rule: 'Quien falla o no contesta queda eliminado. Gana el ultimo en pie.',
    },
    {
      id: 'equipos',
      name: 'Equipos',
      summary: 'Rojo contra azul',
      rule: 'Los puntos se suman por equipo. Gana el equipo con mas puntos.',
      teams: true,
    },
  ],
  darts: [
    {
      id: '301',
      name: '301',
      summary: 'Bajar de 301 a cero exacto',
      rule: 'Pasarse es bust y se recupera la puntuacion del inicio del turno.',
    },
    {
      id: '501',
      name: '501',
      summary: 'Partida larga desde 501',
      rule: 'Mismas reglas que el 301 pero empezando en 501.',
    },
    {
      id: 'libre',
      name: 'Puntuacion libre',
      summary: 'Ocho turnos sumando puntos',
      rule: 'Sin objetivo que cerrar: gana quien mas puntos sume en ocho turnos.',
    },
    {
      id: 'cricket',
      name: 'Cricket',
      summary: 'Cierra del 15 al 20 y el bull',
      rule: 'Tres impactos cierran un numero. Con el numero abierto y algun rival sin cerrarlo se suman puntos. Gana quien cierre todo con ventaja.',
    },
  ],
  pool: [
    {
      id: 'clasico',
      name: 'Clasico',
      summary: 'Hasta vaciar la mesa',
      rule: 'Cada bola de color suma uno, la blanca resta uno. Termina al no quedar bolas.',
    },
    {
      id: 'rapido',
      name: 'Rapido',
      summary: 'El primero en llegar a tres',
      rule: 'La partida termina en cuanto alguien alcanza tres puntos.',
    },
    {
      id: 'equipos',
      name: 'Equipos',
      summary: 'Rojo contra azul, turnos alternos',
      rule: 'Los puntos se suman al equipo del jugador que tira.',
      teams: true,
    },
  ],
  golf: [
    {
      id: 'clasico',
      name: 'Clasico',
      summary: 'Los diez hoyos completos',
      rule: 'Gana quien acumule menos golpes en el recorrido.',
    },
    {
      id: 'menos-golpes',
      name: 'Menos golpes',
      summary: 'Recorrido corto de cinco hoyos',
      rule: 'Solo se juegan los cinco primeros hoyos, con la mitad de golpes permitidos.',
    },
    {
      id: 'contrarreloj',
      name: 'Contrarreloj',
      summary: 'Tiempo ajustado por hoyo',
      rule: 'El tiempo por hoyo baja a 45 segundos y el desempate es por tiempo total.',
    },
  ],
  bowling: [
    {
      id: 'individual',
      name: 'Individual',
      summary: 'Diez frames por jugador',
      rule: 'Partida completa con strikes, spares y el decimo frame ampliado.',
    },
    {
      id: 'corta',
      name: 'Corta',
      summary: 'Cinco frames',
      rule: 'Misma puntuacion pero la partida termina en el quinto frame.',
    },
    {
      id: 'equipos',
      name: 'Equipos',
      summary: 'Rojo contra azul',
      rule: 'Se suman los frames de cada equipo. Gana el equipo con mas bolos derribados.',
      teams: true,
    },
  ],
};

export function getModeInfo(game: GameId, modeId: string): GameModeInfo | undefined {
  return GAME_MODE_CATALOG[game].find((mode) => mode.id === modeId);
}

/** true si el modo indicado reparte a los jugadores en equipos. */
export function isTeamMode(game: GameId, modeId: string): boolean {
  return getModeInfo(game, modeId)?.teams === true;
}

export const TEAM_IDS = ['rojo', 'azul'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const TEAM_META: Record<TeamId, { name: string; color: string }> = {
  rojo: { name: 'Equipo Rojo', color: '#ff3b47' },
  azul: { name: 'Equipo Azul', color: '#3b82f6' },
};

/** Reparte a los jugadores en equipos alternos de forma estable por orden de entrada. */
export function assignTeams(playerIds: string[]): Record<string, TeamId> {
  const teams: Record<string, TeamId> = {};
  playerIds.forEach((id, index) => {
    teams[id] = TEAM_IDS[index % TEAM_IDS.length]!;
  });
  return teams;
}
