import { describe, expect, it } from 'vitest';
import {
  BOWLING_PINS,
  bowlingPinLayout,
  pinsRemaining,
  scoreBowling,
} from '../src/games/bowling.js';

const repeat = (value: number, times: number) => Array.from({ length: times }, () => value);

describe('puntuacion de bolos', () => {
  it('partida perfecta: doce strikes son 300', () => {
    const card = scoreBowling(repeat(10, 12));
    expect(card.total).toBe(300);
    expect(card.finished).toBe(true);
    expect(card.frames).toHaveLength(10);
    expect(card.frames[0]!.strike).toBe(true);
  });

  it('todo spares de cinco suman 150', () => {
    const card = scoreBowling([...repeat(5, 20), 5]);
    expect(card.total).toBe(150);
    expect(card.frames[0]!.spare).toBe(true);
  });

  it('partida abierta sin bonificaciones', () => {
    const card = scoreBowling(repeat(4, 20));
    expect(card.total).toBe(80);
    expect(card.frames.every((frame) => !frame.strike && !frame.spare)).toBe(true);
  });

  it('un strike suma los dos lanzamientos siguientes', () => {
    // Strike, luego 4 y 3, y el resto ceros.
    const card = scoreBowling([10, 4, 3, ...repeat(0, 16)]);
    expect(card.frames[0]!.score).toBe(17);
    expect(card.frames[1]!.score).toBe(24);
    expect(card.total).toBe(24);
  });

  it('un spare suma el lanzamiento siguiente', () => {
    const card = scoreBowling([7, 3, 4, 2, ...repeat(0, 16)]);
    expect(card.frames[0]!.score).toBe(14);
    expect(card.frames[1]!.score).toBe(20);
  });

  it('el decimo frame admite un tercer lanzamiento tras strike', () => {
    const card = scoreBowling([...repeat(0, 18), 10, 10, 10]);
    expect(card.frames[9]!.rolls).toEqual([10, 10, 10]);
    expect(card.total).toBe(30);
    expect(card.finished).toBe(true);
  });

  it('el decimo frame admite un tercer lanzamiento tras spare', () => {
    const card = scoreBowling([...repeat(0, 18), 6, 4, 7]);
    expect(card.frames[9]!.rolls).toEqual([6, 4, 7]);
    expect(card.total).toBe(17);
    expect(card.finished).toBe(true);
  });

  it('no da por cerrada la partida hasta completar el decimo frame', () => {
    const card = scoreBowling([...repeat(0, 18), 10]);
    expect(card.finished).toBe(false);
    expect(card.currentFrame).toBe(9);
  });

  it('sigue el cursor de frame y lanzamiento', () => {
    expect(scoreBowling([]).currentFrame).toBe(0);
    expect(scoreBowling([]).currentRoll).toBe(0);
    expect(scoreBowling([3]).currentRoll).toBe(1);
    expect(scoreBowling([3, 4]).currentFrame).toBe(1);
    // Un strike cierra el frame de inmediato.
    expect(scoreBowling([10]).currentFrame).toBe(1);
  });

  it('la partida corta termina en el quinto frame', () => {
    const card = scoreBowling(repeat(3, 10), 5);
    expect(card.frames).toHaveLength(5);
    expect(card.finished).toBe(true);
    expect(card.total).toBe(30);
  });

  it('calcula los bolos que quedan en pie dentro del frame', () => {
    expect(pinsRemaining([])).toBe(BOWLING_PINS);
    expect(pinsRemaining([4])).toBe(6);
    expect(pinsRemaining([10])).toBe(BOWLING_PINS);
  });

  it('coloca diez bolos en formacion triangular sin solaparse', () => {
    const pins = bowlingPinLayout();
    expect(pins).toHaveLength(10);
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const distance = Math.hypot(pins[i]!.x - pins[j]!.x, pins[i]!.y - pins[j]!.y);
        expect(distance).toBeGreaterThan(12);
      }
    }
  });
});
