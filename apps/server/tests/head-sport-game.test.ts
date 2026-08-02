import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  HEAD_SPORT_FIELD,
  type GamePublicState,
  type MatchResult,
} from '@arcade/shared';
import type { HeadSportWorld } from '@arcade/game-engine';
import { HeadSportGame } from '../src/games/head-sport-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

const players: RoomPlayer[] = ['Ana', 'Bea', 'Caro'].map((name, index) => ({
  id: String.fromCharCode(97 + index),
  token: 'token-' + index,
  name,
  color: index ? '#f00' : '#0ff',
  icon: index ? 'triangle' : 'circle',
  isHost: index === 0,
  ready: true,
  connection: 'connected',
  socketId: 'socket-' + index,
  joinedAt: index,
  disconnectedAt: null,
}));

function setup(gameId: 'head-soccer' | 'head-basketball' = 'head-soccer') {
  const states: GamePublicState[] = [];
  const events: unknown[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state),
    broadcastEvent: (event) => events.push(event),
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  const game = new HeadSportGame(gameId, ctx, DEFAULT_SETTINGS[gameId]);
  return { game, states, events, results };
}

function worldOf(game: HeadSportGame): HeadSportWorld {
  return (game as unknown as { world: HeadSportWorld }).world;
}

describe('partidas de Head Soccer y Head Basketball', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reparte equipos y empieza tras la cuenta atrás', () => {
    const { game } = setup();
    game.start();
    expect(game.publicState().phase).toBe('countdown');
    expect(game.publicState().teams).toEqual({ a: 'rojo', b: 'azul', c: 'rojo' });
    vi.advanceTimersByTime(3_200);
    expect(game.publicState().phase).toBe('playing');
    game.dispose();
  });

  it('ignora entradas de otro deporte', () => {
    const { game } = setup('head-soccer');
    game.start();
    vi.advanceTimersByTime(3_200);
    const before = game.publicState().players.find((player) => player.playerId === 'a')!;
    game.handleAction('a', {
      type: 'head-sport:input',
      game: 'head-basketball',
      moveX: 1,
      jump: true,
      kick: true,
    });
    vi.advanceTimersByTime(400);
    const after = game.publicState().players.find((player) => player.playerId === 'a')!;
    expect(after.x).toBe(before.x);
    expect(after.onGround).toBe(true);
    game.dispose();
  });

  it('termina al alcanzar el marcador y premia a todo el equipo', () => {
    const { game, events, results } = setup('head-soccer');
    game.start();
    vi.advanceTimersByTime(3_200);
    const world = worldOf(game);
    world.scores.rojo = game.publicState().targetScore - 1;
    world.resetMs = 0;
    world.ball.x = HEAD_SPORT_FIELD.width + world.ball.radius + 2;
    world.ball.y = HEAD_SPORT_FIELD.groundY - world.ball.radius;
    world.ball.vx = 400;
    vi.advanceTimersByTime(50);

    expect(results).toHaveLength(1);
    expect(results[0]?.game).toBe('head-soccer');
    expect(results[0]?.winnerIds).toEqual(['a', 'c']);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'head-score', team: 'rojo' }));
    expect(game.publicState().phase).toBe('finished');
    game.dispose();
  });

  it('usa seis puntos como objetivo del baloncesto rápido', () => {
    const { game } = setup('head-basketball');
    const custom = new HeadSportGame(
      'head-basketball',
      (game as unknown as { ctx: GameContext }).ctx,
      { mode: 'rapido', pointsToWin: 14 },
    );
    expect(custom.publicState().targetScore).toBe(6);
    game.dispose();
    custom.dispose();
  });

  it('finaliza si un equipo se queda sin jugadores', () => {
    const { game, results } = setup('head-basketball');
    game.start();
    vi.advanceTimersByTime(3_200);
    game.onPlayerLeft('b');
    expect(results).toHaveLength(1);
    expect(results[0]?.winnerIds).toEqual(['a', 'c']);
    game.dispose();
  });
});
