import { describe, expect, it } from 'vitest';
import { PHYSICS_DT, SPORT_FIELD, type TeamId } from '@arcade/shared';
import { ArcadeSportWorld } from '../src/arcade-sport-sim.js';

const teams: Record<string, TeamId> = { red: 'rojo', blue: 'azul' };

describe('ArcadeSportWorld', () => {
  it('mantiene cada mazo de Air Hockey dentro de su mitad', () => {
    const world = new ArcadeSportWorld('air-hockey', ['red', 'blue'], teams);
    world.running = true;
    world.setInput('red', { x: 1, y: 0 });
    world.setInput('blue', { x: 0, y: 1 });
    for (let i = 0; i < 180; i++) world.step(PHYSICS_DT);

    const red = world.states.find((paddle) => paddle.playerId === 'red')!;
    const blue = world.states.find((paddle) => paddle.playerId === 'blue')!;
    expect(red.x).toBeLessThanOrEqual(SPORT_FIELD.width / 2 - SPORT_FIELD.hockeyPaddleRadius);
    expect(blue.x).toBeGreaterThanOrEqual(SPORT_FIELD.width / 2 + SPORT_FIELD.hockeyPaddleRadius);
    expect(red.y).toBeGreaterThanOrEqual(SPORT_FIELD.margin + SPORT_FIELD.hockeyPaddleRadius);
    expect(blue.y).toBeLessThanOrEqual(
      SPORT_FIELD.height - SPORT_FIELD.margin - SPORT_FIELD.hockeyPaddleRadius,
    );
  });

  it('solo concede gol de Air Hockey al cruzar la portería', () => {
    const world = new ArcadeSportWorld('air-hockey', ['red', 'blue'], teams);
    world.running = true;
    world.serveMs = 0;
    world.ball.x = -world.ball.radius - 2;
    world.ball.y = SPORT_FIELD.height / 2;
    world.ball.vx = -400;
    world.step(PHYSICS_DT);
    expect(world.scores.azul).toBe(1);
    expect(world.drainEvents()).toContainEqual(
      expect.objectContaining({ kind: 'sport-goal', team: 'azul' }),
    );
  });

  it('rebota la pelota de tenis y cambia el ángulo según el impacto', () => {
    const world = new ArcadeSportWorld('table-tennis', ['red', 'blue'], teams);
    world.running = true;
    world.serveMs = 0;
    const paddle = world.states.find((entry) => entry.playerId === 'red')!;
    world.ball.x = paddle.x + SPORT_FIELD.tennisPaddleWidth / 2 + world.ball.radius + 3;
    world.ball.y = paddle.y + SPORT_FIELD.tennisPaddleHeight * 0.3;
    world.ball.vx = -500;
    world.ball.vy = 0;
    world.step(PHYSICS_DT);
    expect(world.ball.vx).toBeGreaterThan(0);
    expect(world.ball.vy).toBeGreaterThan(0);
  });

  it('elimina la pala de quien abandona sin alterar al rival', () => {
    const world = new ArcadeSportWorld('table-tennis', ['red', 'blue'], teams);
    world.removePlayer('red');
    expect(world.hasTeam('rojo')).toBe(false);
    expect(world.hasTeam('azul')).toBe(true);
    expect(world.states.map((paddle) => paddle.playerId)).toEqual(['blue']);
  });
});
