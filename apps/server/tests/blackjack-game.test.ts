import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type BlackjackPublicState,
  type GamePublicState,
  type MatchResult,
} from '@arcade/shared';
import { BlackjackGame } from '../src/games/blackjack-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

const players: RoomPlayer[] = ['Ana', 'Bea'].map((name, index) => ({
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

function setup() {
  const states: GamePublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  // Generador determinista para que cada ejecución tenga el mismo reparto.
  const game = new BlackjackGame(
    ctx,
    { ...DEFAULT_SETTINGS.blackjack, mode: 'rapido' },
    () => 0.42,
  );
  return { game, states, results };
}

function playCurrentRound(game: BlackjackGame) {
  let guard = 0;
  while (game.publicState().phase === 'playing' && guard < 10) {
    const active = game.publicState().activePlayerId;
    expect(active).not.toBe('');
    game.handleAction(active, { type: 'blackjack:stand' });
    guard += 1;
  }
  expect(game.publicState().phase).toBe('dealer');
  vi.advanceTimersByTime(1_000);
  expect(game.publicState().phase).toBe('round-over');
}

describe('mesa de blackjack', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('oculta la segunda carta del crupier y rechaza acciones fuera de turno', () => {
    const { game, states } = setup();
    game.start();
    const initial = states.at(-1) as BlackjackPublicState;
    expect(initial.dealerCards).toHaveLength(2);
    expect(initial.dealerCards[0]).not.toBeNull();
    expect(initial.dealerCards[1]).toBeNull();
    expect(initial.dealerTotal).toBeNull();

    const other = initial.order.find((id) => id !== initial.activePlayerId)!;
    const before = initial.hands[other]?.cards.length;
    game.handleAction(other, { type: 'blackjack:hit' });
    expect(game.publicState().hands[other]?.cards).toHaveLength(before);
    game.dispose();
  });

  it('resuelve tres rondas rápidas y publica una clasificación final', () => {
    const { game, results } = setup();
    game.start();

    for (let round = 1; round <= 3; round += 1) {
      playCurrentRound(game);
      expect(Object.keys(game.publicState().roundResults)).toHaveLength(2);
      vi.advanceTimersByTime(3_300);
    }

    expect(results).toHaveLength(1);
    expect(results[0]?.game).toBe('blackjack');
    expect(results[0]?.rows).toHaveLength(2);
    expect(results[0]?.winnerIds.length).toBeGreaterThan(0);
    game.dispose();
  });

  it('planta automáticamente al jugador cuando agota su turno', () => {
    const { game } = setup();
    game.start();
    const first = game.publicState().activePlayerId;
    vi.advanceTimersByTime(30_200);
    expect(game.publicState().activePlayerId).not.toBe(first);
    game.dispose();
  });
});
