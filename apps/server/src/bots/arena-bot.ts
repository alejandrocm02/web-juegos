import {
  ARENA,
  ARENA_OBSTACLES,
  type ArenaFighterState,
  type GameAction,
  type GamePublicState,
} from '@arcade/shared';
import { clamp, jitter, type BotBrain, type BotThinkContext } from './types.js';

/** Distancia a la que el bot prefiere quedarse dentro del borde de la zona. */
const ZONE_SAFETY = 46;

/**
 * Penalizacion (en unidades de distancia) por cada otro luchador que ya esta
 * encima de un rival. Evita que todos los bots se lancen a la vez a por el
 * mismo jugador, que es lo que hacia caer en segundos a quien no se movia.
 */
const CROWD_PENALTY = 220;

/** Radio en el que se considera que otro luchador ya esta peleando con un rival. */
const ENGAGED_RADIUS = ARENA.attackRange * 1.6;

/** Clave de memoria con el instante (matchMs) a partir del cual puede volver a atacar. */
const NEXT_ATTACK = 'nextAttackAtMs';

/**
 * Luchador automatico del battle royale.
 *
 * Prioridades, en orden: no morir por la tormenta, recoger un objeto util si
 * queda de camino y perseguir al rival mas cercano. Ataca cuando lo tiene
 * dentro del cono y respeta el enfriamiento igual que un humano.
 *
 * Mientras dura la gracia inicial de la zona no sale a cazar: recoge objetos y
 * solo se defiende si alguien se le pone al alcance. Asi quien entra por
 * primera vez tiene tiempo de aprender a moverse. Ademas, tras cada golpe
 * duda un tiempo que depende de la dificultad, y prefiere rivales que no
 * esten ya peleando con otro.
 */
export class ArenaBot implements BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[] {
    if (state.game !== 'arena' || state.phase !== 'fighting') return [];
    const me = state.fighters.find((entry) => entry.playerId === ctx.botId);
    if (!me?.alive) return [];

    const target = this.pickTarget(state.fighters, me);
    const targetDistance = target ? Math.hypot(target.x - me.x, target.y - me.y) : Infinity;
    // En la apertura solo pelea si el rival ya esta encima.
    const opening = state.matchMs < ARENA.zoneGraceMs;
    const hunting = target !== null && (!opening || targetDistance <= ARENA.attackRange * 1.2);
    const goal = this.chooseGoal(state, me, hunting ? target : null);

    let dx = goal.x - me.x;
    let dy = goal.y - me.y;
    const distance = Math.hypot(dx, dy) || 1;
    dx /= distance;
    dy /= distance;

    // Los obstaculos son circulos: si uno queda justo delante, se rodea.
    const avoid = this.avoidance(me, dx, dy);
    dx += avoid.x;
    dy += avoid.y;

    const noise = ctx.meta.noise * 0.6;
    dx += jitter(ctx.random, noise);
    dy += jitter(ctx.random, noise);
    const length = Math.hypot(dx, dy) || 1;

    // Se mira siempre al rival elegido: es lo que decide el cono de ataque.
    const facing = target
      ? Math.atan2(target.y - me.y, target.x - me.x) + jitter(ctx.random, ctx.meta.noise * 0.5)
      : Math.atan2(dy, dx);

    const readyAt = typeof ctx.memory[NEXT_ATTACK] === 'number' ? ctx.memory[NEXT_ATTACK] : 0;
    const wantsAttack =
      hunting &&
      targetDistance <= ARENA.attackRange * 0.92 &&
      me.attackCooldownMs <= 0 &&
      state.matchMs >= readyAt &&
      ctx.random() < 0.35 + ctx.meta.skill * 0.65;
    if (wantsAttack) {
      // Duda tras cada golpe: un bot facil deja casi 3 s entre ataques, uno
      // dificil apenas 1 s (el enfriamiento del arma es de 0,7 s para todos).
      const clumsiness = 1 - ctx.meta.skill;
      ctx.memory[NEXT_ATTACK] =
        state.matchMs +
        ARENA.attackCooldownMs +
        ctx.meta.reactionMs +
        clumsiness * 2600 +
        ctx.random() * clumsiness * 1400;
    }

    // Con poca vida el bot se retira en lugar de intercambiar golpes.
    const retreating = me.health < 30 && ctx.meta.skill > 0.5 && targetDistance < 120;
    const moveX = clamp((retreating ? -dx : dx) / length, -1, 1);
    const moveY = clamp((retreating ? -dy : dy) / length, -1, 1);

    return [
      {
        type: 'arena:input',
        moveX,
        moveY,
        facing,
        attack: wantsAttack,
      },
    ];
  }

  private pickTarget(
    fighters: ArenaFighterState[],
    me: ArenaFighterState,
  ): ArenaFighterState | null {
    let best: ArenaFighterState | null = null;
    let bestScore = Infinity;
    for (const fighter of fighters) {
      if (!fighter.alive || fighter.playerId === me.playerId) continue;
      if (fighter.team && me.team && fighter.team === me.team) continue;
      const distance = Math.hypot(fighter.x - me.x, fighter.y - me.y);
      // Quien ya tiene a otro encima es peor objetivo, salvo que este muy cerca.
      const crowd = fighters.filter(
        (other) =>
          other.alive &&
          other.playerId !== me.playerId &&
          other.playerId !== fighter.playerId &&
          Math.hypot(other.x - fighter.x, other.y - fighter.y) <= ENGAGED_RADIUS,
      ).length;
      const score = distance + (distance > ARENA.attackRange ? crowd * CROWD_PENALTY : 0);
      if (score < bestScore) {
        bestScore = score;
        best = fighter;
      }
    }
    return best;
  }

  private chooseGoal(
    state: Extract<GamePublicState, { game: 'arena' }>,
    me: ArenaFighterState,
    target: ArenaFighterState | null,
  ): { x: number; y: number } {
    const zone = state.zone;
    const toCenter = Math.hypot(zone.x - me.x, zone.y - me.y);

    // Fuera de la zona (o a punto de quedarse fuera) todo lo demas espera.
    if (toCenter > zone.radius - ZONE_SAFETY) return { x: zone.x, y: zone.y };

    if (me.health < 55) {
      const heal = state.pickups.find(
        (pickup) =>
          pickup.active &&
          (pickup.kind === 'botiquin' || pickup.kind === 'escudo') &&
          Math.hypot(pickup.x - zone.x, pickup.y - zone.y) < zone.radius - ZONE_SAFETY &&
          Math.hypot(pickup.x - me.x, pickup.y - me.y) < 260,
      );
      if (heal) return { x: heal.x, y: heal.y };
    }

    if (target) {
      const distance = Math.hypot(target.x - me.x, target.y - me.y);
      // Se para justo en el filo del alcance para no empujarse sin atacar.
      if (distance <= ARENA.attackRange * 0.75) return { x: me.x, y: me.y };
      return { x: target.x, y: target.y };
    }

    // Sin nadie a quien perseguir (o en la apertura) va a por el objeto mas cercano.
    let nearest: { x: number; y: number } | null = null;
    let nearestDistance = Infinity;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      if (Math.hypot(pickup.x - zone.x, pickup.y - zone.y) >= zone.radius - ZONE_SAFETY) continue;
      const distance = Math.hypot(pickup.x - me.x, pickup.y - me.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = pickup;
      }
    }
    return nearest ?? { x: zone.x, y: zone.y };
  }

  /** Vector de correccion para no encallar contra los obstaculos fijos. */
  private avoidance(me: ArenaFighterState, dx: number, dy: number): { x: number; y: number } {
    let ax = 0;
    let ay = 0;
    for (const obstacle of ARENA_OBSTACLES) {
      const ox = obstacle.x - me.x;
      const oy = obstacle.y - me.y;
      const distance = Math.hypot(ox, oy);
      const margin = obstacle.radius + ARENA.playerRadius + 26;
      if (distance > margin || distance === 0) continue;
      // Solo estorba si esta delante: producto escalar positivo.
      if ((ox * dx + oy * dy) / distance < 0.2) continue;
      ax -= (ox / distance) * (1 - distance / margin) * 1.4;
      ay -= (oy / distance) * (1 - distance / margin) * 1.4;
    }
    return { x: ax, y: ay };
  }
}
