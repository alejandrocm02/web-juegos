import { describe, expect, it } from 'vitest';
import { gameActionSchema, settingsPatchSchema } from '../src/events.js';

describe('contratos de deportes de cabezones', () => {
  it('acepta la configuración válida de ambos juegos', () => {
    expect(
      settingsPatchSchema.parse({
        game: 'head-soccer',
        settings: { mode: 'turbo', goalLimit: 7 },
      }),
    ).toEqual({ game: 'head-soccer', settings: { mode: 'turbo', goalLimit: 7 } });
    expect(
      settingsPatchSchema.parse({
        game: 'head-basketball',
        settings: { mode: 'gravedad-baja', pointsToWin: 14 },
      }),
    ).toEqual({
      game: 'head-basketball',
      settings: { mode: 'gravedad-baja', pointsToWin: 14 },
    });
  });

  it('valida movimiento, salto y remate', () => {
    expect(
      gameActionSchema.parse({
        type: 'head-sport:input',
        game: 'head-soccer',
        moveX: -1,
        jump: true,
        kick: false,
      }),
    ).toEqual({
      type: 'head-sport:input',
      game: 'head-soccer',
      moveX: -1,
      jump: true,
      kick: false,
    });
    expect(
      gameActionSchema.safeParse({
        type: 'head-sport:input',
        game: 'head-basketball',
        moveX: 1.1,
        jump: false,
        kick: false,
      }).success,
    ).toBe(false);
  });
});
