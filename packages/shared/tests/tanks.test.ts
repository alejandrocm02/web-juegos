import { describe, expect, it } from 'vitest';
import { gameActionSchema, settingsPatchSchema } from '../src/events.js';

describe('contratos de Tanques', () => {
  it('acepta modos y mapas válidos', () => {
    expect(
      settingsPatchSchema.parse({
        game: 'tanks',
        settings: { mode: 'rebotes', map: 'fortaleza-neon' },
      }),
    ).toEqual({ game: 'tanks', settings: { mode: 'rebotes', map: 'fortaleza-neon' } });
    expect(
      settingsPatchSchema.safeParse({
        game: 'tanks',
        settings: { mode: 'clasico', map: 'mapa-inventado' },
      }).success,
    ).toBe(false);
  });

  it('limita movimiento, ángulo y potencia', () => {
    expect(gameActionSchema.parse({ type: 'tanks:move', direction: -1 })).toEqual({
      type: 'tanks:move',
      direction: -1,
    });
    expect(
      gameActionSchema.parse({ type: 'tanks:fire', angle: -Math.PI / 3, power: 0.72 }),
    ).toEqual({ type: 'tanks:fire', angle: -Math.PI / 3, power: 0.72 });
    expect(gameActionSchema.safeParse({ type: 'tanks:fire', angle: 0.4, power: 1.4 }).success).toBe(
      false,
    );
  });
});
