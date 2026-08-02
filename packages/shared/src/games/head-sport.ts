import type { TeamId } from './modes.js';

export type HeadSportId = 'head-soccer' | 'head-basketball';

export const HEAD_SPORT_FIELD = {
  width: 1000,
  height: 600,
  margin: 28,
  groundY: 526,
  playerRadius: 42,
  headRadius: 34,
  soccerBallRadius: 25,
  basketballRadius: 23,
  goalTop: 326,
  goalDepth: 78,
  hoopY: 246,
  hoopX: 104,
  rimHalfWidth: 42,
} as const;

export interface HeadSportPlayer {
  playerId: string;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  onGround: boolean;
  kickMs: number;
}

export interface HeadSportBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spin: number;
}

export interface HeadSportSnapshot {
  tick: number;
  matchMs: number;
  players: HeadSportPlayer[];
  ball: HeadSportBall;
  scores: Record<TeamId, number>;
  teams: Record<string, TeamId>;
  resetMs: number;
  lastScoringTeam: TeamId | null;
}

export interface HeadSportInput {
  moveX: number;
  jump: boolean;
  kick: boolean;
}
