/**
 * Bolos: geometria de la pista, colocacion de los bolos y sistema de puntuacion.
 *
 * La puntuacion vive aqui, en el paquete compartido, para que el servidor la
 * calcule y el cliente pueda mostrar exactamente los mismos frames sin duplicar
 * las reglas. Medidas en centimetros, aproximadas a una pista real.
 */

export const BOWLING_LANE = {
  /** Ancho jugable de la pista. */
  width: 105,
  /** Distancia desde la linea de falta hasta el bolo delantero. */
  length: 1800,
  ballRadius: 10.9,
  pinRadius: 6,
  /** Separacion entre bolos contiguos. */
  pinSpacing: 30.5,
  /** Un bolo cuenta como derribado si se desplaza mas que esto. */
  knockDistance: 9,
  /** Velocidad maxima de lanzamiento (cm/s). */
  maxSpeed: 900,
  gutterWidth: 12,
} as const;

export const BOWLING_TOTAL_FRAMES = 10;
export const BOWLING_SHORT_FRAMES = 5;
export const BOWLING_PINS = 10;

/** Desviacion aleatoria que aplica el servidor segun la precision elegida. */
export const BOWLING_SPREAD: Record<'facil' | 'normal' | 'dificil', number> = {
  facil: 0.012,
  normal: 0.03,
  dificil: 0.055,
};

export interface BowlingPinState {
  id: number;
  x: number;
  y: number;
  standing: boolean;
}

export interface BowlingBallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rolling: boolean;
  gutter: boolean;
}

export interface BowlingSnapshot {
  tick: number;
  ball: BowlingBallState;
  pins: BowlingPinState[];
  settled: boolean;
}

/**
 * Posicion de los diez bolos en formacion triangular.
 * El bolo 1 queda al fondo y las filas crecen hacia el jugador.
 */
export function bowlingPinLayout(): { id: number; x: number; y: number }[] {
  const { width, length, pinSpacing } = BOWLING_LANE;
  const centerX = width / 2;
  const pins: { id: number; x: number; y: number }[] = [];
  let id = 1;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      pins.push({
        id: id++,
        x: centerX + (i - row / 2) * pinSpacing,
        y: length - row * pinSpacing * 0.87,
      });
    }
  }
  return pins;
}

export interface BowlingFrame {
  /** Bolos derribados en cada lanzamiento del frame. */
  rolls: number[];
  strike: boolean;
  spare: boolean;
  /** Puntuacion acumulada hasta este frame, o null si aun depende de tiradas futuras. */
  score: number | null;
}

export interface BowlingScorecard {
  frames: BowlingFrame[];
  total: number;
  /** Frame en curso (base 0). Igual a totalFrames cuando la partida termino. */
  currentFrame: number;
  /** Lanzamiento dentro del frame actual. */
  currentRoll: number;
  finished: boolean;
}

/**
 * Calcula la tarjeta completa a partir de la lista plana de lanzamientos.
 *
 * Aplica las reglas estandar: un strike suma diez mas los dos lanzamientos
 * siguientes, un spare suma diez mas el siguiente, y el ultimo frame permite un
 * tercer lanzamiento si se consigue strike o spare.
 */
export function scoreBowling(
  rolls: number[],
  totalFrames = BOWLING_TOTAL_FRAMES,
): BowlingScorecard {
  const frames: BowlingFrame[] = [];
  let index = 0;
  let running = 0;
  let pending = false;

  for (let frame = 0; frame < totalFrames; frame++) {
    const isLast = frame === totalFrames - 1;
    const frameRolls: number[] = [];
    let strike = false;
    let spare = false;

    if (index >= rolls.length) {
      frames.push({ rolls: [], strike: false, spare: false, score: null });
      continue;
    }

    const first = rolls[index];
    if (first === undefined) {
      frames.push({ rolls: [], strike: false, spare: false, score: null });
      continue;
    }
    frameRolls.push(first);
    index += 1;

    if (first === BOWLING_PINS) {
      strike = true;
      if (isLast) {
        for (let extra = 0; extra < 2; extra++) {
          const value = rolls[index];
          if (value === undefined) break;
          frameRolls.push(value);
          index += 1;
        }
      }
    } else {
      const second = rolls[index];
      if (second !== undefined) {
        frameRolls.push(second);
        index += 1;
        if (first + second === BOWLING_PINS) {
          spare = true;
          if (isLast) {
            const third = rolls[index];
            if (third !== undefined) {
              frameRolls.push(third);
              index += 1;
            }
          }
        }
      }
    }

    // Bonificaciones: se miran los lanzamientos siguientes de la lista plana.
    let frameScore: number | null = null;
    if (isLast) {
      const complete =
        (strike && frameRolls.length === 3) ||
        (spare && frameRolls.length === 3) ||
        (!strike && !spare && frameRolls.length === 2);
      if (complete) frameScore = frameRolls.reduce((sum, value) => sum + value, 0);
    } else if (strike) {
      const bonus = rolls.slice(index, index + 2);
      if (bonus.length === 2) frameScore = BOWLING_PINS + bonus[0]! + bonus[1]!;
    } else if (spare) {
      const bonus = rolls[index];
      if (bonus !== undefined) frameScore = BOWLING_PINS + bonus;
    } else if (frameRolls.length === 2) {
      frameScore = frameRolls[0]! + frameRolls[1]!;
    }

    if (frameScore === null || pending) {
      if (frameScore === null) pending = true;
      frames.push({ rolls: frameRolls, strike, spare, score: null });
    } else {
      running += frameScore;
      frames.push({ rolls: frameRolls, strike, spare, score: running });
    }
  }

  const total = frames.reduce<number>((sum, frame) => {
    const frameSum = frame.rolls.reduce((acc, value) => acc + value, 0);
    return sum + frameSum;
  }, 0);

  // El total con bonificaciones se recalcula recorriendo la lista plana.
  const totalWithBonus = flatTotal(rolls, totalFrames);

  const { currentFrame, currentRoll, finished } = cursor(rolls, totalFrames);
  return {
    frames,
    total: finished || totalWithBonus > 0 ? totalWithBonus : total,
    currentFrame,
    currentRoll,
    finished,
  };
}

function flatTotal(rolls: number[], totalFrames: number): number {
  let index = 0;
  let total = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    const first = rolls[index];
    if (first === undefined) break;
    if (first === BOWLING_PINS) {
      total += BOWLING_PINS + (rolls[index + 1] ?? 0) + (rolls[index + 2] ?? 0);
      index += frame === totalFrames - 1 ? 3 : 1;
    } else {
      const second = rolls[index + 1] ?? 0;
      if (first + second === BOWLING_PINS) {
        total += BOWLING_PINS + (rolls[index + 2] ?? 0);
        index += frame === totalFrames - 1 ? 3 : 2;
      } else {
        total += first + second;
        index += 2;
      }
    }
  }
  return total;
}

/** Devuelve en que frame y lanzamiento esta el jugador tras las tiradas dadas. */
function cursor(
  rolls: number[],
  totalFrames: number,
): { currentFrame: number; currentRoll: number; finished: boolean } {
  let index = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    const isLast = frame === totalFrames - 1;
    const first = rolls[index];
    if (first === undefined) return { currentFrame: frame, currentRoll: 0, finished: false };

    if (isLast) {
      const used = rolls.length - index;
      const openTenth = first === BOWLING_PINS || (rolls[index + 1] ?? 0) + first === BOWLING_PINS;
      const needed = openTenth ? 3 : 2;
      if (used >= needed) return { currentFrame: totalFrames, currentRoll: 0, finished: true };
      return { currentFrame: frame, currentRoll: used, finished: false };
    }

    if (first === BOWLING_PINS) {
      index += 1;
      continue;
    }
    const second = rolls[index + 1];
    if (second === undefined) return { currentFrame: frame, currentRoll: 1, finished: false };
    index += 2;
  }
  return { currentFrame: totalFrames, currentRoll: 0, finished: true };
}

/** Bolos que siguen en pie al empezar un lanzamiento del frame actual. */
export function pinsRemaining(frameRolls: number[]): number {
  if (frameRolls.length === 0) return BOWLING_PINS;
  const knocked = frameRolls.reduce((sum, value) => sum + value, 0);
  return knocked >= BOWLING_PINS ? BOWLING_PINS : BOWLING_PINS - knocked;
}
