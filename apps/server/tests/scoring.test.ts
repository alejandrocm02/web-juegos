import { describe, expect, it } from 'vitest';
import { rankPlayers, winnersFrom } from '../src/games/scoring.js';
import type { RoomPlayer } from '../src/rooms/types.js';

function player(id: string, name: string): RoomPlayer {
  return {
    id,
    token: 't-' + id,
    name,
    color: '#fff',
    icon: 'circle',
    isHost: false,
    ready: true,
    connection: 'connected',
    socketId: null,
    joinedAt: 0,
    disconnectedAt: null,
  };
}

const players = [player('a', 'Ana'), player('b', 'Bea'), player('c', 'Caro')];

describe('clasificacion', () => {
  it('ordena de mayor a menor por defecto', () => {
    const rows = rankPlayers(players, [
      { playerId: 'a', score: 10 },
      { playerId: 'b', score: 30 },
      { playerId: 'c', score: 20 },
    ]);
    expect(rows.map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
    expect(winnersFrom(rows)).toEqual(['b']);
  });

  it('en golf gana quien tiene menos golpes', () => {
    const rows = rankPlayers(
      players,
      [
        { playerId: 'a', score: 34 },
        { playerId: 'b', score: 30 },
        { playerId: 'c', score: 41 },
      ],
      { lowerIsBetter: true },
    );
    expect(rows[0]!.playerId).toBe('b');
  });

  it('desempata por tiempo total cuando hay los mismos golpes', () => {
    const rows = rankPlayers(
      players,
      [
        { playerId: 'a', score: 30, tiebreak: 90_000 },
        { playerId: 'b', score: 30, tiebreak: 62_000 },
        { playerId: 'c', score: 44, tiebreak: 10_000 },
      ],
      { lowerIsBetter: true },
    );
    expect(rows[0]!.playerId).toBe('b');
    expect(rows[0]!.tied).toBe(false);
    expect(winnersFrom(rows)).toEqual(['b']);
  });

  it('mantiene el empate compartido cuando coinciden golpes y tiempo', () => {
    const rows = rankPlayers(
      players,
      [
        { playerId: 'a', score: 30, tiebreak: 60_000 },
        { playerId: 'b', score: 30, tiebreak: 60_000 },
        { playerId: 'c', score: 35, tiebreak: 10_000 },
      ],
      { lowerIsBetter: true },
    );
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
    expect(rows[0]!.tied).toBe(true);
    expect(rows[2]!.rank).toBe(3);
    expect(winnersFrom(rows)).toHaveLength(2);
  });
});
