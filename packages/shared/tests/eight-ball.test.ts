import { describe, expect, it } from 'vitest';
import {
  EIGHT_BALL,
  ballsOfGroup,
  groupOfBall,
  otherGroup,
  resolveEightBallShot,
} from '../src/games/pool.js';

describe('grupos de bola 8', () => {
  it('clasifica las quince bolas', () => {
    expect(groupOfBall(1)).toBe('lisas');
    expect(groupOfBall(7)).toBe('lisas');
    expect(groupOfBall(8)).toBe('negra');
    expect(groupOfBall(9)).toBe('rayadas');
    expect(groupOfBall(15)).toBe('rayadas');
    expect(groupOfBall(16)).toBeNull();
  });

  it('cada grupo tiene siete bolas y la negra queda fuera', () => {
    expect(ballsOfGroup('lisas')).toHaveLength(7);
    expect(ballsOfGroup('rayadas')).toHaveLength(7);
    expect(otherGroup('lisas')).toBe('rayadas');
    expect(EIGHT_BALL.totalBalls).toBe(15);
  });
});

describe('resolucion del tiro de bola 8', () => {
  it('asigna grupo con la primera entrada limpia y conserva el turno', () => {
    const result = resolveEightBallShot({
      shooterGroup: null,
      pocketed: [3],
      cuePocketed: false,
      remainingOwnBefore: 7,
    });
    expect(result.assignedGroup).toBe('lisas');
    expect(result.keepsTurn).toBe(true);
    expect(result.winner).toBeNull();
  });

  it('deja la mesa abierta si entran bolas de los dos grupos', () => {
    const result = resolveEightBallShot({
      shooterGroup: null,
      pocketed: [3, 11],
      cuePocketed: false,
      remainingOwnBefore: 7,
    });
    expect(result.assignedGroup).toBeNull();
    expect(result.keepsTurn).toBe(false);
  });

  it('no asigna grupo si el tiro termina con la blanca dentro', () => {
    const result = resolveEightBallShot({
      shooterGroup: null,
      pocketed: [3],
      cuePocketed: true,
      remainingOwnBefore: 7,
    });
    expect(result.assignedGroup).toBeNull();
    expect(result.foul).toBe(true);
    expect(result.keepsTurn).toBe(false);
  });

  it('cambia el turno al embocar solo bolas del rival', () => {
    const result = resolveEightBallShot({
      shooterGroup: 'lisas',
      pocketed: [11, 12],
      cuePocketed: false,
      remainingOwnBefore: 4,
    });
    expect(result.keepsTurn).toBe(false);
    expect(result.foul).toBe(false);
  });

  it('gana al embocar la negra tras limpiar el grupo', () => {
    const result = resolveEightBallShot({
      shooterGroup: 'rayadas',
      pocketed: [15, 8],
      cuePocketed: false,
      remainingOwnBefore: 1,
    });
    expect(result.winner).toBe('shooter');
    expect(result.foul).toBe(false);
  });

  it('pierde si mete la negra con bolas propias en la mesa', () => {
    const result = resolveEightBallShot({
      shooterGroup: 'lisas',
      pocketed: [8],
      cuePocketed: false,
      remainingOwnBefore: 3,
    });
    expect(result.winner).toBe('opponent');
    expect(result.foul).toBe(true);
  });

  it('pierde si mete la negra con la mesa abierta', () => {
    const result = resolveEightBallShot({
      shooterGroup: null,
      pocketed: [8],
      cuePocketed: false,
      remainingOwnBefore: 7,
    });
    expect(result.winner).toBe('opponent');
  });

  it('pierde si mete la negra y la blanca en el mismo tiro', () => {
    const result = resolveEightBallShot({
      shooterGroup: 'lisas',
      pocketed: [7, 8],
      cuePocketed: true,
      remainingOwnBefore: 1,
    });
    expect(result.winner).toBe('opponent');
    expect(result.foul).toBe(true);
  });

  it('un tiro sin bolas embocadas cede el turno', () => {
    const result = resolveEightBallShot({
      shooterGroup: 'lisas',
      pocketed: [],
      cuePocketed: false,
      remainingOwnBefore: 5,
    });
    expect(result.keepsTurn).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.foul).toBe(false);
  });
});
