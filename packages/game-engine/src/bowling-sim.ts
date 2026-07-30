import {
  BOWLING_LANE,
  BOWLING_PINS,
  PHYSICS_DT,
  bowlingPinLayout,
  type BowlingBallState,
  type BowlingPinState,
  type BowlingSnapshot,
} from '@arcade/shared';

interface Pin extends BowlingPinState {
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
}

const PIN_FRICTION = 3.2;
const BALL_FRICTION = 0.22;
/** La bola pesa mucho mas que un bolo: apenas se desvia al impactar. */
const BALL_MASS_RATIO = 0.12;
const MAX_STEP = 4;

/**
 * Simulacion de una tirada de bolos.
 *
 * El servidor la ejecuta con paso fijo y reparte snapshots; el cliente solo
 * dibuja. El efecto lateral se aplica como aceleracion mientras la bola avanza,
 * de modo que la curva depende de la velocidad y se siente predecible.
 */
export class BowlingWorld {
  private ball: BowlingBallState & { spin: number };
  private pins: Pin[];
  tick = 0;

  constructor(standingPinIds?: number[]) {
    const layout = bowlingPinLayout();
    const standing = standingPinIds ? new Set(standingPinIds) : null;
    this.pins = layout
      .filter((pin) => (standing ? standing.has(pin.id) : true))
      .map((pin) => ({
        id: pin.id,
        x: pin.x,
        y: pin.y,
        homeX: pin.x,
        homeY: pin.y,
        vx: 0,
        vy: 0,
        standing: true,
      }));
    this.ball = {
      x: BOWLING_LANE.width / 2,
      y: 0,
      vx: 0,
      vy: 0,
      rolling: false,
      gutter: false,
      spin: 0,
    };
  }

  get state(): BowlingSnapshot {
    return {
      tick: this.tick,
      ball: {
        x: round(this.ball.x),
        y: round(this.ball.y),
        vx: round(this.ball.vx),
        vy: round(this.ball.vy),
        rolling: this.ball.rolling,
        gutter: this.ball.gutter,
      },
      pins: this.pins.map((pin) => ({
        id: pin.id,
        x: round(pin.x),
        y: round(pin.y),
        standing: pin.standing,
      })),
      settled: this.settled(),
    };
  }

  get standingPins(): number[] {
    return this.pins.filter((pin) => pin.standing).map((pin) => pin.id);
  }

  /** Bolos derribados en esta tirada. */
  knockedCount(): number {
    return this.pins.filter((pin) => !pin.standing).length;
  }

  /**
   * Lanza la bola. `aim` desplaza el punto de salida, `power` fija la velocidad
   * y `spin` curva la trayectoria. Los tres llegan ya acotados por Zod.
   */
  roll(aim: number, power: number, spin: number): boolean {
    if (this.ball.rolling) return false;
    const usable = BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2;
    this.ball.x = BOWLING_LANE.width / 2 + aim * (usable / 2 - BOWLING_LANE.ballRadius);
    this.ball.y = 0;
    this.ball.vx = 0;
    this.ball.vy = BOWLING_LANE.maxSpeed * power;
    this.ball.spin = spin;
    this.ball.rolling = true;
    this.ball.gutter = false;
    return true;
  }

  settled(): boolean {
    if (this.ball.rolling) return false;
    return this.pins.every((pin) => Math.hypot(pin.vx, pin.vy) < 2);
  }

  step(dt: number = PHYSICS_DT): void {
    this.tick += 1;
    this.stepBall(dt);
    this.stepPins(dt);
    this.resolvePinCollisions();
    this.updateStanding();
  }

  private stepBall(dt: number): void {
    if (!this.ball.rolling) return;
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed <= 1) {
      this.ball.rolling = false;
      return;
    }

    if (!this.ball.gutter) {
      // El efecto empuja lateralmente mientras la bola conserva velocidad.
      this.ball.vx += this.ball.spin * 150 * dt * (this.ball.vy / BOWLING_LANE.maxSpeed);
    }
    const damping = Math.exp(-BALL_FRICTION * dt);
    this.ball.vx *= damping;
    this.ball.vy *= damping;

    const steps = Math.max(1, Math.ceil((speed * dt) / MAX_STEP));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.ball.x += this.ball.vx * sub;
      this.ball.y += this.ball.vy * sub;

      const min = BOWLING_LANE.gutterWidth + BOWLING_LANE.ballRadius;
      const max = BOWLING_LANE.width - BOWLING_LANE.gutterWidth - BOWLING_LANE.ballRadius;
      if (this.ball.x < min || this.ball.x > max) {
        // Canaleta: la bola sigue de largo pero ya no puede tocar ningun bolo.
        this.ball.gutter = true;
        this.ball.x = Math.max(
          BOWLING_LANE.ballRadius,
          Math.min(BOWLING_LANE.width - BOWLING_LANE.ballRadius, this.ball.x),
        );
        this.ball.vx = 0;
      }
      if (!this.ball.gutter) this.collideBallWithPins();

      if (this.ball.y > BOWLING_LANE.length + BOWLING_LANE.pinSpacing * 2) {
        this.ball.rolling = false;
        this.ball.vx = 0;
        this.ball.vy = 0;
        return;
      }
    }
  }

  private collideBallWithPins(): void {
    const min = BOWLING_LANE.ballRadius + BOWLING_LANE.pinRadius;
    for (const pin of this.pins) {
      const dx = pin.x - this.ball.x;
      const dy = pin.y - this.ball.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= min || distance < 1e-6) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      const impact = Math.hypot(this.ball.vx, this.ball.vy);
      pin.vx += nx * impact * 0.55 + this.ball.vx * 0.08;
      pin.vy += ny * impact * 0.55 + this.ball.vy * 0.08;
      pin.x = this.ball.x + nx * (min + 0.1);
      pin.y = this.ball.y + ny * (min + 0.1);

      // La bola apenas se desvia por la diferencia de masa.
      this.ball.vx -= nx * impact * BALL_MASS_RATIO;
      this.ball.vy -= ny * impact * BALL_MASS_RATIO * 0.4;
    }
  }

  private stepPins(dt: number): void {
    const damping = Math.exp(-PIN_FRICTION * dt);
    for (const pin of this.pins) {
      const speed = Math.hypot(pin.vx, pin.vy);
      if (speed < 1) {
        pin.vx = 0;
        pin.vy = 0;
        continue;
      }
      pin.vx *= damping;
      pin.vy *= damping;
      pin.x += pin.vx * dt;
      pin.y += pin.vy * dt;
    }
  }

  private resolvePinCollisions(): void {
    const min = BOWLING_LANE.pinRadius * 2;
    for (let i = 0; i < this.pins.length; i++) {
      for (let j = i + 1; j < this.pins.length; j++) {
        const a = this.pins[i]!;
        const b = this.pins[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= min || distance < 1e-6) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (min - distance) / 2 + 0.05;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const separating = rvx * nx + rvy * ny;
        if (separating > 0) continue;
        const impulse = -(1 + 0.55) * separating * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  private updateStanding(): void {
    for (const pin of this.pins) {
      if (!pin.standing) continue;
      const moved = Math.hypot(pin.x - pin.homeX, pin.y - pin.homeY);
      if (moved > BOWLING_LANE.knockDistance) pin.standing = false;
    }
  }

  /** Retira los bolos derribados y deja los demas en su sitio para el segundo lanzamiento. */
  prepareNextRoll(): void {
    this.pins = this.pins.filter((pin) => pin.standing);
    for (const pin of this.pins) {
      pin.x = pin.homeX;
      pin.y = pin.homeY;
      pin.vx = 0;
      pin.vy = 0;
    }
    this.resetBall();
  }

  /** Coloca de nuevo los diez bolos para empezar un frame. */
  resetFrame(): void {
    const layout = bowlingPinLayout();
    this.pins = layout.map((pin) => ({
      id: pin.id,
      x: pin.x,
      y: pin.y,
      homeX: pin.x,
      homeY: pin.y,
      vx: 0,
      vy: 0,
      standing: true,
    }));
    this.resetBall();
  }

  private resetBall(): void {
    this.ball.x = BOWLING_LANE.width / 2;
    this.ball.y = 0;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.spin = 0;
    this.ball.rolling = false;
    this.ball.gutter = false;
  }

  get pinCount(): number {
    return this.pins.length;
  }

  get allPinsDown(): boolean {
    return this.pins.every((pin) => !pin.standing) && this.pins.length === BOWLING_PINS;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
