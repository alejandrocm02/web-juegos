/** Billar casual por turnos, vista cenital. Unidades del mundo en centimetros. */

export const POOL_TABLE = {
  width: 254,
  height: 127,
  cushion: 6,
  ballRadius: 2.85,
  pocketRadius: 6.4,
} as const;

export const POOL_MAX_POWER = 1;
/** Velocidad maxima (cm/s) que puede imprimirse a la bola blanca. */
export const POOL_MAX_SPEED = 620;
/** Por debajo de esta velocidad (cm/s) una bola se considera detenida. */
export const POOL_STOP_SPEED = 2.5;

export const POOL_FRICTION: Record<'lenta' | 'normal' | 'rapida', number> = {
  lenta: 1.05,
  normal: 0.78,
  rapida: 0.52,
};

export interface PoolBallState {
  id: number;
  /** 0 es la bola blanca. */
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  pocketed: boolean;
}

export interface PoolSnapshot {
  balls: PoolBallState[];
  settled: boolean;
  tick: number;
}

export function poolPockets(): { x: number; y: number }[] {
  const { width, height } = POOL_TABLE;
  return [
    { x: 0, y: 0 },
    { x: width / 2, y: -1.5 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width / 2, y: height + 1.5 },
    { x: width, y: height },
  ];
}

/* ------------------------------- Bola 8 ---------------------------------- */

/**
 * Grupos de la bola 8. Las lisas son de la 1 a la 7, las rayadas de la 9 a la
 * 15 y la negra es la 8.
 */
export const EIGHT_BALL = {
  totalBalls: 15,
  blackId: 8,
  solids: [1, 2, 3, 4, 5, 6, 7],
  stripes: [9, 10, 11, 12, 13, 14, 15],
} as const;

export type PoolGroup = 'lisas' | 'rayadas';

export function groupOfBall(id: number): PoolGroup | 'negra' | null {
  if (id === EIGHT_BALL.blackId) return 'negra';
  if ((EIGHT_BALL.solids as readonly number[]).includes(id)) return 'lisas';
  if ((EIGHT_BALL.stripes as readonly number[]).includes(id)) return 'rayadas';
  return null;
}

export function ballsOfGroup(group: PoolGroup): readonly number[] {
  return group === 'lisas' ? EIGHT_BALL.solids : EIGHT_BALL.stripes;
}

export function otherGroup(group: PoolGroup): PoolGroup {
  return group === 'lisas' ? 'rayadas' : 'lisas';
}

/**
 * Resuelve un tiro de bola 8 y devuelve el nuevo estado de la partida.
 *
 * Reglas cubiertas: mesa abierta hasta la primera entrada limpia, asignacion de
 * grupo, obligacion de limpiar el grupo antes de la negra, derrota por meter la
 * negra antes de tiempo y falta por embocar la blanca.
 */
export interface EightBallResolution {
  /** Grupo asignado al tirador tras el tiro, si la mesa se cerro. */
  assignedGroup: PoolGroup | null;
  /** true si el tirador conserva el turno. */
  keepsTurn: boolean;
  /** Ganador de la partida, si el tiro la termina. */
  winner: 'shooter' | 'opponent' | null;
  foul: boolean;
  message: string;
}

export function resolveEightBallShot(options: {
  /** Grupo del tirador antes del tiro, o null si la mesa estaba abierta. */
  shooterGroup: PoolGroup | null;
  /** Bolas de color embocadas en este tiro. */
  pocketed: number[];
  cuePocketed: boolean;
  /** Bolas del grupo del tirador que seguian en mesa antes del tiro. */
  remainingOwnBefore: number;
}): EightBallResolution {
  const { shooterGroup, pocketed, cuePocketed, remainingOwnBefore } = options;
  const blackPotted = pocketed.includes(EIGHT_BALL.blackId);
  const colored = pocketed.filter((id) => id !== EIGHT_BALL.blackId);

  if (blackPotted) {
    // La negra solo vale si ya se limpio el grupo propio y sin falta.
    const ownCleared =
      shooterGroup !== null && remainingOwnBefore - countOwn(colored, shooterGroup) <= 0;
    if (ownCleared && !cuePocketed) {
      return {
        assignedGroup: shooterGroup,
        keepsTurn: false,
        winner: 'shooter',
        foul: false,
        message: 'Negra embocada: partida ganada',
      };
    }
    return {
      assignedGroup: shooterGroup,
      keepsTurn: false,
      winner: 'opponent',
      foul: true,
      message: 'Negra embocada antes de tiempo: derrota',
    };
  }

  let group = shooterGroup;
  let assigned: PoolGroup | null = null;
  if (group === null && colored.length > 0 && !cuePocketed) {
    const groups = new Set(colored.map((id) => groupOfBall(id)));
    // Si entran bolas de los dos grupos, la mesa sigue abierta.
    if (groups.size === 1) {
      const only = [...groups][0];
      if (only === 'lisas' || only === 'rayadas') {
        group = only;
        assigned = only;
      }
    }
  }

  if (cuePocketed) {
    return {
      assignedGroup: assigned,
      keepsTurn: false,
      winner: null,
      foul: true,
      message: 'Blanca embocada: falta y cambio de turno',
    };
  }

  const ownPotted = group ? countOwn(colored, group) : 0;
  return {
    assignedGroup: assigned,
    keepsTurn: ownPotted > 0,
    winner: null,
    foul: false,
    message:
      ownPotted > 0
        ? 'Sigues tirando: ' + ownPotted + ' bola(s) de tu grupo'
        : colored.length > 0
          ? 'Bola del grupo contrario: cambio de turno'
          : 'Sin bolas embocadas: cambio de turno',
  };
}

function countOwn(pocketed: number[], group: PoolGroup): number {
  const own = ballsOfGroup(group);
  return pocketed.filter((id) => own.includes(id)).length;
}
