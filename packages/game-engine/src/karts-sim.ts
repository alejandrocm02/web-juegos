import {
  KART,
  PHYSICS_DT,
  gateCenter,
  type KartInput,
  type KartState,
  type KartTrack,
  type KartsSnapshot,
} from '@arcade/shared';
import { closestPointOnSegment } from './vec.js';

interface Kart extends KartState {
  lapStartedMs: number;
}

interface Wall {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/**
 * Simulacion de la carrera.
 *
 * El servidor la ejecuta con paso fijo y reparte snapshots; el cliente solo
 * envia intencion de conduccion y dibuja. La conduccion es de tipo arcade: la
 * velocidad va siempre en la direccion del morro, sin derrape, para que el
 * resultado sea predecible y facil de sincronizar.
 */
export class KartsWorld {
  private karts = new Map<string, Kart>();
  private inputs = new Map<string, KartInput>();
  private readonly walls: Wall[];
  readonly track: KartTrack;
  readonly totalLaps: number;
  raceMs = 0;
  tick = 0;
  /** Mientras esta en cuenta atras nadie puede moverse. */
  running = false;

  constructor(track: KartTrack, playerIds: string[], laps?: number) {
    this.track = track;
    this.totalLaps = laps ?? track.laps;
    this.walls = buildWalls(track);
    playerIds.forEach((id, index) => this.karts.set(id, this.createKart(id, index)));
  }

  /** Coloca los karts en parrilla, escalonados por detras de la linea de meta. */
  private createKart(playerId: string, index: number): Kart {
    const gates = this.track.gates;
    const start = gates[0]!;
    const previous = gates[gates.length - 1]!;
    const startCenter = gateCenter(start);
    const previousCenter = gateCenter(previous);
    const dx = startCenter.x - previousCenter.x;
    const dy = startCenter.y - previousCenter.y;
    const heading = Math.atan2(dy, dx);

    // Filas de dos, retrasadas respecto a la meta.
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const backX = Math.cos(heading) * (28 + row * 30);
    const backY = Math.sin(heading) * (28 + row * 30);
    const sideX = Math.cos(heading + Math.PI / 2) * side * 22;
    const sideY = Math.sin(heading + Math.PI / 2) * side * 22;

    return {
      playerId,
      x: startCenter.x - backX + sideX,
      y: startCenter.y - backY + sideY,
      heading,
      speed: 0,
      lap: 0,
      gate: 0,
      finished: false,
      eliminated: false,
      bestLapMs: null,
      totalMs: null,
      position: index + 1,
      lapStartedMs: 0,
    };
  }

  get states(): KartState[] {
    return [...this.karts.values()].map((kart) => ({
      playerId: kart.playerId,
      x: round(kart.x),
      y: round(kart.y),
      heading: round(kart.heading),
      speed: round(kart.speed),
      lap: kart.lap,
      gate: kart.gate,
      finished: kart.finished,
      eliminated: kart.eliminated,
      bestLapMs: kart.bestLapMs,
      totalMs: kart.totalMs,
      position: kart.position,
    }));
  }

  snapshot(): KartsSnapshot {
    return { tick: this.tick, raceMs: Math.round(this.raceMs), karts: this.states };
  }

  getKart(playerId: string): KartState | undefined {
    return this.states.find((kart) => kart.playerId === playerId);
  }

  addPlayer(playerId: string): void {
    if (!this.karts.has(playerId)) {
      this.karts.set(playerId, this.createKart(playerId, this.karts.size));
    }
  }

  removePlayer(playerId: string): void {
    this.karts.delete(playerId);
    this.inputs.delete(playerId);
  }

  /** Guarda la intencion de conduccion ya acotada. El cliente no mueve nada. */
  setInput(playerId: string, input: KartInput): void {
    if (!this.karts.has(playerId)) return;
    this.inputs.set(playerId, {
      throttle: clamp(input.throttle, -1, 1),
      steer: clamp(input.steer, -1, 1),
      braking: Boolean(input.braking),
    });
  }

  eliminate(playerId: string): void {
    const kart = this.karts.get(playerId);
    if (!kart || kart.finished) return;
    kart.eliminated = true;
    kart.speed = 0;
  }

  step(dt: number = PHYSICS_DT): void {
    this.tick += 1;
    if (!this.running) return;
    this.raceMs += dt * 1000;

    for (const kart of this.karts.values()) {
      if (kart.finished || kart.eliminated) {
        kart.speed = 0;
        continue;
      }
      this.stepKart(kart, dt);
    }
    this.resolveKartContacts();
    this.updatePositions();
  }

  private stepKart(kart: Kart, dt: number): void {
    const input = this.inputs.get(kart.playerId) ?? { throttle: 0, steer: 0, braking: false };

    if (input.braking) {
      const sign = Math.sign(kart.speed);
      kart.speed -= sign * KART.brake * dt;
      if (Math.sign(kart.speed) !== sign) kart.speed = 0;
    } else if (input.throttle > 0) {
      kart.speed += KART.accel * input.throttle * dt;
    } else if (input.throttle < 0) {
      kart.speed += KART.accel * input.throttle * dt;
    } else {
      kart.speed *= Math.exp(-KART.drag * dt);
      if (Math.abs(kart.speed) < 1) kart.speed = 0;
    }

    kart.speed = clamp(kart.speed, -KART.reverseSpeed, KART.maxSpeed);

    // El giro depende de la velocidad: parado no se gira sobre el sitio.
    const grip = Math.min(1, Math.abs(kart.speed) / (KART.maxSpeed * 0.35));
    kart.heading += input.steer * KART.turnRate * grip * dt * Math.sign(kart.speed || 1);

    const previousX = kart.x;
    const previousY = kart.y;
    const steps = Math.max(1, Math.ceil((Math.abs(kart.speed) * dt) / 6));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      kart.x += Math.cos(kart.heading) * kart.speed * sub;
      kart.y += Math.sin(kart.heading) * kart.speed * sub;
      this.collideWalls(kart);
    }
    this.checkGates(kart, previousX, previousY);
  }

  private collideWalls(kart: Kart): void {
    for (const wall of this.walls) {
      const point = closestPointOnSegment(
        { x: kart.x, y: kart.y },
        { x: wall.ax, y: wall.ay },
        { x: wall.bx, y: wall.by },
      );
      const dx = kart.x - point.x;
      const dy = kart.y - point.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= KART.radius || distance < 1e-9) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      kart.x = point.x + nx * (KART.radius + 0.05);
      kart.y = point.y + ny * (KART.radius + 0.05);

      // Rebote suave y perdida de velocidad: chocar penaliza pero no bloquea.
      const dirX = Math.cos(kart.heading);
      const dirY = Math.sin(kart.heading);
      const dot = dirX * nx + dirY * ny;
      const reflectX = dirX - (1 + KART.wallRestitution) * dot * nx;
      const reflectY = dirY - (1 + KART.wallRestitution) * dot * ny;
      kart.heading = Math.atan2(reflectY, reflectX);
      kart.speed *= KART.wallSpeedLoss;
    }
  }

  /** Detecta el cruce de la siguiente puerta y cuenta vueltas. */
  private checkGates(kart: Kart, fromX: number, fromY: number): void {
    const gates = this.track.gates;
    const nextIndex = (kart.gate + 1) % gates.length;
    const next = gates[nextIndex]!;

    if (!segmentsIntersect(fromX, fromY, kart.x, kart.y, next.left, next.right)) return;

    kart.gate = nextIndex;
    if (nextIndex !== 0) return;

    // Volver a la puerta cero cierra una vuelta.
    kart.lap += 1;
    const lapTime = this.raceMs - kart.lapStartedMs;
    if (kart.lap > 0 && (kart.bestLapMs === null || lapTime < kart.bestLapMs)) {
      kart.bestLapMs = Math.round(lapTime);
    }
    kart.lapStartedMs = this.raceMs;

    if (kart.lap >= this.totalLaps) {
      kart.finished = true;
      kart.totalMs = Math.round(this.raceMs);
      kart.speed = 0;
    }
  }

  private resolveKartContacts(): void {
    const list = [...this.karts.values()].filter((kart) => !kart.eliminated);
    const min = KART.radius * 2;
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
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }

  /** Ordena por vueltas, puerta alcanzada y cercania a la siguiente puerta. */
  private updatePositions(): void {
    const ranked = [...this.karts.values()].sort((a, b) => compareProgress(this.track, a, b));
    ranked.forEach((kart, index) => {
      kart.position = index + 1;
    });
  }

  /** Clasificacion actual, de primero a ultimo. */
  standings(): KartState[] {
    return this.states.sort((a, b) => a.position - b.position);
  }

  everyoneFinished(): boolean {
    const active = [...this.karts.values()].filter((kart) => !kart.eliminated);
    return active.length > 0 && active.every((kart) => kart.finished);
  }

  get playerCount(): number {
    return this.karts.size;
  }
}

/** Compara el progreso de dos karts en el circuito. Menor es mejor posicion. */
function compareProgress(track: KartTrack, a: KartState, b: KartState): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished && b.finished) return (a.totalMs ?? 0) - (b.totalMs ?? 0);
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (a.lap !== b.lap) return b.lap - a.lap;
  if (a.gate !== b.gate) return b.gate - a.gate;
  // A igualdad de puerta, va delante quien esta mas cerca de la siguiente.
  const nextIndex = (a.gate + 1) % track.gates.length;
  const target = gateCenter(track.gates[nextIndex]!);
  const da = Math.hypot(a.x - target.x, a.y - target.y);
  const db = Math.hypot(b.x - target.x, b.y - target.y);
  return da - db;
}

/** Muros del circuito: une los extremos izquierdos entre si y los derechos entre si. */
function buildWalls(track: KartTrack): Wall[] {
  const walls: Wall[] = [];
  const gates = track.gates;
  for (let i = 0; i < gates.length; i++) {
    const current = gates[i]!;
    const next = gates[(i + 1) % gates.length]!;
    walls.push({
      ax: current.left.x,
      ay: current.left.y,
      bx: next.left.x,
      by: next.left.y,
    });
    walls.push({
      ax: current.right.x,
      ay: current.right.y,
      bx: next.right.x,
      by: next.right.y,
    });
  }
  return walls;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const d1 = cross(c, d, { x: ax, y: ay });
  const d2 = cross(c, d, { x: bx, y: by });
  const d3 = cross({ x: ax, y: ay }, { x: bx, y: by }, c);
  const d4 = cross({ x: ax, y: ay }, { x: bx, y: by }, d);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function cross(
  o: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
