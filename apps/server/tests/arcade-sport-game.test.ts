import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SPORT_FIELD,
  type GamePublicState,
  type MatchResult,
} from '@arcade/shared';
import type { ArcadeSportWorld } from '@arcade/game-engine';
import { ArcadeSportGame } from '../src/games/arcade-sport-game.js';
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

function setup(gameId: 'air-hockey' | 'table-tennis' = 'air-hockey') {
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
  const settings =
    gameId === 'air-hockey' ? DEFAULT_SETTINGS['air-hockey'] : DEFAULT_SETTINGS['table-tennis'];
  const game = new ArcadeSportGame(gameId, ctx, settings);
  return { game, states, events, results };
}

function worldOf(game: ArcadeSportGame): ArcadeSportWorld {
  return (game as unknown as { world: ArcadeSportWorld }).world;
}

describe('partidas de Air Hockey y tenis de mesa', () => {
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

  it('ignora entradas que intentan controlar otro deporte', () => {
    const { game } = setup('air-hockey');
    game.start();
    vi.advanceTimersByTime(3_200);
    const before = game.publicState().paddles.find((paddle) => paddle.playerId === 'a')!;
    game.handleAction('a', { type: 'sport:input', game: 'table-tennis', x: 1, y: 1 });
    vi.advanceTimersByTime(1_000);
    const after = game.publicState().paddles.find((paddle) => paddle.playerId === 'a')!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    game.dispose();
  });

  it('termina al alcanzar el marcador y premia a todo el equipo', () => {
    const { game, events, results } = setup('air-hockey');
    game.start();
    vi.advanceTimersByTime(3_200);
    const world = worldOf(game);
    world.scores.rojo = game.publicState().targetScore - 1;
    world.serveMs = 0;
    world.ball.x = SPORT_FIELD.width + world.ball.radius + 2;
    world.ball.y = SPORT_FIELD.height / 2;
    world.ball.vx = 400;
    vi.advanceTimersByTime(50);

    expect(results).toHaveLength(1);
    expect(results[0]?.game).toBe('air-hockey');
    expect(results[0]?.winnerIds).toEqual(['a', 'c']);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'sport-goal', team: 'rojo' }));
    expect(game.publicState().phase).toBe('finished');
    game.dispose();
  });

  it('finaliza si un equipo se queda sin jugadores', () => {
    const { game, results } = setup('table-tennis');
    game.start();
    vi.advanceTimersByTime(3_200);
    game.onPlayerLeft('b');
    expect(results).toHaveLength(1);
    expect(results[0]?.winnerIds).toEqual(['a', 'c']);
    game.dispose();
  });
});
