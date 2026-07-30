import { describe, expect, it } from 'vitest';
import { KART, KART_TRACKS, gateCenter, getKartTrack, type KartTrack } from '@arcade/shared';
import { KartsWorld } from '../src/karts-sim.js';

/** Piloto automatico: gira hacia el centro de la siguiente puerta. */
function autopilot(world: KartsWorld, id: string): void {
  const kart = world.getKart(id);
  if (!kart) return;
  const gates = world.track.gates;
  const target = gateCenter(gates[(kart.gate + 1) % gates.length]!);
  const desired = Math.atan2(target.y - kart.y, target.x - kart.x);
  let diff = desired - kart.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  world.setInput(id, {
    throttle: Math.abs(diff) > 1.1 ? 0.35 : 1,
    steer: Math.max(-1, Math.min(1, diff * 2.2)),
    braking: false,
  });
}

function race(track: KartTrack, laps: number, seconds = 180): KartsWorld {
  const world = new KartsWorld(track, ['p1'], laps);
  world.running = true;
  const steps = 60 * seconds;
  for (let i = 0; i < steps && !world.getKart('p1')!.finished; i++) {
    autopilot(world, 'p1');
    world.step(1 / 60);
  }
  return world;
}

describe('circuitos', () => {
  it('hay al menos dos circuitos con puertas suficientes', () => {
    expect(KART_TRACKS.length).toBeGreaterThanOrEqual(2);
    for (const track of KART_TRACKS) {
      expect(track.gates.length, track.id).toBeGreaterThanOrEqual(8);
      expect(track.laps, track.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('las puertas tienen ancho suficiente para que quepa un kart', () => {
    for (const track of KART_TRACKS) {
      for (const gate of track.gates) {
        const width = Math.hypot(gate.left.x - gate.right.x, gate.left.y - gate.right.y);
        expect(width, track.id).toBeGreaterThan(KART.radius * 3);
      }
    }
  });

  it('devuelve el ovalo si el identificador no existe', () => {
    expect(getKartTrack('inventado').id).toBe('ovalo');
  });
});

describe('vueltas y checkpoints', () => {
  it('cada circuito se puede completar y registra vueltas y tiempos', () => {
    for (const track of KART_TRACKS) {
      const world = race(track, 2);
      const kart = world.getKart('p1')!;
      expect(kart.finished, track.id).toBe(true);
      expect(kart.lap, track.id).toBe(2);
      expect(kart.totalMs, track.id).toBeGreaterThan(0);
      expect(kart.bestLapMs, track.id).toBeGreaterThan(0);
    }
  });

  it('no cuenta vuelta si no se pasa por las puertas en orden', () => {
    const track = getKartTrack('ovalo');
    const world = new KartsWorld(track, ['p1'], 1);
    world.running = true;

    // Se teletransporta el kart justo detras de la meta sin recorrer el circuito.
    const kart = world.getKart('p1')!;
    expect(kart.gate).toBe(0);
    expect(kart.lap).toBe(0);

    // Conducir hacia atras no debe sumar vuelta.
    for (let i = 0; i < 120; i++) {
      world.setInput('p1', { throttle: -1, steer: 0, braking: false });
      world.step(1 / 60);
    }
    expect(world.getKart('p1')!.lap).toBe(0);
  });

  it('la carrera no avanza durante la cuenta atras', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1'], 1);
    const before = world.getKart('p1')!;
    for (let i = 0; i < 120; i++) {
      world.setInput('p1', { throttle: 1, steer: 0, braking: false });
      world.step(1 / 60);
    }
    const after = world.getKart('p1')!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(world.raceMs).toBe(0);
  });
});

describe('conduccion y muros', () => {
  it('acelerar aumenta la velocidad y frenar la reduce', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1'], 3);
    world.running = true;
    world.setInput('p1', { throttle: 1, steer: 0, braking: false });
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    const accelerated = world.getKart('p1')!.speed;
    expect(accelerated).toBeGreaterThan(0);

    world.setInput('p1', { throttle: 0, steer: 0, braking: true });
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    expect(world.getKart('p1')!.speed).toBeLessThan(accelerated);
  });

  it('la velocidad nunca supera el maximo configurado', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1'], 3);
    world.running = true;
    for (let i = 0; i < 60 * 20; i++) {
      world.setInput('p1', { throttle: 1, steer: 0, braking: false });
      world.step(1 / 60);
      expect(Math.abs(world.getKart('p1')!.speed)).toBeLessThanOrEqual(KART.maxSpeed + 1);
    }
  });

  it('los muros impiden salirse del circuito', () => {
    const track = getKartTrack('ovalo');
    const world = new KartsWorld(track, ['p1'], 3);
    world.running = true;
    // Girar siempre al maximo empuja el kart contra el muro exterior.
    for (let i = 0; i < 60 * 15; i++) {
      world.setInput('p1', { throttle: 1, steer: 1, braking: false });
      world.step(1 / 60);
      const kart = world.getKart('p1')!;
      expect(kart.x).toBeGreaterThan(-KART.radius * 2);
      expect(kart.x).toBeLessThan(track.size.w + KART.radius * 2);
      expect(kart.y).toBeGreaterThan(-KART.radius * 2);
      expect(kart.y).toBeLessThan(track.size.h + KART.radius * 2);
    }
  });

  it('acota la entrada recibida del cliente', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1'], 3);
    world.running = true;
    // Valores desorbitados no deben acelerar mas que el maximo legitimo.
    world.setInput('p1', { throttle: 99, steer: -99, braking: false });
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(world.getKart('p1')!.speed).toBeLessThanOrEqual(KART.maxSpeed + 1);
  });
});

describe('clasificacion y jugadores', () => {
  it('ordena por vueltas y puertas alcanzadas', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1', 'p2'], 3);
    world.running = true;
    for (let i = 0; i < 60 * 8; i++) {
      autopilot(world, 'p1');
      world.setInput('p2', { throttle: 0, steer: 0, braking: true });
      world.step(1 / 60);
    }
    const standings = world.standings();
    expect(standings[0]!.playerId).toBe('p1');
    expect(standings[1]!.playerId).toBe('p2');
  });

  it('eliminar detiene el kart y lo deja al final', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1', 'p2'], 3);
    world.running = true;
    world.eliminate('p2');
    for (let i = 0; i < 60; i++) {
      autopilot(world, 'p1');
      world.setInput('p2', { throttle: 1, steer: 0, braking: false });
      world.step(1 / 60);
    }
    const eliminated = world.getKart('p2')!;
    expect(eliminated.eliminated).toBe(true);
    expect(eliminated.speed).toBe(0);
    expect(world.standings().at(-1)!.playerId).toBe('p2');
  });

  it('reconectar no duplica el kart ni reinicia su progreso', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1', 'p2'], 3);
    world.running = true;
    for (let i = 0; i < 60 * 3; i++) {
      autopilot(world, 'p1');
      world.step(1 / 60);
    }
    const before = world.getKart('p1')!;
    world.addPlayer('p1');
    const after = world.getKart('p1')!;
    expect(after.x).toBe(before.x);
    expect(after.gate).toBe(before.gate);
    expect(world.playerCount).toBe(2);
  });

  it('abandonar retira el kart de la carrera', () => {
    const world = new KartsWorld(getKartTrack('ovalo'), ['p1', 'p2'], 3);
    world.removePlayer('p2');
    expect(world.playerCount).toBe(1);
    expect(world.getKart('p2')).toBeUndefined();
  });
});
