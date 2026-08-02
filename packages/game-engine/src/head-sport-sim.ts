import {
  HEAD_SPORT_FIELD,
  PHYSICS_DT,
  type HeadSportBall,
  type HeadSportId,
  type HeadSportInput,
  type HeadSportPlayer,
  type HeadSportSnapshot,
  type TeamId,
} from '@arcade/shared';

const RESET_DELAY_MS = 950;

export interface HeadSportEvent {
  kind: 'head-score' | 'head-kick';
  team?: TeamId;
  playerId?: string;
  value?: 'Gol' | 'Canasta';
  atMs: number;
}

interface InternalPlayer extends HeadSportPlayer {
  input: HeadSportInput;
  jumpQueued: boolean;
  kickQueued: boolean;
}

/** Simulación determinista para los dos deportes laterales de cabezones. */
export class HeadSportWorld {
  private playersById = new Map<string, InternalPlayer>();
  private events: HeadSportEvent[] = [];

  readonly scores: Record<TeamId, number> = { rojo: 0, azul: 0 };
  ball: HeadSportBall;
  matchMs = 0;
  tick = 0;
  running = false;
  resetMs = RESET_DELAY_MS;
  lastScoringTeam: TeamId | null = null;

  constructor(
    readonly game: HeadSportId,
    playerIds: string[],
    readonly teams: Record<string, TeamId>,
    private readonly speedScale = 1,
    private readonly gravityScale = 1,
  ) {
    for (const id of playerIds) this.playersById.set(id, this.createPlayer(id));
    this.ball = this.centerBall();
  }

  get states(): HeadSportPlayer[] {
    return [...this.playersById.values()].map(
      ({ playerId, team, x, y, vx, vy, facing, onGround, kickMs }) => ({
        playerId,
        team,
        x: round(x),
        y: round(y),
        vx: round(vx),
        vy: round(vy),
        facing,
        onGround,
        kickMs: Math.max(0, Math.round(kickMs)),
      }),
    );
  }

  snapshot(): HeadSportSnapshot {
    return {
      tick: this.tick,
      matchMs: Math.round(this.matchMs),
      players: this.states,
      ball: {
        ...this.ball,
        x: round(this.ball.x),
        y: round(this.ball.y),
        vx: round(this.ball.vx),
        vy: round(this.ball.vy),
      },
      scores: { ...this.scores },
      teams: { ...this.teams },
      resetMs: Math.max(0, Math.round(this.resetMs)),
      lastScoringTeam: this.lastScoringTeam,
    };
  }

  setInput(playerId: string, input: HeadSportInput): void {
    const player = this.playersById.get(playerId);
    if (!player) return;
    const moveX = clamp(input.moveX, -1, 1);
    if (input.jump && !player.input.jump) player.jumpQueued = true;
    if (input.kick && !player.input.kick) player.kickQueued = true;
    player.input = { moveX, jump: input.jump, kick: input.kick };
  }

  removePlayer(playerId: string): void {
    this.playersById.delete(playerId);
  }

  hasTeam(team: TeamId): boolean {
    return [...this.playersById.values()].some((player) => player.team === team);
  }

  drainEvents(): HeadSportEvent[] {
    const result = this.events.slice();
    this.events.length = 0;
    return result;
  }

  step(dt = PHYSICS_DT): void {
    this.tick += 1;
    if (!this.running) return;
    this.matchMs += dt * 1000;
    this.movePlayers(dt);
    this.resolvePlayerCollisions();

    if (this.resetMs > 0) {
      this.resetMs = Math.max(0, this.resetMs - dt * 1000);
      if (this.resetMs === 0) this.launchBall();
      return;
    }

    const previousBallY = this.ball.y;
    this.moveBall(dt);
    this.resolveBallPlayers();
    if (this.game === 'head-soccer') this.resolveSoccerBounds();
    else this.resolveBasketballBounds(previousBallY);
    this.limitBallSpeed();
  }

  private movePlayers(dt: number): void {
    const { margin, width, groundY, playerRadius } = HEAD_SPORT_FIELD;
    const maxSpeed = 305 * this.speedScale;
    const acceleration = 1850 * this.speedScale;
    const gravity = 1320 * this.gravityScale;
    const jumpVelocity =
      (this.game === 'head-basketball' ? 610 : 565) * (this.gravityScale < 1 ? 1.08 : 1);

    for (const player of this.playersById.values()) {
      const target = player.input.moveX * maxSpeed;
      player.vx = approach(player.vx, target, acceleration * dt);
      if (Math.abs(player.input.moveX) > 0.05) player.facing = player.input.moveX > 0 ? 1 : -1;
      if (player.jumpQueued && player.onGround) {
        player.vy = -jumpVelocity;
        player.onGround = false;
      }
      player.jumpQueued = false;
      player.vy += gravity * dt;
      player.x = clamp(
        player.x + player.vx * dt,
        margin + playerRadius,
        width - margin - playerRadius,
      );
      player.y += player.vy * dt;
      const floor = groundY - playerRadius;
      if (player.y >= floor) {
        player.y = floor;
        player.vy = 0;
        player.onGround = true;
      }
      player.kickMs = Math.max(0, player.kickMs - dt * 1000);
      if (player.kickQueued && player.kickMs === 0) {
        this.tryKick(player);
        player.kickMs = 330;
      }
      player.kickQueued = false;
    }
  }

  private moveBall(dt: number): void {
    const gravity = (this.game === 'head-basketball' ? 1050 : 1120) * this.gravityScale;
    this.ball.vy += gravity * dt;
    this.ball.vx *= Math.pow(0.995, dt * 60);
    this.ball.spin *= Math.pow(0.985, dt * 60);
    this.ball.vx += this.ball.spin * 5 * dt;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    const ceiling = HEAD_SPORT_FIELD.margin + this.ball.radius;
    const floor = HEAD_SPORT_FIELD.groundY - this.ball.radius;
    if (this.ball.y < ceiling) {
      this.ball.y = ceiling;
      this.ball.vy = Math.abs(this.ball.vy) * 0.76;
    }
    if (this.ball.y > floor) {
      this.ball.y = floor;
      this.ball.vy = -Math.abs(this.ball.vy) * (this.game === 'head-basketball' ? 0.79 : 0.7);
      this.ball.vx *= 0.94;
      if (Math.abs(this.ball.vy) < 55) this.ball.vy = 0;
    }
  }

  private resolveBallPlayers(): void {
    for (const player of this.playersById.values()) {
      const dx = this.ball.x - player.x;
      const dy = this.ball.y - player.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = HEAD_SPORT_FIELD.playerRadius + this.ball.radius;
      if (distance >= minDistance || distance < 0.001) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      this.ball.x = player.x + nx * minDistance;
      this.ball.y = player.y + ny * minDistance;
      const relative = (this.ball.vx - player.vx) * nx + (this.ball.vy - player.vy) * ny;
      if (relative < 0) {
        const bounce = -relative * 1.48;
        this.ball.vx += nx * bounce + player.vx * 0.18;
        this.ball.vy += ny * bounce + player.vy * 0.12;
        this.ball.spin += player.vx * 0.02;
      }
    }
  }

  private resolveSoccerBounds(): void {
    const { margin, width, goalTop } = HEAD_SPORT_FIELD;
    const inGoalMouth = this.ball.y + this.ball.radius >= goalTop;
    if (!inGoalMouth && this.ball.x - this.ball.radius < margin) {
      this.ball.x = margin + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.82;
    } else if (!inGoalMouth && this.ball.x + this.ball.radius > width - margin) {
      this.ball.x = width - margin - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.82;
    }
    if (this.ball.x < -this.ball.radius) this.score('azul', 1);
    else if (this.ball.x > width + this.ball.radius) this.score('rojo', 1);
  }

  private resolveBasketballBounds(previousBallY: number): void {
    const { margin, width, hoopX, hoopY, rimHalfWidth } = HEAD_SPORT_FIELD;
    const crossingDown = previousBallY <= hoopY && this.ball.y > hoopY && this.ball.vy > 0;
    if (crossingDown) {
      if (Math.abs(this.ball.x - hoopX) < rimHalfWidth - this.ball.radius * 0.35) {
        this.score('azul', 2);
        return;
      }
      if (Math.abs(this.ball.x - (width - hoopX)) < rimHalfWidth - this.ball.radius * 0.35) {
        this.score('rojo', 2);
        return;
      }
    }

    this.collideRim(hoopX - rimHalfWidth, hoopY);
    this.collideRim(hoopX + rimHalfWidth, hoopY);
    this.collideRim(width - hoopX - rimHalfWidth, hoopY);
    this.collideRim(width - hoopX + rimHalfWidth, hoopY);
    if (this.ball.x - this.ball.radius < margin) {
      this.ball.x = margin + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.82;
    } else if (this.ball.x + this.ball.radius > width - margin) {
      this.ball.x = width - margin - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.82;
    }
  }

  private collideRim(x: number, y: number): void {
    const dx = this.ball.x - x;
    const dy = this.ball.y - y;
    const distance = Math.hypot(dx, dy);
    const minDistance = this.ball.radius + 8;
    if (distance >= minDistance || distance < 0.001) return;
    const nx = dx / distance;
    const ny = dy / distance;
    this.ball.x = x + nx * minDistance;
    this.ball.y = y + ny * minDistance;
    const toward = this.ball.vx * nx + this.ball.vy * ny;
    if (toward < 0) {
      this.ball.vx -= 1.72 * toward * nx;
      this.ball.vy -= 1.72 * toward * ny;
    }
  }

  private tryKick(player: InternalPlayer): void {
    const dx = this.ball.x - player.x;
    const dy = this.ball.y - player.y;
    const reach = HEAD_SPORT_FIELD.playerRadius + this.ball.radius + 38;
    if (Math.hypot(dx, dy) > reach) return;

    if (this.game === 'head-soccer') {
      const power = 690 * this.speedScale;
      this.ball.vx = player.facing * power + player.vx * 0.22;
      this.ball.vy = -310 * this.speedScale + Math.min(0, player.vy * 0.18);
      this.ball.spin = player.facing * 24;
    } else {
      const targetX =
        player.team === 'rojo'
          ? HEAD_SPORT_FIELD.width - HEAD_SPORT_FIELD.hoopX
          : HEAD_SPORT_FIELD.hoopX;
      const targetY = HEAD_SPORT_FIELD.hoopY - 96;
      const tx = targetX - this.ball.x;
      const ty = targetY - this.ball.y;
      const length = Math.max(1, Math.hypot(tx, ty));
      const power = 760 * this.speedScale;
      this.ball.vx = (tx / length) * power + player.vx * 0.12;
      this.ball.vy = Math.min((ty / length) * power, -430 * (this.gravityScale < 1 ? 1.08 : 1));
      this.ball.spin = player.facing * 18;
    }
    this.events.push({ kind: 'head-kick', playerId: player.playerId, atMs: this.matchMs });
  }

  private resolvePlayerCollisions(): void {
    const players = [...this.playersById.values()];
    const minDistance = HEAD_SPORT_FIELD.playerRadius * 1.55;
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const a = players[i]!;
        const b = players[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= minDistance || distance < 0.001) continue;
        const overlap = (minDistance - distance) / 2;
        const nx = dx / distance;
        a.x -= nx * overlap;
        b.x += nx * overlap;
        const minX = HEAD_SPORT_FIELD.margin + HEAD_SPORT_FIELD.playerRadius;
        const maxX = HEAD_SPORT_FIELD.width - minX;
        a.x = clamp(a.x, minX, maxX);
        b.x = clamp(b.x, minX, maxX);
        const exchange = (b.vx - a.vx) * 0.18;
        a.vx += exchange;
        b.vx -= exchange;
      }
    }
  }

  private score(team: TeamId, points: number): void {
    this.scores[team] += points;
    this.lastScoringTeam = team;
    this.events.push({
      kind: 'head-score',
      team,
      value: this.game === 'head-soccer' ? 'Gol' : 'Canasta',
      atMs: this.matchMs,
    });
    this.resetPositions();
  }

  private resetPositions(): void {
    for (const [id, previous] of this.playersById) {
      const fresh = this.createPlayer(id);
      fresh.input = previous.input;
      this.playersById.set(id, fresh);
    }
    this.ball = this.centerBall();
    this.resetMs = RESET_DELAY_MS;
  }

  private launchBall(): void {
    const direction = this.tick % 2 === 0 ? 1 : -1;
    this.ball.vx = direction * 135 * this.speedScale;
    this.ball.vy = this.game === 'head-basketball' ? -425 / Math.sqrt(this.gravityScale) : -315;
  }

  private centerBall(): HeadSportBall {
    return {
      x: HEAD_SPORT_FIELD.width / 2,
      y: this.game === 'head-basketball' ? 252 : 315,
      vx: 0,
      vy: 0,
      radius:
        this.game === 'head-basketball'
          ? HEAD_SPORT_FIELD.basketballRadius
          : HEAD_SPORT_FIELD.soccerBallRadius,
      spin: 0,
    };
  }

  private createPlayer(id: string): InternalPlayer {
    const team = this.teams[id] ?? 'rojo';
    const teammates = Object.keys(this.teams).filter((entry) => this.teams[entry] === team);
    const index = Math.max(0, teammates.indexOf(id));
    const x = team === 'rojo' ? 250 + index * 74 : HEAD_SPORT_FIELD.width - 250 - index * 74;
    return {
      playerId: id,
      team,
      x,
      y: HEAD_SPORT_FIELD.groundY - HEAD_SPORT_FIELD.playerRadius,
      vx: 0,
      vy: 0,
      facing: team === 'rojo' ? 1 : -1,
      onGround: true,
      kickMs: 0,
      input: { moveX: 0, jump: false, kick: false },
      jumpQueued: false,
      kickQueued: false,
    };
  }

  private limitBallSpeed(): void {
    const max = 980 * this.speedScale;
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed <= max || speed === 0) return;
    this.ball.vx = (this.ball.vx / speed) * max;
    this.ball.vy = (this.ball.vy / speed) * max;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
