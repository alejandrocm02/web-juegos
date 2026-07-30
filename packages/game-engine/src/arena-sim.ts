import {
  ARENA,
  ARENA_BUFF_MS,
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_HEAL_AMOUNT,
  ARENA_OBSTACLES,
  ARENA_PICKUP_KINDS,
  ARENA_SHIELD_AMOUNT,
  ARENA_SPEED_MULTIPLIER,
  PHYSICS_DT,
  arenaSpawnPoints,
  createRng,
  zoneRadiusAt,
  type ArenaFighterState,
  type ArenaInput,
  type ArenaPickup,
  type ArenaSnapshot,
} from '@arcade/shared';

interface Fighter extends ArenaFighterState {
  /** Momento en que fue eliminado, para ordenar la clasificacion. */
  eliminatedAtMs: number | null;
}

export interface ArenaEvent {
  kind: 'hit' | 'kill' | 'pickup' | 'storm';
  playerId: string;
  /** Rival implicado, cuando aplica. */
  targetId?: string;
  amount?: number;
  atMs: number;
}

/**
 * Simulacion de la arena.
 *
 * Es la unica fuente de verdad: el cliente envia intencion de movimiento y
 * ataque, y aqui se decide el dano, si una posicion es valida, quien queda
 * eliminado y quien gana. Paso fijo para que sea reproducible.
 */
export class ArenaWorld {
  private fighters = new Map<string, Fighter>();
  private inputs = new Map<string, ArenaInput>();
  private pickupList: ArenaPickup[] = [];
  private pickupTimers = new Map<number, number>();
  private events: ArenaEvent[] = [];
  private rng: () => number;
  private nextPlacement = 0;

  matchMs = 0;
  tick = 0;
  running = false;

  constructor(
    playerIds: string[],
    teams: Record<string, string> = {},
    seed = 1,
    /** Multiplicador del tiempo de cierre de la zona. */
    private readonly zonePaceScale = 1,
  ) {
    this.rng = createRng(seed);
    const spawns = arenaSpawnPoints(playerIds.length);
    playerIds.forEach((id, index) => {
      const spawn = spawns[index]!;
      this.fighters.set(id, {
        playerId: id,
        x: spawn.x,
        y: spawn.y,
        facing: spawn.facing,
        health: ARENA.maxHealth,
        shield: 0,
        alive: true,
        placement: null,
        kills: 0,
        attackCooldownMs: 0,
        speedBuffMs: 0,
        damageBuffMs: 0,
        inStorm: false,
        team: teams[id],
        eliminatedAtMs: null,
      });
    });
    this.nextPlacement = playerIds.length;
    this.spawnPickups();
  }

  private spawnPickups(): void {
    this.pickupList = [];
    for (let i = 0; i < ARENA.pickupCount; i++) {
      this.pickupList.push({ id: i, ...this.randomPickupSpot(), active: true });
    }
  }

  /** Busca un punto libre de obstaculos dentro de la zona inicial. */
  private randomPickupSpot(): { kind: ArenaPickup['kind']; x: number; y: number } {
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const distance = this.rng() * (ARENA.zoneStartRadius * 0.72);
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const blocked = ARENA_OBSTACLES.some(
        (obstacle) =>
          Math.hypot(obstacle.x - x, obstacle.y - y) < obstacle.radius + ARENA.pickupRadius + 6,
      );
      if (blocked) continue;
      const kind = ARENA_PICKUP_KINDS[Math.floor(this.rng() * ARENA_PICKUP_KINDS.length)]!;
      return { kind, x: round(x), y: round(y) };
    }
    return { kind: 'botiquin', x: cx, y: cy };
  }

  get zone() {
    return {
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      radius: round(zoneRadiusAt(this.matchMs, this.zonePaceScale)),
    };
  }

  get states(): ArenaFighterState[] {
    return [...this.fighters.values()].map((fighter) => ({
      playerId: fighter.playerId,
      x: round(fighter.x),
      y: round(fighter.y),
      facing: round(fighter.facing),
      health: Math.round(fighter.health),
      shield: Math.round(fighter.shield),
      alive: fighter.alive,
      placement: fighter.placement,
      kills: fighter.kills,
      attackCooldownMs: Math.round(fighter.attackCooldownMs),
      speedBuffMs: Math.round(fighter.speedBuffMs),
      damageBuffMs: Math.round(fighter.damageBuffMs),
      inStorm: fighter.inStorm,
      team: fighter.team,
    }));
  }

  get pickups(): ArenaPickup[] {
    return this.pickupList.map((pickup) => ({ ...pickup }));
  }

  snapshot(): ArenaSnapshot {
    return {
      tick: this.tick,
      matchMs: Math.round(this.matchMs),
      zone: this.zone,
      fighters: this.states,
      pickups: this.pickups,
    };
  }

  getFighter(playerId: string): ArenaFighterState | undefined {
    return this.states.find((fighter) => fighter.playerId === playerId);
  }

  drainEvents(): ArenaEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /** Guarda la intencion del cliente ya normalizada y acotada. */
  setInput(playerId: string, input: ArenaInput): void {
    const fighter = this.fighters.get(playerId);
    if (!fighter || !fighter.alive) return;
    const length = Math.hypot(input.moveX, input.moveY);
    const moveX = length > 1 ? input.moveX / length : input.moveX;
    const moveY = length > 1 ? input.moveY / length : input.moveY;
    this.inputs.set(playerId, {
      moveX: clamp(moveX, -1, 1),
      moveY: clamp(moveY, -1, 1),
      facing: Number.isFinite(input.facing) ? input.facing : fighter.facing,
      attack: Boolean(input.attack),
    });
  }

  removePlayer(playerId: string): void {
    const fighter = this.fighters.get(playerId);
    if (fighter?.alive) this.eliminate(fighter);
    this.fighters.delete(playerId);
    this.inputs.delete(playerId);
  }

  /** Quien sigue vivo. */
  aliveIds(): string[] {
    return [...this.fighters.values()].filter((fighter) => fighter.alive).map((f) => f.playerId);
  }

  /** Equipos que conservan al menos un jugador vivo. */
  aliveTeams(): string[] {
    const set = new Set<string>();
    for (const fighter of this.fighters.values()) {
      if (fighter.alive && fighter.team) set.add(fighter.team);
    }
    return [...set];
  }

  step(dt: number = PHYSICS_DT): void {
    this.tick += 1;
    if (!this.running) return;
    this.matchMs += dt * 1000;

    for (const fighter of this.fighters.values()) {
      if (!fighter.alive) continue;
      this.stepFighter(fighter, dt);
    }
    this.separateFighters();
    this.resolvePickups();
    this.respawnPickups(dt);
  }

  private stepFighter(fighter: Fighter, dt: number): void {
    const input = this.inputs.get(fighter.playerId);
    fighter.attackCooldownMs = Math.max(0, fighter.attackCooldownMs - dt * 1000);
    fighter.speedBuffMs = Math.max(0, fighter.speedBuffMs - dt * 1000);
    fighter.damageBuffMs = Math.max(0, fighter.damageBuffMs - dt * 1000);

    if (input) {
      fighter.facing = input.facing;
      const speed = ARENA.moveSpeed * (fighter.speedBuffMs > 0 ? ARENA_SPEED_MULTIPLIER : 1);
      // El servidor decide si la posicion es valida: los obstaculos y los
      // limites se aplican aqui, no en el cliente.
      const resolved = this.resolveMovement(
        fighter.x,
        fighter.y,
        input.moveX * speed * dt,
        input.moveY * speed * dt,
      );
      fighter.x = resolved.x;
      fighter.y = resolved.y;

      if (input.attack && fighter.attackCooldownMs <= 0) {
        this.performAttack(fighter);
        fighter.attackCooldownMs = ARENA.attackCooldownMs;
      }
    }

    // Dano de la zona.
    const zone = this.zone;
    const distance = Math.hypot(fighter.x - zone.x, fighter.y - zone.y);
    fighter.inStorm = distance > zone.radius;
    if (fighter.inStorm) {
      this.applyDamage(fighter, ARENA.zoneDamagePerSecond * dt, null);
      if (fighter.alive && this.tick % 30 === 0) {
        this.events.push({ kind: 'storm', playerId: fighter.playerId, atMs: this.matchMs });
      }
    }
  }

  /**
   * Aplica un desplazamiento deslizando por los obstaculos.
   *
   * Si se empujara al jugador de vuelta en la direccion del choque, avanzar de
   * frente contra una columna lo dejaria clavado sin poder rodearla. Quitando
   * solo la componente perpendicular, el movimiento resbala por el borde, que
   * es lo que espera cualquiera que juegue con teclado.
   */
  private resolveMovement(
    fromX: number,
    fromY: number,
    deltaX: number,
    deltaY: number,
  ): { x: number; y: number } {
    let dx = deltaX;
    let dy = deltaY;

    for (const obstacle of ARENA_OBSTACLES) {
      const targetX = fromX + dx;
      const targetY = fromY + dy;
      const toX = targetX - obstacle.x;
      const toY = targetY - obstacle.y;
      const distance = Math.hypot(toX, toY);
      const min = obstacle.radius + ARENA.playerRadius;
      if (distance >= min || distance < 1e-9) continue;

      const nx = toX / distance;
      const ny = toY / distance;
      const into = dx * nx + dy * ny;
      if (into < 0) {
        // Se elimina la parte del movimiento que entra en el obstaculo.
        dx -= into * nx;
        dy -= into * ny;
      }
    }

    return this.resolvePosition(fromX + dx, fromY + dy);
  }

  /** Mantiene al jugador dentro de la arena y fuera de los obstaculos. */
  private resolvePosition(x: number, y: number): { x: number; y: number } {
    let nextX = clamp(x, ARENA.playerRadius, ARENA.width - ARENA.playerRadius);
    let nextY = clamp(y, ARENA.playerRadius, ARENA.height - ARENA.playerRadius);
    for (const obstacle of ARENA_OBSTACLES) {
      const dx = nextX - obstacle.x;
      const dy = nextY - obstacle.y;
      const distance = Math.hypot(dx, dy);
      const min = obstacle.radius + ARENA.playerRadius;
      if (distance >= min || distance < 1e-9) continue;
      nextX = obstacle.x + (dx / distance) * min;
      nextY = obstacle.y + (dy / distance) * min;
    }
    return { x: nextX, y: nextY };
  }

  /** Ataque en cono: alcanza a los rivales delante y a distancia. */
  private performAttack(attacker: Fighter): void {
    const damage = ARENA.attackDamage * (attacker.damageBuffMs > 0 ? ARENA_DAMAGE_MULTIPLIER : 1);

    for (const target of this.fighters.values()) {
      if (target.playerId === attacker.playerId || !target.alive) continue;
      // Fuego amigo desactivado en los modos por equipos.
      if (attacker.team && target.team && attacker.team === target.team) continue;

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const distance = Math.hypot(dx, dy);
      if (distance > ARENA.attackRange + ARENA.playerRadius) continue;

      let diff = Math.atan2(dy, dx) - attacker.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > ARENA.attackArc) continue;

      this.applyDamage(target, damage, attacker);
    }
  }

  private applyDamage(target: Fighter, amount: number, attacker: Fighter | null): void {
    if (!target.alive || amount <= 0) return;

    let remaining = amount;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    target.health -= remaining;

    if (attacker) {
      this.events.push({
        kind: 'hit',
        playerId: attacker.playerId,
        targetId: target.playerId,
        amount: Math.round(amount),
        atMs: this.matchMs,
      });
    }

    if (target.health <= 0) {
      target.health = 0;
      this.eliminate(target);
      if (attacker) {
        attacker.kills += 1;
        this.events.push({
          kind: 'kill',
          playerId: attacker.playerId,
          targetId: target.playerId,
          atMs: this.matchMs,
        });
      }
    }
  }

  private eliminate(fighter: Fighter): void {
    if (!fighter.alive) return;
    fighter.alive = false;
    fighter.health = 0;
    fighter.shield = 0;
    fighter.eliminatedAtMs = this.matchMs;
    // Quien cae primero recibe la peor posicion.
    fighter.placement = this.nextPlacement;
    this.nextPlacement = Math.max(1, this.nextPlacement - 1);
    this.inputs.delete(fighter.playerId);
  }

  /** Asigna la primera posicion a quien queda en pie. */
  awardVictory(playerIds: string[]): void {
    for (const id of playerIds) {
      const fighter = this.fighters.get(id);
      if (fighter) fighter.placement = 1;
    }
  }

  private separateFighters(): void {
    const list = [...this.fighters.values()].filter((fighter) => fighter.alive);
    const min = ARENA.playerRadius * 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= min || distance < 1e-9) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (min - distance) / 2 + 0.05;
        const first = this.resolvePosition(a.x - nx * overlap, a.y - ny * overlap);
        const second = this.resolvePosition(b.x + nx * overlap, b.y + ny * overlap);
        a.x = first.x;
        a.y = first.y;
        b.x = second.x;
        b.y = second.y;
      }
    }
  }

  private resolvePickups(): void {
    for (const pickup of this.pickupList) {
      if (!pickup.active) continue;
      for (const fighter of this.fighters.values()) {
        if (!fighter.alive) continue;
        const distance = Math.hypot(fighter.x - pickup.x, fighter.y - pickup.y);
        if (distance > ARENA.playerRadius + ARENA.pickupRadius) continue;

        switch (pickup.kind) {
          case 'botiquin':
            fighter.health = Math.min(ARENA.maxHealth, fighter.health + ARENA_HEAL_AMOUNT);
            break;
          case 'escudo':
            fighter.shield = Math.min(ARENA_SHIELD_AMOUNT, fighter.shield + ARENA_SHIELD_AMOUNT);
            break;
          case 'velocidad':
            fighter.speedBuffMs = ARENA_BUFF_MS;
            break;
          case 'dano':
            fighter.damageBuffMs = ARENA_BUFF_MS;
            break;
        }

        pickup.active = false;
        this.pickupTimers.set(pickup.id, ARENA.pickupRespawnMs);
        this.events.push({
          kind: 'pickup',
          playerId: fighter.playerId,
          amount: 1,
          atMs: this.matchMs,
        });
        break;
      }
    }
  }

  private respawnPickups(dt: number): void {
    for (const [id, remaining] of [...this.pickupTimers]) {
      const next = remaining - dt * 1000;
      if (next > 0) {
        this.pickupTimers.set(id, next);
        continue;
      }
      this.pickupTimers.delete(id);
      const index = this.pickupList.findIndex((pickup) => pickup.id === id);
      if (index === -1) continue;
      const spot = this.randomPickupSpot();
      this.pickupList[index] = { id, ...spot, active: true };
    }
  }

  get playerCount(): number {
    return this.fighters.size;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
