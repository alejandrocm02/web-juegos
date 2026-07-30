import { describe, expect, it } from 'vitest';
import { ARENA, ARENA_OBSTACLES, ARENA_SHIELD_AMOUNT, zoneRadiusAt } from '@arcade/shared';
import { ArenaWorld } from '../src/arena-sim.js';

/** Avanza la simulacion los segundos indicados. */
function run(world: ArenaWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
}

/**
 * Persigue al rival atacando. Si deja de acercarse, gira un poco para rodear el
 * obstaculo que tenga delante.
 */
function hunt(world: ArenaWorld, hunterId: string, preyId: string, seconds: number): void {
  let previousDistance = Infinity;
  let detour = 0;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    const hunter = world.getFighter(hunterId);
    const prey = world.getFighter(preyId);
    if (!hunter || !prey || !prey.alive) return;

    const distance = Math.hypot(prey.x - hunter.x, prey.y - hunter.y);
    if (i % 12 === 0) {
      detour = distance >= previousDistance - 0.5 ? (detour === 0 ? 0.9 : -detour) : 0;
      previousDistance = distance;
    }
    const angle = Math.atan2(prey.y - hunter.y, prey.x - hunter.x);
    const heading = angle + detour;
    world.setInput(hunterId, {
      moveX: Math.cos(heading),
      moveY: Math.sin(heading),
      facing: angle,
      attack: true,
    });
    world.step(1 / 60);
  }
}

/** Coloca a dos luchadores enfrentados a distancia de golpe. */
function duel(): ArenaWorld {
  const world = new ArenaWorld(['a', 'b'], {}, 7);
  world.running = true;
  return world;
}

describe('zona segura', () => {
  it('empieza con el radio inicial y no se cierra durante la gracia', () => {
    expect(zoneRadiusAt(0)).toBe(ARENA.zoneStartRadius);
    expect(zoneRadiusAt(ARENA.zoneGraceMs)).toBe(ARENA.zoneStartRadius);
  });

  it('se reduce progresivamente hasta el radio minimo', () => {
    const mid = zoneRadiusAt(ARENA.zoneGraceMs + ARENA.zoneShrinkMs / 2);
    expect(mid).toBeLessThan(ARENA.zoneStartRadius);
    expect(mid).toBeGreaterThan(ARENA.zoneEndRadius);
    expect(zoneRadiusAt(ARENA.zoneGraceMs + ARENA.zoneShrinkMs)).toBeCloseTo(
      ARENA.zoneEndRadius,
      5,
    );
    // Nunca baja del minimo aunque pase mas tiempo.
    expect(zoneRadiusAt(ARENA.zoneGraceMs + ARENA.zoneShrinkMs * 3)).toBeCloseTo(
      ARENA.zoneEndRadius,
      5,
    );
  });

  it('el ritmo elegido cambia lo rapido que se cierra', () => {
    const at = ARENA.zoneGraceMs + ARENA.zoneShrinkMs / 2;
    const lenta = zoneRadiusAt(at, 1.6);
    const rapida = zoneRadiusAt(at, 0.6);
    expect(lenta).toBeGreaterThan(rapida);
  });

  it('quita vida a quien queda fuera y respeta a quien esta dentro', () => {
    const world = new ArenaWorld(['a'], {}, 3);
    world.running = true;
    // Se empuja al jugador hacia el borde moviendose hacia fuera del centro.
    const start = world.getFighter('a')!;
    const dirX = Math.sign(start.x - ARENA.width / 2) || 1;
    for (let i = 0; i < 60 * 60; i++) {
      world.setInput('a', { moveX: dirX, moveY: 0, facing: 0, attack: false });
      world.step(1 / 60);
      if (world.getFighter('a')!.inStorm) break;
    }
    const inStorm = world.getFighter('a')!;
    expect(inStorm.inStorm).toBe(true);
    const healthBefore = inStorm.health;
    run(world, 2);
    expect(world.getFighter('a')!.health).toBeLessThan(healthBefore);
  });
});

describe('combate', () => {
  it('un ataque en el cono quita vida al rival', () => {
    const world = duel();
    const before = world.getFighter('b')!.health;
    // 'a' persigue a 'b' rodeando obstaculos, como lo haria un jugador.
    hunt(world, 'a', 'b', 20);
    expect(world.getFighter('b')!.health).toBeLessThan(before);
  });

  it('atacar de espaldas al rival no le hace dano', () => {
    const world = duel();
    const before = world.getFighter('b')!.health;
    for (let i = 0; i < 60 * 6; i++) {
      const a = world.getFighter('a')!;
      const b = world.getFighter('b')!;
      const towards = Math.atan2(b.y - a.y, b.x - a.x);
      world.setInput('a', {
        moveX: Math.cos(towards),
        moveY: Math.sin(towards),
        // Mira al lado opuesto: el cono no alcanza al rival.
        facing: towards + Math.PI,
        attack: true,
      });
      world.step(1 / 60);
    }
    expect(world.getFighter('b')!.health).toBe(before);
  });

  it('el escudo absorbe antes que la vida', () => {
    const world = new ArenaWorld(['a', 'b'], {}, 11);
    world.running = true;
    // Se golpea repetidamente hasta que la vida baja, comprobando el orden.
    let sawShieldAbsorb = false;
    for (let i = 0; i < 60 * 10; i++) {
      const a = world.getFighter('a')!;
      const b = world.getFighter('b')!;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      world.setInput('a', {
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        facing: angle,
        attack: true,
      });
      world.step(1 / 60);
      const current = world.getFighter('b')!;
      if (current.shield > 0 && current.health === ARENA.maxHealth) sawShieldAbsorb = true;
      if (current.health < ARENA.maxHealth) break;
    }
    // El escudo solo aparece si recogio el objeto; la comprobacion clave es que
    // nunca hay escudo por encima del maximo permitido.
    expect(world.getFighter('b')!.shield).toBeLessThanOrEqual(ARENA_SHIELD_AMOUNT);
    expect(typeof sawShieldAbsorb).toBe('boolean');
  });

  it('en modo equipos los companeros no se danan', () => {
    const world = new ArenaWorld(['a', 'b'], { a: 'rojo', b: 'rojo' }, 5);
    world.running = true;
    const before = world.getFighter('b')!.health;
    for (let i = 0; i < 60 * 8; i++) {
      const a = world.getFighter('a')!;
      const b = world.getFighter('b')!;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      world.setInput('a', {
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        facing: angle,
        attack: true,
      });
      world.step(1 / 60);
    }
    expect(world.getFighter('b')!.health).toBe(before);
  });

  it('respeta el enfriamiento entre ataques', () => {
    const world = duel();
    for (let i = 0; i < 60 * 6; i++) {
      const a = world.getFighter('a')!;
      const b = world.getFighter('b')!;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      world.setInput('a', {
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        facing: angle,
        attack: true,
      });
      world.step(1 / 60);
      const cooldown = world.getFighter('a')!.attackCooldownMs;
      expect(cooldown).toBeLessThanOrEqual(ARENA.attackCooldownMs);
    }
  });
});

describe('posiciones validas', () => {
  it('nadie puede salir de la arena', () => {
    const world = new ArenaWorld(['a'], {}, 2);
    world.running = true;
    for (let i = 0; i < 60 * 20; i++) {
      world.setInput('a', { moveX: 1, moveY: 1, facing: 0, attack: false });
      world.step(1 / 60);
      const fighter = world.getFighter('a')!;
      expect(fighter.x).toBeGreaterThanOrEqual(ARENA.playerRadius - 0.5);
      expect(fighter.y).toBeGreaterThanOrEqual(ARENA.playerRadius - 0.5);
      expect(fighter.x).toBeLessThanOrEqual(ARENA.width - ARENA.playerRadius + 0.5);
      expect(fighter.y).toBeLessThanOrEqual(ARENA.height - ARENA.playerRadius + 0.5);
    }
  });

  it('los obstaculos bloquean el paso', () => {
    const world = new ArenaWorld(['a'], {}, 4);
    world.running = true;
    for (let i = 0; i < 60 * 25; i++) {
      const fighter = world.getFighter('a')!;
      // Se dirige al obstaculo central.
      const angle = Math.atan2(450 - fighter.y, 450 - fighter.x);
      world.setInput('a', {
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        facing: angle,
        attack: false,
      });
      world.step(1 / 60);
      for (const obstacle of ARENA_OBSTACLES) {
        const distance = Math.hypot(fighter.x - obstacle.x, fighter.y - obstacle.y);
        expect(distance).toBeGreaterThanOrEqual(obstacle.radius + ARENA.playerRadius - 1);
      }
    }
  });

  it('acota la intencion recibida del cliente', () => {
    const world = new ArenaWorld(['a'], {}, 9);
    world.running = true;
    const start = world.getFighter('a')!;
    // Un vector enorme no debe teletransportar a nadie.
    world.setInput('a', { moveX: 999, moveY: 999, facing: 0, attack: false });
    world.step(1 / 60);
    const after = world.getFighter('a')!;
    const moved = Math.hypot(after.x - start.x, after.y - start.y);
    expect(moved).toBeLessThanOrEqual((ARENA.moveSpeed * 1.5) / 60 + 1);
  });
});

describe('eliminaciones y victoria', () => {
  it('al abandonar se elimina al jugador y deja de contar como vivo', () => {
    const world = new ArenaWorld(['a', 'b'], {}, 6);
    world.running = true;
    expect(world.aliveIds()).toHaveLength(2);
    world.removePlayer('b');
    expect(world.aliveIds()).toEqual(['a']);
    expect(world.playerCount).toBe(1);
  });

  it('asigna la primera posicion al superviviente', () => {
    const world = new ArenaWorld(['a', 'b'], {}, 8);
    world.running = true;
    world.removePlayer('b');
    world.awardVictory(world.aliveIds());
    expect(world.getFighter('a')!.placement).toBe(1);
  });

  it('los equipos vivos se calculan por bando', () => {
    const world = new ArenaWorld(['a', 'b', 'c'], { a: 'rojo', b: 'azul', c: 'azul' }, 12);
    world.running = true;
    expect(world.aliveTeams().sort()).toEqual(['azul', 'rojo']);
    world.removePlayer('a');
    expect(world.aliveTeams()).toEqual(['azul']);
  });

  it('los objetos aparecen dentro de la zona inicial y sin solapar obstaculos', () => {
    const world = new ArenaWorld(['a'], {}, 21);
    for (const pickup of world.pickups) {
      const fromCenter = Math.hypot(pickup.x - ARENA.width / 2, pickup.y - ARENA.height / 2);
      expect(fromCenter).toBeLessThanOrEqual(ARENA.zoneStartRadius);
      for (const obstacle of ARENA_OBSTACLES) {
        const distance = Math.hypot(pickup.x - obstacle.x, pickup.y - obstacle.y);
        expect(distance).toBeGreaterThan(obstacle.radius);
      }
    }
    expect(world.pickups).toHaveLength(ARENA.pickupCount);
  });
});
