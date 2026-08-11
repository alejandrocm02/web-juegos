import type {
  GolfBallState,
  GolfFeedEvent,
  GolfLevel,
  GolfSettings,
  GolfSnapshot,
  Vec2,
} from '@arcade/shared';
import {
  GOLF,
  GOLF_HAZARD_SURFACES,
  GOLF_SURFACE_FRICTION,
  PHYSICS_DT,
  golfWind,
} from '@arcade/shared';

import {
  buildLevelWalls,
  motionOffset,
  padRectAt,
  rectContains,
  type Segment,
} from './geometry.js';
import { closestPointOnSegment, normalize, reflect, type V2 } from './vec.js';

/**
 * Cuanto del vector de viento llega a la bola.
 *
 * Calibrado para que a potencia media la desviacion ronde el radio y medio de
 * bola por rodada: se nota y obliga a corregir la punteria, pero no decide el
 * hoyo por ti.
 */
const WIND_FACTOR = 0.06;

export type ShotRejection =
  | 'NOT_PLAYING'
  | 'BALL_MOVING'
  | 'BALL_HOLED'
  | 'OUT_OF_BOUNDS'
  | 'INVALID_POWER'
  | 'INVALID_ANGLE'
  | 'MAX_STROKES'
  | 'STALE_SEQUENCE';

export interface ShotResult {
  ok: boolean;
  reason?: ShotRejection;
}

interface InternalBall extends GolfBallState {
  airTimeLeft: number;
  /** Segundos que faltan para que un aspa pueda volver a impulsar la bola. */
  bladeCooldown: number;
  airTotal: number;
  lastStable: Vec2;
  respawn: Vec2;
  lastSeq: number;
  startedAtMs: number;
}

const MAX_STEP = 3.5;

export class GolfWorld {
  readonly level: GolfLevel;
  readonly settings: GolfSettings;
  private readonly staticWalls: Segment[];
  private readonly ballMap = new Map<string, InternalBall>();
  private readonly feed: GolfFeedEvent[] = [];
  private padDeltas = new Map<string, Vec2>();

  clockMs = 0;
  tick = 0;

  /** Semilla del viento. Fija por partida, para que no cambie a mitad de hoyo. */
  readonly seed: number;

  constructor(level: GolfLevel, settings: GolfSettings, playerIds: string[], seed = 0) {
    this.level = level;
    this.settings = settings;
    this.seed = seed;
    this.staticWalls = buildLevelWalls(level);
    for (const id of playerIds) this.ballMap.set(id, this.createBall(id));
  }

  /** Viento que esta aplicando la simulacion, para publicarlo tal cual. */
  get wind(): Vec2 {
    return golfWind(this.level.id, this.seed, this.settings.windStrength ?? 1);
  }

  private createBall(playerId: string): InternalBall {
    const jitterIndex = this.ballMap.size;
    const spread = 9;
    const offset = (jitterIndex - (Math.max(1, this.ballMap.size) - 1) / 2) * spread;
    const start = { x: this.level.start.x, y: this.level.start.y + offset };
    return {
      playerId,
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      z: 0,
      airborne: false,
      strokes: 0,
      holed: false,
      holedAtMs: null,
      ace: false,
      aceEligible: true,
      outOfBounds: false,
      finished: false,
      airTimeLeft: 0,
      bladeCooldown: 0,
      airTotal: 1,
      lastStable: { ...start },
      respawn: { ...start },
      lastSeq: -1,
      startedAtMs: 0,
    };
  }

  get balls(): GolfBallState[] {
    return [...this.ballMap.values()].map((b) => ({
      playerId: b.playerId,
      x: round(b.x),
      y: round(b.y),
      vx: round(b.vx),
      vy: round(b.vy),
      z: round(b.z),
      airborne: b.airborne,
      strokes: b.strokes,
      holed: b.holed,
      holedAtMs: b.holedAtMs,
      ace: b.ace,
      aceEligible: b.aceEligible,
      outOfBounds: b.outOfBounds,
      finished: b.finished,
    }));
  }

  getBall(playerId: string): GolfBallState | undefined {
    return this.balls.find((b) => b.playerId === playerId);
  }

  lastSequence(playerId: string): number {
    return this.ballMap.get(playerId)?.lastSeq ?? -1;
  }

  addPlayer(playerId: string): void {
    if (!this.ballMap.has(playerId)) this.ballMap.set(playerId, this.createBall(playerId));
  }

  removePlayer(playerId: string): void {
    this.ballMap.delete(playerId);
  }

  snapshot(): GolfSnapshot {
    return {
      tick: this.tick,
      levelClockMs: Math.round(this.clockMs),
      timeLeftMs: Math.max(0, this.timeLimitMs - this.clockMs),
      balls: this.balls,
    };
  }

  get timeLimitMs(): number {
    return this.settings.holeTimeLimitSeconds * 1000;
  }

  drainFeed(): GolfFeedEvent[] {
    const out = this.feed.slice();
    this.feed.length = 0;
    return out;
  }

  private pushEvent(kind: GolfFeedEvent['kind'], ball: InternalBall): void {
    this.feed.push({
      kind,
      playerId: ball.playerId,
      levelId: this.level.id,
      atMs: Math.round(this.clockMs),
      strokes: ball.strokes,
    });
  }

  isBallStopped(playerId: string): boolean {
    const ball = this.ballMap.get(playerId);
    if (!ball) return false;
    return !ball.airborne && Math.hypot(ball.vx, ball.vy) <= GOLF.stopSpeed;
  }

  /** Valida y aplica un golpe. El servidor es la unica autoridad. */
  shoot(playerId: string, angle: number, power: number, seq?: number): ShotResult {
    const ball = this.ballMap.get(playerId);
    if (!ball) return { ok: false, reason: 'NOT_PLAYING' };
    if (!Number.isFinite(angle)) return { ok: false, reason: 'INVALID_ANGLE' };
    if (!Number.isFinite(power) || power <= 0 || power > 1) {
      return { ok: false, reason: 'INVALID_POWER' };
    }
    if (ball.holed || ball.finished) return { ok: false, reason: 'BALL_HOLED' };
    if (ball.outOfBounds) return { ok: false, reason: 'OUT_OF_BOUNDS' };
    if (ball.airborne || Math.hypot(ball.vx, ball.vy) > GOLF.stopSpeed) {
      return { ok: false, reason: 'BALL_MOVING' };
    }
    if (ball.strokes >= this.settings.maxStrokes) return { ok: false, reason: 'MAX_STROKES' };
    if (seq !== undefined) {
      if (seq <= ball.lastSeq) return { ok: false, reason: 'STALE_SEQUENCE' };
      ball.lastSeq = seq;
    }

    const speed = GOLF.maxShotSpeed * power;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.strokes += 1;
    if (ball.strokes === 1) ball.startedAtMs = this.clockMs;
    ball.lastStable = { x: ball.x, y: ball.y };
    return { ok: true };
  }

  /** Reinicio manual: penaliza e invalida el hoyo en uno. */
  manualReset(playerId: string): boolean {
    const ball = this.ballMap.get(playerId);
    if (!ball || ball.holed || ball.finished) return false;
    ball.strokes = Math.min(this.settings.maxStrokes, ball.strokes + GOLF.manualResetPenalty);
    ball.aceEligible = false;
    this.respawn(ball);
    this.pushEvent('reset', ball);
    if (ball.strokes >= this.settings.maxStrokes) this.finishByStrokes(ball);
    return true;
  }

  private respawn(ball: InternalBall): void {
    ball.x = ball.respawn.x;
    ball.y = ball.respawn.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.z = 0;
    ball.airborne = false;
    ball.airTimeLeft = 0;
    ball.outOfBounds = false;
    ball.lastStable = { x: ball.x, y: ball.y };
  }

  private finishByStrokes(ball: InternalBall): void {
    if (ball.finished || ball.holed) return;
    ball.finished = true;
    ball.vx = 0;
    ball.vy = 0;
    this.pushEvent('maxStrokes', ball);
  }

  /** Avanza la simulacion un paso fijo. */
  step(dt: number = PHYSICS_DT): void {
    this.tick += 1;
    const prevTime = this.clockMs / 1000;
    this.clockMs += dt * 1000;
    const time = this.clockMs / 1000;

    this.padDeltas = new Map();
    for (const pad of this.level.pads) {
      if (!pad.motion) continue;
      const before = motionOffset(pad.motion, prevTime);
      const after = motionOffset(pad.motion, time);
      this.padDeltas.set(pad.id, { x: after.x - before.x, y: after.y - before.y });
    }

    for (const ball of this.ballMap.values()) {
      if (ball.finished || ball.holed) continue;
      if (ball.outOfBounds) continue;
      this.stepBall(ball, dt, time);
    }

    if (this.settings.ballCollisions) this.resolveBallCollisions();

    if (this.clockMs >= this.timeLimitMs) {
      for (const ball of this.ballMap.values()) {
        if (!ball.holed && !ball.finished) {
          ball.strokes = this.settings.maxStrokes;
          ball.finished = true;
          ball.vx = 0;
          ball.vy = 0;
          this.pushEvent('timeUp', ball);
        }
      }
    }
  }

  private stepBall(ball: InternalBall, dt: number, time: number): void {
    if (ball.airborne) {
      ball.airTimeLeft -= dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const total = Math.max(0.0001, ball.airTotal);
      const progress = 1 - Math.max(0, ball.airTimeLeft) / total;
      ball.z = Math.sin(Math.PI * Math.min(1, progress)) * 26;
      if (ball.airTimeLeft <= 0) {
        ball.airborne = false;
        ball.z = 0;
        const pad = this.padAt(ball.x, ball.y, time);
        if (!pad) {
          this.handleOutOfBounds(ball);
          return;
        }
        ball.lastStable = { x: ball.x, y: ball.y };
      }
      return;
    }

    if (ball.bladeCooldown > 0) ball.bladeCooldown = Math.max(0, ball.bladeCooldown - dt);

    const pad = this.padAt(ball.x, ball.y, time);
    if (!pad) {
      this.handleOutOfBounds(ball);
      return;
    }

    // Arrastre de plataformas moviles.
    const delta = pad.motion ? this.padDeltas.get(pad.id) : undefined;
    if (delta) {
      ball.x += delta.x;
      ball.y += delta.y;
    }

    const friction = GOLF_SURFACE_FRICTION[pad.surface];
    const damping = Math.exp(-friction * dt);
    ball.vx *= damping;
    ball.vy *= damping;

    // Las pendientes y las cintas solo actuan sobre una bola claramente en
    // movimiento. Asi una bola parada nunca se desliza sola y ninguna pendiente
    // puede crear un equilibrio infinito por encima del umbral de reposo.
    const rolling = Math.hypot(ball.vx, ball.vy) > GOLF.stopSpeed * 2;
    if (rolling && pad.accel) {
      ball.vx += pad.accel.x * dt;
      ball.vy += pad.accel.y * dt;
    }
    if (rolling && pad.surface === 'turbo') {
      const dir = normalize({ x: ball.vx, y: ball.vy });
      ball.vx += dir.x * 220 * dt;
      ball.vy += dir.y * 220 * dt;
    }

    // Viento: solo sobre bola rodando, y con un multiplicador deliberadamente
    // bajo. Tiene que desviar lo justo para que merezca la pena mirar la
    // brujula, no decidir el hoyo por su cuenta. Con windStrength a 0 el vector
    // es nulo y la trayectoria queda identica a la de antes del cambio.
    if (rolling) {
      const wind = golfWind(this.level.id, this.seed, this.settings.windStrength ?? 1);
      ball.vx += wind.x * WIND_FACTOR * dt;
      ball.vy += wind.y * WIND_FACTOR * dt;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed <= GOLF.stopSpeed) {
      ball.vx = 0;
      ball.vy = 0;
      ball.lastStable = { x: ball.x, y: ball.y };
      this.applyCheckpoints(ball);
      if (ball.strokes >= this.settings.maxStrokes && !ball.holed) this.finishByStrokes(ball);
      return;
    }

    const steps = Math.max(1, Math.ceil((speed * dt) / MAX_STEP));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * sub;
      ball.y += ball.vy * sub;
      this.collideWalls(ball, time);
      this.collideCircles(ball);
      this.collideBlades(ball, time);
      // El agua se comprueba aqui dentro y antes del hoyo: si se mirara una vez
      // por fotograma, una bola rapida podria cruzar el estanque entero entre
      // dos comprobaciones y salir por el otro lado sin mojarse.
      const here = this.padAt(ball.x, ball.y, time);
      if (here && GOLF_HAZARD_SURFACES.includes(here.surface)) {
        this.handleHazard(ball);
        return;
      }
      if (this.checkHole(ball)) return;
      if (this.checkRamps(ball)) return;
      if (!this.padAt(ball.x, ball.y, time)) {
        this.handleOutOfBounds(ball);
        return;
      }
    }
    this.applyCheckpoints(ball);
  }

  private applyCheckpoints(ball: InternalBall): void {
    for (const cp of this.level.checkpoints) {
      if (rectContains(cp.rect, ball.x, ball.y)) {
        ball.respawn = { ...cp.respawn };
      }
    }
  }

  private padAt(x: number, y: number, time: number) {
    for (const pad of this.level.pads) {
      const rect = padRectAt(pad, time);
      if (rectContains(rect, x, y, 1)) return pad;
    }
    return undefined;
  }

  private handleOutOfBounds(ball: InternalBall): void {
    ball.vx = 0;
    ball.vy = 0;
    ball.z = 0;
    ball.airborne = false;
    ball.airTimeLeft = 0;

    const zone = this.level.respawnZones.find((z) => rectContains(z.rect, ball.x, ball.y, 4));
    const target = zone ? zone.respawn : ball.respawn;
    if (zone) ball.respawn = { ...zone.respawn };
    ball.aceEligible = false;
    this.pushEvent('out', ball);

    if (this.settings.outOfBoundsPenalty) {
      ball.strokes = Math.min(this.settings.maxStrokes, ball.strokes + GOLF.outPenalty);
      this.pushEvent('penalty', ball);
    }

    if (this.settings.autoResetOutOfBounds) {
      ball.x = target.x;
      ball.y = target.y;
      ball.outOfBounds = false;
      ball.lastStable = { x: ball.x, y: ball.y };
    } else {
      ball.outOfBounds = true;
    }

    if (ball.strokes >= this.settings.maxStrokes) this.finishByStrokes(ball);
  }

  /**
   * Bola al agua.
   *
   * Se parece a salir del recorrido pero con dos diferencias deliberadas: la
   * bola vuelve al ultimo punto donde estuvo quieta y no al respawn del hoyo
   * (caer al agua a mitad de recorrido no deberia mandarte al tee), y la
   * penalizacion se aplica siempre, sin depender de `outOfBoundsPenalty`: un
   * obstaculo de agua sin coste no seria un obstaculo.
   */
  private handleHazard(ball: InternalBall): void {
    ball.vx = 0;
    ball.vy = 0;
    ball.z = 0;
    ball.airborne = false;
    ball.airTimeLeft = 0;
    ball.aceEligible = false;

    ball.x = ball.lastStable.x;
    ball.y = ball.lastStable.y;
    ball.outOfBounds = false;

    ball.strokes = Math.min(this.settings.maxStrokes, ball.strokes + GOLF.outPenalty);
    this.pushEvent('penalty', ball);

    if (ball.strokes >= this.settings.maxStrokes) this.finishByStrokes(ball);
  }

  private collideWalls(ball: InternalBall, time: number): void {
    const r = GOLF.ballRadius;
    for (const wall of this.staticWalls) {
      this.resolveSegment(ball, wall.ax, wall.ay, wall.bx, wall.by, r, wall.restitution);
    }
    for (const wall of this.level.walls) {
      let ax = wall.a.x;
      let ay = wall.a.y;
      let bx = wall.b.x;
      let by = wall.b.y;
      if (wall.motion) {
        const off = motionOffset(wall.motion, time);
        ax += off.x;
        ay += off.y;
        bx += off.x;
        by += off.y;
      }
      this.resolveSegment(ball, ax, ay, bx, by, r, wall.restitution);
    }
  }

  private resolveSegment(
    ball: InternalBall,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    radius: number,
    restitution: number,
  ): void {
    const p = closestPointOnSegment({ x: ball.x, y: ball.y }, { x: ax, y: ay }, { x: bx, y: by });
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius || dist < 1e-9) return;
    const n: V2 = { x: dx / dist, y: dy / dist };
    const push = radius - dist + 0.05;
    ball.x += n.x * push;
    ball.y += n.y * push;
    const vel = reflect({ x: ball.vx, y: ball.vy }, n, restitution);
    ball.vx = vel.x;
    ball.vy = vel.y;
  }

  private collideCircles(ball: InternalBall): void {
    for (const c of this.level.circles) {
      const dx = ball.x - c.pos.x;
      const dy = ball.y - c.pos.y;
      const dist = Math.hypot(dx, dy);
      const min = c.radius + GOLF.ballRadius;
      if (dist >= min || dist < 1e-9) continue;
      const n: V2 = { x: dx / dist, y: dy / dist };
      ball.x = c.pos.x + n.x * (min + 0.05);
      ball.y = c.pos.y + n.y * (min + 0.05);
      const vel = reflect({ x: ball.vx, y: ball.vy }, n, c.restitution);
      ball.vx = vel.x;
      ball.vy = vel.y;
    }
  }

  private collideBlades(ball: InternalBall, time: number): void {
    for (const blade of this.level.blades) {
      for (let i = 0; i < blade.arms; i++) {
        const angle =
          blade.phase + blade.angularSpeed * time + (i * Math.PI * 2) / Math.max(1, blade.arms);
        const tipX = blade.center.x + Math.cos(angle) * blade.armLength;
        const tipY = blade.center.y + Math.sin(angle) * blade.armLength;
        const p = closestPointOnSegment({ x: ball.x, y: ball.y }, blade.center, {
          x: tipX,
          y: tipY,
        });
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.hypot(dx, dy);
        const min = blade.armRadius + GOLF.ballRadius;
        if (dist >= min || dist < 1e-9) continue;
        const n: V2 = { x: dx / dist, y: dy / dist };
        ball.x = p.x + n.x * (min + 0.05);
        ball.y = p.y + n.y * (min + 0.05);

        const incoming = Math.hypot(ball.vx, ball.vy);
        const vel = reflect({ x: ball.vx, y: ball.vy }, n, blade.restitution);

        // Empuje tangencial del aspa en movimiento.
        const rx = p.x - blade.center.x;
        const ry = p.y - blade.center.y;
        const tipSpeed = Math.hypot(rx, ry) * Math.abs(blade.angularSpeed);
        const boost = ball.bladeCooldown > 0 ? 0 : 1;
        let vx = vel.x + -ry * blade.angularSpeed * boost;
        let vy = vel.y + rx * blade.angularSpeed * boost;

        /*
         * Sin este limite el aspa reinyecta energia en cada contacto y la bola
         * puede quedar rebotando junto al molino indefinidamente: el jugador ve
         * que su bola no se detiene nunca y no puede volver a golpear.
         * El aspa redirige y puede empujar, pero nunca por encima de la
         * velocidad de llegada ni de la del propio brazo.
         */
        const cap = Math.max(incoming, tipSpeed);
        const after = Math.hypot(vx, vy);
        if (after > cap && after > 1e-6) {
          vx = (vx / after) * cap;
          vy = (vy / after) * cap;
        }
        ball.vx = vx;
        ball.vy = vy;
        if (boost === 1) ball.bladeCooldown = 0.15;
      }
    }
  }

  private checkHole(ball: InternalBall): boolean {
    const dx = ball.x - this.level.hole.x;
    const dy = ball.y - this.level.hole.y;
    if (Math.hypot(dx, dy) > GOLF.holeRadius) return false;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > GOLF.holeCaptureSpeed) return false;

    ball.holed = true;
    ball.finished = true;
    ball.vx = 0;
    ball.vy = 0;
    ball.x = this.level.hole.x;
    ball.y = this.level.hole.y;
    ball.holedAtMs = Math.round(this.clockMs);
    ball.ace = ball.strokes === 1 && ball.aceEligible;
    this.pushEvent(ball.ace ? 'ace' : 'holed', ball);
    return true;
  }

  private checkRamps(ball: InternalBall): boolean {
    for (const ramp of this.level.ramps) {
      if (!rectContains(ramp.rect, ball.x, ball.y)) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed < ramp.minSpeed) continue;
      const dir = normalize({ x: ball.vx, y: ball.vy });
      const rampDir = normalize(ramp.dir);
      if (dir.x * rampDir.x + dir.y * rampDir.y < 0.35) continue;

      const launch = ramp.launchDir ? normalize(ramp.launchDir) : dir;
      const newSpeed = speed * ramp.boost;
      ball.vx = launch.x * newSpeed;
      ball.vy = launch.y * newSpeed;
      ball.airborne = true;
      ball.airTimeLeft = ramp.flightTime;
      ball.airTotal = ramp.flightTime;
      ball.z = 0.1;
      return true;
    }
    return false;
  }

  private resolveBallCollisions(): void {
    const list = [...this.ballMap.values()].filter(
      (b) => !b.holed && !b.finished && !b.airborne && !b.outOfBounds,
    );
    const r2 = GOLF.ballRadius * 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= r2 || dist < 1e-9) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (r2 - dist) / 2 + 0.05;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const sep = rvx * nx + rvy * ny;
        if (sep > 0) continue;
        const restitution = 0.92;
        const impulse = -(1 + restitution) * sep * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  allSettled(): boolean {
    for (const ball of this.ballMap.values()) {
      if (ball.holed || ball.finished || ball.outOfBounds) continue;
      if (ball.airborne) return false;
      if (Math.hypot(ball.vx, ball.vy) > GOLF.stopSpeed) return false;
    }
    return true;
  }

  allFinished(): boolean {
    for (const ball of this.ballMap.values()) {
      if (!ball.holed && !ball.finished) return false;
    }
    return true;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
