/**
 * Cricket de dardos: reglas completas.
 *
 * Se juegan los numeros 15 a 20 y el bull. Cada jugador necesita tres marcas
 * para "cerrar" un numero; a partir de ahi, mientras algun rival no lo tenga
 * cerrado, los impactos suman puntos. Un numero cerrado por todos queda muerto.
 *
 * Las reglas viven aqui, en el paquete compartido, para que el servidor las
 * aplique y el cliente pinte el mismo marcador sin duplicar logica.
 */
import type { DartThrow } from './darts.js';

/** Numeros en juego, del mas bajo al mas alto. El 25 es el bull. */
export const CRICKET_NUMBERS = [15, 16, 17, 18, 19, 20, 25] as const;
export type CricketNumber = (typeof CRICKET_NUMBERS)[number];

export const CRICKET_MARKS_TO_CLOSE = 3;

/** Marcas por numero de un jugador. Se topan en 3: lo que sobra puntua. */
export type CricketMarks = Record<number, number>;

export interface CricketPlayerState {
  marks: CricketMarks;
  score: number;
}

export type CricketBoard = Record<string, CricketPlayerState>;

export function createCricketBoard(playerIds: string[]): CricketBoard {
  const board: CricketBoard = {};
  for (const id of playerIds) {
    const marks: CricketMarks = {};
    for (const number of CRICKET_NUMBERS) marks[number] = 0;
    board[id] = { marks, score: 0 };
  }
  return board;
}

/** Cuantas marcas vale un impacto: simple 1, doble 2, triple 3. */
export function marksForThrow(dart: DartThrow): { number: CricketNumber | null; marks: number } {
  const isCricketNumber = (CRICKET_NUMBERS as readonly number[]).includes(dart.sector);
  if (!isCricketNumber) return { number: null, marks: 0 };

  if (dart.ring === 'bullseye') return { number: 25, marks: 2 };
  if (dart.ring === 'bull') return { number: 25, marks: 1 };
  if (dart.ring === 'triple') return { number: dart.sector as CricketNumber, marks: 3 };
  if (dart.ring === 'double') return { number: dart.sector as CricketNumber, marks: 2 };
  if (dart.ring === 'single') return { number: dart.sector as CricketNumber, marks: 1 };
  return { number: null, marks: 0 };
}

export function hasClosed(board: CricketBoard, playerId: string, number: number): boolean {
  return (board[playerId]?.marks[number] ?? 0) >= CRICKET_MARKS_TO_CLOSE;
}

/** Un numero esta muerto cuando todos los jugadores lo han cerrado. */
export function isNumberDead(board: CricketBoard, number: number): boolean {
  const ids = Object.keys(board);
  if (ids.length === 0) return false;
  return ids.every((id) => hasClosed(board, id, number));
}

export interface CricketThrowResult {
  /** Marcas nuevas anotadas en el numero. */
  marksAdded: number;
  /** Puntos sumados por impactos por encima del cierre. */
  pointsAdded: number;
  closed: boolean;
  number: CricketNumber | null;
}

/**
 * Aplica un dardo al marcador y devuelve lo que ha cambiado.
 *
 * El orden importa: primero se completan las marcas que faltan para cerrar y
 * solo el excedente puntua, y unicamente si algun rival sigue sin cerrar.
 */
export function applyCricketThrow(
  board: CricketBoard,
  playerId: string,
  dart: DartThrow,
): CricketThrowResult {
  const { number, marks } = marksForThrow(dart);
  const player = board[playerId];
  if (!number || marks === 0 || !player) {
    return { marksAdded: 0, pointsAdded: 0, closed: false, number: null };
  }

  const current = player.marks[number] ?? 0;
  const missing = Math.max(0, CRICKET_MARKS_TO_CLOSE - current);
  const marksAdded = Math.min(missing, marks);
  const surplus = marks - marksAdded;
  player.marks[number] = current + marksAdded;

  let pointsAdded = 0;
  if (surplus > 0) {
    // Solo puntua si al menos un rival no ha cerrado ese numero.
    const someoneOpen = Object.keys(board).some(
      (id) => id !== playerId && !hasClosed(board, id, number),
    );
    if (someoneOpen) {
      pointsAdded = surplus * number;
      player.score += pointsAdded;
    }
  }

  return {
    marksAdded,
    pointsAdded,
    closed: (player.marks[number] ?? 0) >= CRICKET_MARKS_TO_CLOSE,
    number,
  };
}

export function hasClosedEverything(board: CricketBoard, playerId: string): boolean {
  return CRICKET_NUMBERS.every((number) => hasClosed(board, playerId, number));
}

/**
 * Ganador del cricket, o null si la partida sigue.
 * Hay que cerrar todos los numeros y no ir por detras en puntos.
 */
export function cricketWinner(board: CricketBoard): string | null {
  const ids = Object.keys(board);
  for (const id of ids) {
    if (!hasClosedEverything(board, id)) continue;
    const own = board[id]!.score;
    const best = Math.max(
      ...ids.filter((other) => other !== id).map((other) => board[other]!.score),
    );
    if (own >= best) return id;
  }
  return null;
}
