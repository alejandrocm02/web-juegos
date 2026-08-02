import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePublicState, MatchResult, SonglessPublicState } from '@arcade/shared';
import { SonglessGame } from '../src/games/songless-game.js';
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
  const game = new SonglessGame(ctx, { mode: 'relampago', rounds: 7 }, () => 0.42);
  return { game, states, results };
}

describe('partida de Songless', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('oculta la respuesta y amplía el fragmento de 4 a 16 notas', () => {
    const { game } = setup();
    game.start();
    vi.advanceTimersByTime(2_400);
    let state = game.publicState() as SonglessPublicState;
    expect(state.phase).toBe('listening');
    expect(state.track?.notes).toHaveLength(4);
    expect(state.correctIndex).toBeNull();

    vi.advanceTimersByTime(3_000);
    state = game.publicState() as SonglessPublicState;
    expect(state.clipLevel).toBe(2);
    expect(state.track?.notes).toHaveLength(8);

    vi.advanceTimersByTime(3_000);
    expect((game.publicState() as SonglessPublicState).track?.notes).toHaveLength(16);
    vi.advanceTimersByTime(3_000);
    expect((game.publicState() as SonglessPublicState).phase).toBe('reveal');
    expect((game.publicState() as SonglessPublicState).correctIndex).not.toBeNull();
    game.dispose();
  });

  it('acepta un solo intento por jugador y conserva la primera respuesta', () => {
    const { game } = setup();
    game.start();
    vi.advanceTimersByTime(2_400);
    game.handleAction('a', { type: 'songless:answer', roundIndex: 0, answerIndex: 0 });
    game.handleAction('a', { type: 'songless:answer', roundIndex: 0, answerIndex: 1 });
    vi.advanceTimersByTime(9_100);
    const answer = (game.publicState() as SonglessPublicState).breakdown.find(
      (entry) => entry.playerId === 'a',
    );
    expect(answer?.answerIndex).toBe(0);
    game.dispose();
  });

  it('premia el acierto temprano sin revelar la opción correcta al cliente', () => {
    const outcomes: SonglessPublicState[] = [];
    for (let answerIndex = 0; answerIndex < 4; answerIndex += 1) {
      const { game } = setup();
      game.start();
      vi.advanceTimersByTime(2_400);
      game.handleAction('a', { type: 'songless:answer', roundIndex: 0, answerIndex });
      vi.advanceTimersByTime(9_100);
      outcomes.push(game.publicState() as SonglessPublicState);
      game.dispose();
    }
    const correct = outcomes.find(
      (state) => state.breakdown.find((entry) => entry.playerId === 'a')?.correct,
    );
    const gained = correct?.breakdown.find((entry) => entry.playerId === 'a')?.gained ?? 0;
    expect(correct).toBeDefined();
    expect(gained).toBeGreaterThanOrEqual(350);
    expect(gained).toBeLessThanOrEqual(400);
  });

  it('completa las cinco rondas relámpago y entrega clasificación', () => {
    const { game, results } = setup();
    game.start();
    vi.advanceTimersByTime(2_400);
    for (let round = 0; round < 5; round += 1) {
      vi.advanceTimersByTime(9_000);
      expect((game.publicState() as SonglessPublicState).phase).toBe('reveal');
      vi.advanceTimersByTime(3_800);
    }
    expect(results).toHaveLength(1);
    expect(results[0]?.game).toBe('songless');
    expect(results[0]?.rows).toHaveLength(2);
    game.dispose();
  });
});
