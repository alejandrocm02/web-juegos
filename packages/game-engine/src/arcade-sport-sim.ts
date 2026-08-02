import {
  PHYSICS_DT,
  SPORT_FIELD,
  type ArcadeSportBall,
  type ArcadeSportId,
  type ArcadeSportInput,
  type ArcadeSportPaddle,
  type ArcadeSportSnapshot,
  type TeamId,
} from '@arcade/shared';

const SERVE_DELAY_MS = 900;

export interface ArcadeSportEvent {
  kind: 'sport-goal' | 'sport-hit';
  team?: TeamId;
  playerId?: string;
  atMs: number;
}

interface InternalPaddle extends ArcadeSportPaddle {
  targetX: number;
  targetY: number;
}

/**
 * Simulación compartida y autoritativa de los dos deportes de pala.
 * El navegador solo propone una posición normalizada; límites, colisiones,
 * goles y velocidad se resuelven aquí con paso fijo.
 */
export class ArcadeSportWorld {
  private paddles = new Map<string, InternalPaddle>();
  private events: ArcadeSportEvent[] = [];
  private serveDirection = 1;

  readonly scores: Record<TeamId, number> = { rojo: 0, azul: 0 };
  ball: ArcadeSportBall;
  matchMs = 0;
  tick = 0;
  running = false;
  serveMs = SERVE_DELAY_MS;
  lastScoringTeam: TeamId | null = null;

  constructor(
    readonly game: ArcadeSportId,
    playerIds: string[],
    readonly teams: Record<string, TeamId>,
    private readonly speedScale = 1,
  ) {
    const grouped: Record<TeamId, string[]> = { rojo: [], azul: [] };
    for (const id of playerIds) grouped[teams[id] ?? 'rojo'].push(id);
    for (const team of ['rojo', 'azul'] as const) {
      grouped[team].forEach((id, index) => {
        const y = ((index + 1) / (grouped[team].length + 1)) * SPORT_FIELD.height;
        const x = this.spawnX(team, index);
        this.paddles.set(id, { playerId: id, team, x, y, targetX: x, targetY: y });
      });
    }
    this.ball = this.centerBall();
  }

  get states(): ArcadeSportPaddle[] {
    return [...this.paddles.values()].map(({ playerId, team, x, y }) => ({
      playerId,
      team,
      x: round(x),
      y: round(y),
    }));
  }

  snapshot(): ArcadeSportSnapshot {
    return {
      tick: this.tick,
      matchMs: Math.round(this.matchMs),
      paddles: this.states,
      ball: { ...this.ball, x: round(this.ball.x), y: round(this.ball.y) },
      scores: { ...this.scores },
      teams: { ...this.teams },
      serveMs: Math.max(0, Math.round(this.serveMs)),
      lastScoringTeam: this.lastScoringTeam,
    };
  }

  setInput(playerId: string, input: ArcadeSportInput): void {
    const paddle = this.paddles.get(playerId);
    if (!paddle) return;
    const normalizedX = clamp(input.x, 0, 1);
    const normalizedY = clamp(input.y, 0, 1);
    if (this.game === 'air-hockey') {
      const radius = SPORT_FIELD.hockeyPaddleRadius;
      const minX =
        paddle.team === 'rojo' ? SPORT_FIELD.margin + radius : SPORT_FIELD.width / 2 + radius;
      const maxX =
        paddle.team === 'rojo'
          ? SPORT_FIELD.width / 2 - radius
          : SPORT_FIELD.width - SPORT_FIELD.margin - radius;
      paddle.targetX = minX + normalizedX * (maxX - minX);
      paddle.targetY =
        SPORT_FIELD.margin +
        radius +
        normalizedY * (SPORT_FIELD.height - (SPORT_FIELD.margin + radius) * 2);
    } else {
      paddle.targetY =
        SPORT_FIELD.margin +
        SPORT_FIELD.tennisPaddleHeight / 2 +
        normalizedY *
          (SPORT_FIELD.height - SPORT_FIELD.margin * 2 - SPORT_FIELD.tennisPaddleHeight);
    }
  }

  removePlayer(playerId: string): void {
    this.paddles.delete(playerId);
  }

  hasTeam(team: TeamId): boolean {
    return [...this.paddles.values()].some((paddle) => paddle.team === team);
  }

  drainEvents(): ArcadeSportEvent[] {
    const result = this.events.slice();
    this.events.length = 0;
    return result;
  }

  step(dt = PHYSICS_DT): void {
    this.tick += 1;
    if (!this.running) return;
    this.matchMs += dt * 1000;
    this.movePaddles(dt);
    if (this.serveMs > 0) {
      this.serveMs = Math.max(0, this.serveMs - dt * 1000);
      if (this.serveMs === 0) this.launchServe();
      return;
    }
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    if (this.game === 'air-hockey') this.stepHockey();
    else this.stepTennis();
  }

  private movePaddles(dt: number): void {
    const maxStep = (this.game === 'air-hockey' ? 470 : 560) * this.speedScale * dt;
    for (const paddle of this.paddles.values()) {
      const dx = paddle.targetX - paddle.x;
      const dy = paddle.targetY - paddle.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= maxStep || distance === 0) {
        paddle.x = paddle.targetX;
        paddle.y = paddle.targetY;
      } else {
        paddle.x += (dx / distance) * maxStep;
        paddle.y += (dy / distance) * maxStep;
      }
    }
  }

  private stepHockey(): void {
    const { margin, width, height, goalHalfHeight, hockeyPuckRadius: radius } = SPORT_FIELD;
    if (this.ball.y - radius < margin) {
      this.ball.y = margin + radius;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + radius > height - margin) {
      this.ball.y = height - margin - radius;
      this.ball.vy = -Math.abs(this.ball.vy);
    }

    const inGoal = Math.abs(this.ball.y - height / 2) <= goalHalfHeight;
    if (!inGoal && this.ball.x - radius < margin) {
      this.ball.x = margin + radius;
      this.ball.vx = Math.abs(this.ball.vx);
    } else if (!inGoal && this.ball.x + radius > width - margin) {
      this.ball.x = width - margin - radius;
      this.ball.vx = -Math.abs(this.ball.vx);
    }

    for (const paddle of this.paddles.values()) {
      const dx = this.ball.x - paddle.x;
      const dy = this.ball.y - paddle.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = radius + SPORT_FIELD.hockeyPaddleRadius;
      if (distance >= minDistance || distance < 0.001) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const toward = this.ball.vx * nx + this.ball.vy * ny;
      this.ball.x = paddle.x + nx * minDistance;
      this.ball.y = paddle.y + ny * minDistance;
      if (toward < 0) {
        const speed = clamp(
          Math.hypot(this.ball.vx, this.ball.vy) * 1.035,
          360,
          720 * this.speedScale,
        );
        this.ball.vx = nx * speed;
        this.ball.vy = ny * speed;
        this.events.push({ kind: 'sport-hit', playerId: paddle.playerId, atMs: this.matchMs });
      }
    }

    if (this.ball.x < -radius) this.scorePoint('azul');
    else if (this.ball.x > width + radius) this.scorePoint('rojo');
  }

  private stepTennis(): void {
    const { margin, width, height, tennisBallRadius: radius } = SPORT_FIELD;
    if (this.ball.y - radius < margin) {
      this.ball.y = margin + radius;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + radius > height - margin) {
      this.ball.y = height - margin - radius;
      this.ball.vy = -Math.abs(this.ball.vy);
    }

    for (const paddle of this.paddles.values()) {
      const halfW = SPORT_FIELD.tennisPaddleWidth / 2;
      const halfH = SPORT_FIELD.tennisPaddleHeight / 2;
      const movingToward = paddle.team === 'rojo' ? this.ball.vx < 0 : this.ball.vx > 0;
      if (!movingToward) continue;
      const overlapX = Math.abs(this.ball.x - paddle.x) <= halfW + radius;
      const overlapY = Math.abs(this.ball.y - paddle.y) <= halfH + radius;
      if (!overlapX || !overlapY) continue;
      const direction = paddle.team === 'rojo' ? 1 : -1;
      const hitOffset = clamp((this.ball.y - paddle.y) / halfH, -1, 1);
      const speed = clamp(
        Math.hypot(this.ball.vx, this.ball.vy) * 1.055,
        440,
        840 * this.speedScale,
      );
      this.ball.x = paddle.x + direction * (halfW + radius);
      this.ball.vx = direction * speed * Math.cos(hitOffset * 0.62);
      this.ball.vy = speed * Math.sin(hitOffset * 0.62);
      this.events.push({ kind: 'sport-hit', playerId: paddle.playerId, atMs: this.matchMs });
    }

    if (this.ball.x < -radius) this.scorePoint('azul');
    else if (this.ball.x > width + radius) this.scorePoint('rojo');
  }

  private scorePoint(team: TeamId): void {
    this.scores[team] += 1;
    this.lastScoringTeam = team;
    this.events.push({ kind: 'sport-goal', team, atMs: this.matchMs });
    this.serveDirection = team === 'rojo' ? -1 : 1;
    this.ball = this.centerBall();
    this.serveMs = SERVE_DELAY_MS;
  }

  private launchServe(): void {
    const base = (this.game === 'air-hockey' ? 390 : 470) * this.speedScale;
    const vertical = ((this.tick % 7) - 3) * 24;
    this.ball.vx = this.serveDirection * base;
    this.ball.vy = vertical === 0 ? 72 : vertical;
    this.serveDirection *= -1;
  }

  private centerBall(): ArcadeSportBall {
    return {
      x: SPORT_FIELD.width / 2,
      y: SPORT_FIELD.height / 2,
      vx: 0,
      vy: 0,
      radius:
        this.game === 'air-hockey' ? SPORT_FIELD.hockeyPuckRadius : SPORT_FIELD.tennisBallRadius,
    };
  }

  private spawnX(team: TeamId, index: number): number {
    if (this.game === 'air-hockey') {
      const offset = (index % 2) * 95;
      return team === 'rojo' ? 245 - offset : SPORT_FIELD.width - 245 + offset;
    }
    const offset = (index % 2) * 54;
    return team === 'rojo' ? 82 + offset : SPORT_FIELD.width - 82 - offset;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
