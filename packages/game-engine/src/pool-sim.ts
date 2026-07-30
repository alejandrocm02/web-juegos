import type { PoolBallState, PoolSnapshot } from '@arcade/shared';
import {
  EIGHT_BALL,
  PHYSICS_DT,
  POOL_FRICTION,
  POOL_MAX_SPEED,
  POOL_STOP_SPEED,
  POOL_TABLE,
  poolPockets,
} from '@arcade/shared';

const BALL_COLORS = [
  '#f8fafc',
  '#fbbf24',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#f97316',
  '#22c55e',
  '#b91c1c',
  '#0f172a',
  '#facc15',
  '#60a5fa',
  '#e879f9',
  '#34d399',
];

export interface PoolShotOutcome {
  pocketedColors: number[];
  cuePocketed: boolean;
}

const CUSHION_RESTITUTION = 0.94;
const MAX_STEP = 1.2;

export class PoolWorld {
  private balls: PoolBallState[] = [];
  private frictionCoef: number;
  private outcome: PoolShotOutcome = { pocketedColors: [], cuePocketed: false };
  tick = 0;

  constructor(
    colorBalls: number,
    friction: keyof typeof POOL_FRICTION,
    /** La variante bola 8 coloca las quince bolas con la negra en el centro. */
    private readonly eightBall = false,
  ) {
    this.frictionCoef = POOL_FRICTION[friction];
    this.rack(eightBall ? EIGHT_BALL.totalBalls : colorBalls);
  }

  private rack(colorBalls: number): void {
    const { width, height, ballRadius } = POOL_TABLE;
    this.balls = [
      {
        id: 0,
        color: BALL_COLORS[0]!,
        x: width * 0.25,
        y: height / 2,
        vx: 0,
        vy: 0,
        spin: 0,
        pocketed: false,
      },
    ];
    const apexX = width * 0.68;
    const gap = ballRadius * 2 + 0.35;
    const order = this.eightBall ? eightBallRackOrder() : sequentialOrder(colorBalls);

    let index = 0;
    let row = 0;
    while (index < order.length) {
      for (let i = 0; i <= row && index < order.length; i++) {
        const id = order[index]!;
        const x = apexX + row * gap * 0.87;
        const y = height / 2 + (i - row / 2) * gap;
        this.balls.push({
          id,
          color: BALL_COLORS[id % BALL_COLORS.length]!,
          x,
          y,
          vx: 0,
          vy: 0,
          spin: 0,
          pocketed: false,
        });
        index++;
      }
      row++;
    }
  }

  get state(): PoolBallState[] {
    return this.balls.map((b) => ({
      ...b,
      x: round(b.x),
      y: round(b.y),
      vx: round(b.vx),
      vy: round(b.vy),
    }));
  }

  snapshot(): PoolSnapshot {
    return { balls: this.state, settled: this.settled(), tick: this.tick };
  }

  get cueBall(): PoolBallState {
    return this.balls[0]!;
  }

  colorBallsLeft(): number {
    return this.balls.filter((b) => b.id !== 0 && !b.pocketed).length;
  }

  settled(): boolean {
    return this.balls.every((b) => b.pocketed || Math.hypot(b.vx, b.vy) <= POOL_STOP_SPEED);
  }

  /** Coloca la bola blanca tras una falta, buscando un hueco libre. */
  respotCueBall(): void {
    const cue = this.cueBall;
    const { width, height, ballRadius } = POOL_TABLE;
    cue.pocketed = false;
    cue.vx = 0;
    cue.vy = 0;
    let x = width * 0.25;
    const y = height / 2;
    for (let attempt = 0; attempt < 40; attempt++) {
      const collision = this.balls.some(
        (b) => b.id !== 0 && !b.pocketed && Math.hypot(b.x - x, b.y - y) < ballRadius * 2.4,
      );
      if (!collision) break;
      x -= ballRadius * 2.5;
      if (x < ballRadius * 2) x = width * 0.4;
    }
    cue.x = x;
    cue.y = y;
  }

  shoot(angle: number, power: number): boolean {
    if (!this.settled()) return false;
    const cue = this.cueBall;
    if (cue.pocketed) return false;
    const speed = POOL_MAX_SPEED * Math.min(1, Math.max(0, power));
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    this.outcome = { pocketedColors: [], cuePocketed: false };
    return true;
  }

  consumeOutcome(): PoolShotOutcome {
    const out = this.outcome;
    this.outcome = { pocketedColors: [], cuePocketed: false };
    return out;
  }

  step(dt: number = PHYSICS_DT): void {
    this.tick += 1;
    const { ballRadius, width, height } = POOL_TABLE;
    const damping = Math.exp(-this.frictionCoef * dt);

    for (const ball of this.balls) {
      if (ball.pocketed) continue;
      ball.vx *= damping;
      ball.vy *= damping;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed <= POOL_STOP_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
        continue;
      }
      const steps = Math.max(1, Math.ceil((speed * dt) / MAX_STEP));
      const sub = dt / steps;
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx * sub;
        ball.y += ball.vy * sub;

        if (this.checkPocket(ball)) break;

        if (ball.x < ballRadius) {
          ball.x = ballRadius;
          ball.vx = Math.abs(ball.vx) * CUSHION_RESTITUTION;
        } else if (ball.x > width - ballRadius) {
          ball.x = width - ballRadius;
          ball.vx = -Math.abs(ball.vx) * CUSHION_RESTITUTION;
        }
        if (ball.y < ballRadius) {
          ball.y = ballRadius;
          ball.vy = Math.abs(ball.vy) * CUSHION_RESTITUTION;
        } else if (ball.y > height - ballRadius) {
          ball.y = height - ballRadius;
          ball.vy = -Math.abs(ball.vy) * CUSHION_RESTITUTION;
        }
      }
    }

    this.resolveCollisions();
  }

  private checkPocket(ball: PoolBallState): boolean {
    for (const pocket of poolPockets()) {
      if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) <= POOL_TABLE.pocketRadius) {
        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        if (ball.id === 0) this.outcome.cuePocketed = true;
        else this.outcome.pocketedColors.push(ball.id);
        return true;
      }
    }
    return false;
  }

  private resolveCollisions(): void {
    const r2 = POOL_TABLE.ballRadius * 2;
    const active = this.balls.filter((b) => !b.pocketed);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= r2 || dist < 1e-9) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (r2 - dist) / 2 + 0.01;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const sep = rvx * nx + rvy * ny;
        if (sep > 0) continue;
        const impulse = -(1 + 0.96) * sep * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }
}

/** Orden clasico del triangulo de bola 8: la negra ocupa el centro. */
function eightBallRackOrder(): number[] {
  return [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
}

function sequentialOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
