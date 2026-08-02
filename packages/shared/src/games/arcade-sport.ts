import type { TeamId } from './modes.js';

export type ArcadeSportId = 'air-hockey' | 'table-tennis';

export const SPORT_FIELD = {
  width: 1000,
  height: 600,
  margin: 26,
  goalHalfHeight: 105,
  hockeyPaddleRadius: 38,
  hockeyPuckRadius: 19,
  tennisPaddleWidth: 20,
  tennisPaddleHeight: 118,
  tennisBallRadius: 12,
} as const;

export interface ArcadeSportPaddle {
  playerId: string;
  team: TeamId;
  x: number;
  y: number;
}

export interface ArcadeSportBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface ArcadeSportSnapshot {
  tick: number;
  matchMs: number;
  paddles: ArcadeSportPaddle[];
  ball: ArcadeSportBall;
  scores: Record<TeamId, number>;
  teams: Record<string, TeamId>;
  serveMs: number;
  lastScoringTeam: TeamId | null;
}

export interface ArcadeSportInput {
  x: number;
  y: number;
}
