import { describe, expect, it } from 'vitest';
import { HEAD_SPORT_FIELD, PHYSICS_DT, type TeamId } from '@arcade/shared';
import { HeadSportWorld } from '../src/head-sport-sim.js';

const teams: Record<string, TeamId> = { red: 'rojo', blue: 'azul' };

function start(game: 'head-soccer' | 'head-basketball') {
  const world = new HeadSportWorld(game, ['red', 'blue'], teams);
  world.running = true;
  world.resetMs = 0;
  return world;
}

describe('HeadSportWorld', () => {
  it('limita el movimiento, salta y vuelve al suelo', () => {
    const world = start('head-soccer');
    world.setInput('red', { moveX: -1, jump: true, kick: false });
    world.step(PHYSICS_DT);
    expect(world.states.find((player) => player.playerId === 'red')?.onGround).toBe(false);
    world.setInput('red', { moveX: -1, jump: false, kick: false });
    for (let index = 0; index < 240; index += 1) world.step(PHYSICS_DT);
    const player = world.states.find((entry) => entry.playerId === 'red')!;
    expect(player.x).toBeGreaterThanOrEqual(
      HEAD_SPORT_FIELD.margin + HEAD_SPORT_FIELD.playerRadius,
    );
    expect(player.onGround).toBe(true);
  });

  it('concede un gol solo al cruzar por debajo del larguero', () => {
    const world = start('head-soccer');
    world.ball.x = -world.ball.radius - 2;
    world.ball.y = HEAD_SPORT_FIELD.groundY - world.ball.radius;
    world.ball.vx = -400;
    world.step(PHYSICS_DT);
    expect(world.scores.azul).toBe(1);
    expect(world.drainEvents()).toContainEqual(
      expect.objectContaining({ kind: 'head-score', team: 'azul' }),
    );
  });

  it('rechaza el balón contra la pared cuando pasa por encima de la portería', () => {
    const world = start('head-soccer');
    world.ball.x = HEAD_SPORT_FIELD.margin + world.ball.radius - 2;
    world.ball.y = HEAD_SPORT_FIELD.goalTop - world.ball.radius - 8;
    world.ball.vx = -420;
    world.ball.vy = 0;
    world.step(PHYSICS_DT);
    expect(world.scores.azul).toBe(0);
    expect(world.ball.vx).toBeGreaterThan(0);
  });

  it('cuenta una canasta descendente como dos puntos', () => {
    const world = start('head-basketball');
    world.ball.x = HEAD_SPORT_FIELD.width - HEAD_SPORT_FIELD.hoopX;
    world.ball.y = HEAD_SPORT_FIELD.hoopY - 3;
    world.ball.vx = 0;
    world.ball.vy = 260;
    world.step(PHYSICS_DT);
    expect(world.scores.rojo).toBe(2);
    expect(world.lastScoringTeam).toBe('rojo');
  });

  it('el golpe cercano impulsa el balón y respeta el tiempo de recarga', () => {
    const world = start('head-soccer');
    const player = world.states.find((entry) => entry.playerId === 'red')!;
    world.ball.x = player.x + HEAD_SPORT_FIELD.playerRadius + world.ball.radius;
    world.ball.y = player.y;
    world.setInput('red', { moveX: 0, jump: false, kick: true });
    world.step(PHYSICS_DT);
    expect(world.ball.vx).toBeGreaterThan(500);
    expect(world.states.find((entry) => entry.playerId === 'red')?.kickMs).toBeGreaterThan(0);
    expect(world.drainEvents()).toContainEqual(
      expect.objectContaining({ kind: 'head-kick', playerId: 'red' }),
    );
  });

  it('retira a quien abandona sin eliminar al equipo rival', () => {
    const world = start('head-basketball');
    world.removePlayer('red');
    expect(world.hasTeam('rojo')).toBe(false);
    expect(world.hasTeam('azul')).toBe(true);
  });
});
