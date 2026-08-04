import {
  TANK_FIELD,
  type GameAction,
  type GamePublicState,
  type TankObstacle,
  type TankState,
} from '@arcade/shared';
import { clamp, jitter, type BotBrain, type BotThinkContext } from './types.js';

/** Constantes de la balistica del simulador. Deben coincidir con TanksWorld. */
const PROJECTILE_BASE_SPEED = 370;
const PROJECTILE_POWER_SPEED = 420;
const GRAVITY = 350;
const WIND_ACCEL = 58;
const SIM_DT = 1 / 60;
const MAX_FLIGHT_STEPS = 900;

const ANGLE_MIN = -Math.PI + 0.12;
const ANGLE_MAX = -0.12;

/**
 * Artillero automatico.
 *
 * En vez de resolver la parabola de forma analitica (que se rompe en cuanto
 * entran el viento, los obstaculos y los rebotes), el bot simula el disparo con
 * las mismas ecuaciones que el servidor y busca en una rejilla de angulo y
 * potencia el tiro que cae mas cerca del objetivo. Es barato porque solo ocurre
 * una vez por turno, y con la dificultad se degrada a proposito: se estrecha la
 * busqueda y se añade error al resultado.
 */
export class TanksBot implements BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[] {
    if (state.game !== 'tanks') return [];
    if (state.phase !== 'aiming' || state.activePlayerId !== ctx.botId) {
      // Al salir del turno se olvida el disparo hecho para el siguiente.
      if (state.phase !== 'aiming') ctx.memory.firedTurn = null;
      return [];
    }

    // Un disparo por turno: el numero de turno hace de identificador.
    if (ctx.memory.firedTurn === state.turnNumber) return [];

    // Pausa antes de disparar para que el turno se vea, no salga instantaneo.
    const delay = 700 + ctx.meta.reactionMs * 2;
    if (typeof ctx.memory.turnSeenAt !== 'number' || ctx.memory.aimingTurn !== state.turnNumber) {
      ctx.memory.aimingTurn = state.turnNumber;
      ctx.memory.turnSeenAt = ctx.now;
      return [];
    }
    if (ctx.now - ctx.memory.turnSeenAt < delay) return [];

    const me = state.tanks.find((tank) => tank.playerId === ctx.botId);
    if (!me?.alive) return [];
    const target = this.pickTarget(state.tanks, me);
    if (!target) return [];

    const solution = this.solve(me, target, state.wind, state.obstacles, ctx);
    ctx.memory.firedTurn = state.turnNumber;

    return [{ type: 'tanks:fire', angle: solution.angle, power: solution.power }];
  }

  private pickTarget(tanks: TankState[], me: TankState): TankState | null {
    let best: TankState | null = null;
    let bestScore = Infinity;
    for (const tank of tanks) {
      if (!tank.alive || tank.playerId === me.playerId) continue;
      // Se prefiere al mas debil y, a igualdad, al mas cercano.
      const score = tank.health * 4 + Math.abs(tank.x - me.x) * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = tank;
      }
    }
    return best;
  }

  /** Busqueda en rejilla del par (angulo, potencia) que menos falla. */
  private solve(
    me: TankState,
    target: TankState,
    wind: number,
    obstacles: TankObstacle[],
    ctx: BotThinkContext,
  ): { angle: number; power: number } {
    const towardsRight = target.x > me.x;
    // Solo se prueban angulos hacia el lado del objetivo: media rejilla menos.
    const lowAngle = towardsRight ? -1.45 : ANGLE_MIN;
    const highAngle = towardsRight ? ANGLE_MAX : -1.69;
    const angleSteps = 26;
    const powerSteps = 18;

    let bestAngle = towardsRight ? -Math.PI / 4 : (-3 * Math.PI) / 4;
    let bestPower = 0.68;
    let bestError = Infinity;

    for (let a = 0; a < angleSteps; a += 1) {
      const angle = clamp(
        lowAngle + ((highAngle - lowAngle) * a) / (angleSteps - 1),
        ANGLE_MIN,
        ANGLE_MAX,
      );
      for (let p = 0; p < powerSteps; p += 1) {
        const power = 0.2 + (0.8 * p) / (powerSteps - 1);
        const error = this.simulateError(me, target, angle, power, wind, obstacles);
        if (error < bestError) {
          bestError = error;
          bestAngle = angle;
          bestPower = power;
        }
      }
    }

    // La dificultad estropea el tiro perfecto de forma controlada.
    const angleNoise = ctx.meta.noise * 0.22;
    const powerNoise = ctx.meta.noise * 0.16;
    return {
      angle: clamp(bestAngle + jitter(ctx.random, angleNoise), ANGLE_MIN, ANGLE_MAX),
      power: clamp(bestPower + jitter(ctx.random, powerNoise), 0.2, 1),
    };
  }

  /**
   * Distancia minima del proyectil al objetivo.
   *
   * Reproduce la integracion del motor: gravedad constante, empuje del viento y
   * parada al tocar el suelo, un obstaculo o salir del campo. Un impacto en un
   * obstaculo penaliza para que el bot no se dispare contra su propia cobertura.
   */
  private simulateError(
    me: TankState,
    target: TankState,
    angle: number,
    power: number,
    wind: number,
    obstacles: TankObstacle[],
  ): number {
    const speed = PROJECTILE_BASE_SPEED + power * PROJECTILE_POWER_SPEED;
    let x = me.x + Math.cos(angle) * 42;
    let y = me.y - 9 + Math.sin(angle) * 42;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let closest = Infinity;

    for (let step = 0; step < MAX_FLIGHT_STEPS; step += 1) {
      vx += wind * WIND_ACCEL * SIM_DT;
      vy += GRAVITY * SIM_DT;
      x += vx * SIM_DT;
      y += vy * SIM_DT;

      const distance = Math.hypot(x - target.x, y - target.y);
      if (distance < closest) closest = distance;
      if (distance < TANK_FIELD.explosionRadius * 0.4) return distance;

      if (y + TANK_FIELD.projectileRadius >= TANK_FIELD.groundY) {
        return Math.min(closest, Math.hypot(x - target.x, TANK_FIELD.groundY - target.y));
      }
      if (x < -60 || x > TANK_FIELD.width + 60) return closest + 400;
      if (y > TANK_FIELD.height + 80 || y < -420) return closest + 400;

      // `x` e `y` de un obstaculo son su esquina superior izquierda, igual que
      // en la comprobacion de colision del motor.
      for (const obstacle of obstacles) {
        const closestX = clamp(x, obstacle.x, obstacle.x + obstacle.width);
        const closestY = clamp(y, obstacle.y, obstacle.y + obstacle.height);
        if (Math.hypot(x - closestX, y - closestY) <= TANK_FIELD.projectileRadius) {
          return closest + 220;
        }
      }
    }
    return closest;
  }
}
