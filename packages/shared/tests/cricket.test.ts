import { describe, expect, it } from 'vitest';
import {
  CRICKET_NUMBERS,
  applyCricketThrow,
  createCricketBoard,
  cricketWinner,
  hasClosed,
  hasClosedEverything,
  isNumberDead,
  marksForThrow,
} from '../src/games/cricket.js';
import type { DartThrow } from '../src/games/darts.js';

const dart = (sector: number, ring: DartThrow['ring']): DartThrow => ({
  sector,
  ring,
  points: sector * (ring === 'triple' ? 3 : ring === 'double' ? 2 : 1),
  x: 0,
  y: 0,
});

describe('marcas por impacto', () => {
  it('simple, doble y triple valen una, dos y tres marcas', () => {
    expect(marksForThrow(dart(20, 'single'))).toEqual({ number: 20, marks: 1 });
    expect(marksForThrow(dart(20, 'double'))).toEqual({ number: 20, marks: 2 });
    expect(marksForThrow(dart(20, 'triple'))).toEqual({ number: 20, marks: 3 });
  });

  it('el bull vale una marca y el bullseye dos', () => {
    expect(marksForThrow(dart(25, 'bull'))).toEqual({ number: 25, marks: 1 });
    expect(marksForThrow(dart(25, 'bullseye'))).toEqual({ number: 25, marks: 2 });
  });

  it('los numeros fuera de juego y los fallos no cuentan', () => {
    expect(marksForThrow(dart(14, 'triple')).marks).toBe(0);
    expect(marksForThrow(dart(1, 'single')).marks).toBe(0);
    expect(marksForThrow(dart(0, 'miss')).marks).toBe(0);
  });
});

describe('cierre de numeros', () => {
  it('tres marcas cierran un numero', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(20, 'single'));
    expect(hasClosed(board, 'a', 20)).toBe(false);
    applyCricketThrow(board, 'a', dart(20, 'double'));
    expect(hasClosed(board, 'a', 20)).toBe(true);
  });

  it('un triple cierra de una sola vez', () => {
    const board = createCricketBoard(['a', 'b']);
    const result = applyCricketThrow(board, 'a', dart(19, 'triple'));
    expect(result.marksAdded).toBe(3);
    expect(result.closed).toBe(true);
    expect(result.pointsAdded).toBe(0);
  });

  it('las marcas no se acumulan por encima de tres', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(18, 'triple'));
    applyCricketThrow(board, 'a', dart(18, 'triple'));
    expect(board.a!.marks[18]).toBe(3);
  });
});

describe('puntuacion', () => {
  it('el excedente puntua si un rival no ha cerrado', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(20, 'double')); // 2 marcas
    const result = applyCricketThrow(board, 'a', dart(20, 'triple')); // 1 cierra, 2 puntuan
    expect(result.marksAdded).toBe(1);
    expect(result.pointsAdded).toBe(40);
    expect(board.a!.score).toBe(40);
  });

  it('no puntua si todos los rivales han cerrado el numero', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(17, 'triple'));
    applyCricketThrow(board, 'b', dart(17, 'triple'));
    const result = applyCricketThrow(board, 'a', dart(17, 'triple'));
    expect(result.pointsAdded).toBe(0);
    expect(board.a!.score).toBe(0);
    expect(isNumberDead(board, 17)).toBe(true);
  });

  it('el bull puntua 25 por marca excedente', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(25, 'bullseye')); // 2 marcas
    const result = applyCricketThrow(board, 'a', dart(25, 'bullseye')); // 1 cierra, 1 puntua
    expect(result.pointsAdded).toBe(25);
  });

  it('con tres jugadores basta con que uno siga abierto', () => {
    const board = createCricketBoard(['a', 'b', 'c']);
    applyCricketThrow(board, 'a', dart(16, 'triple'));
    applyCricketThrow(board, 'b', dart(16, 'triple'));
    // 'c' sigue abierto, asi que 'a' puede seguir puntuando.
    const result = applyCricketThrow(board, 'a', dart(16, 'double'));
    expect(result.pointsAdded).toBe(32);
  });
});

describe('victoria', () => {
  const closeAll = (board: ReturnType<typeof createCricketBoard>, id: string) => {
    for (const number of CRICKET_NUMBERS) {
      applyCricketThrow(board, id, dart(number, 'triple'));
    }
  };

  it('no hay ganador mientras queden numeros abiertos', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'a', dart(20, 'triple'));
    expect(cricketWinner(board)).toBeNull();
  });

  it('cerrar todo con los puntos iguales o por delante gana', () => {
    const board = createCricketBoard(['a', 'b']);
    closeAll(board, 'a');
    expect(hasClosedEverything(board, 'a')).toBe(true);
    expect(cricketWinner(board)).toBe('a');
  });

  it('cerrar todo por detras en puntos no gana todavia', () => {
    const board = createCricketBoard(['a', 'b']);
    // 'b' acumula puntos antes de que 'a' cierre.
    applyCricketThrow(board, 'b', dart(19, 'triple'));
    applyCricketThrow(board, 'b', dart(19, 'triple'));
    applyCricketThrow(board, 'b', dart(19, 'triple'));
    expect(board.b!.score).toBeGreaterThan(0);

    closeAll(board, 'a');
    // 'a' lo tiene todo cerrado pero va por detras: aun no gana.
    expect(hasClosedEverything(board, 'a')).toBe(true);
    expect(board.a!.score).toBeLessThan(board.b!.score);
    expect(cricketWinner(board)).toBeNull();
  });

  it('tras remontar los puntos, quien tiene todo cerrado gana', () => {
    const board = createCricketBoard(['a', 'b']);
    applyCricketThrow(board, 'b', dart(19, 'triple'));
    applyCricketThrow(board, 'b', dart(19, 'triple')); // b suma 57
    closeAll(board, 'a');
    expect(cricketWinner(board)).toBeNull();

    // 'a' puntua en un numero que 'b' no ha cerrado.
    for (let i = 0; i < 3; i++) applyCricketThrow(board, 'a', dart(20, 'triple'));
    expect(board.a!.score).toBeGreaterThanOrEqual(board.b!.score);
    expect(cricketWinner(board)).toBe('a');
  });
});
