import { describe, expect, it } from 'vitest';
import { gameActionSchema, settingsPatchSchema } from '../src/events.js';

describe('contratos de deportes de pala', () => {
  it('acepta configuraciones válidas de ambos juegos', () => {
    expect(
      settingsPatchSchema.parse({
        game: 'air-hockey',
        settings: { mode: 'turbo', goalLimit: 7 },
      }),
    ).toEqual({ game: 'air-hockey', settings: { mode: 'turbo', goalLimit: 7 } });
    expect(
      settingsPatchSchema.parse({
        game: 'table-tennis',
        settings: { mode: 'vertigo', pointsToWin: 11 },
      }),
    ).toEqual({ game: 'table-tennis', settings: { mode: 'vertigo', pointsToWin: 11 } });
  });

  it('rechaza posiciones fuera del campo normalizado', () => {
    expect(
      gameActionSchema.safeParse({ type: 'sport:input', game: 'air-hockey', x: 1.01, y: 0.5 })
        .success,
    ).toBe(false);
    expect(
      gameActionSchema.safeParse({ type: 'sport:input', game: 'table-tennis', x: 0.5, y: -0.1 })
        .success,
    ).toBe(false);
  });
});
