import type { GameId, GameSettings } from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { QuizGame } from './quiz-game.js';
import { DartsGame } from './darts-game.js';
import { PoolGame } from './pool-game.js';
import { GolfGame } from './golf-game.js';
import { BowlingGame } from './bowling-game.js';
import { KartsGame } from './karts-game.js';
import { ArenaGame } from './arena-game.js';

export function createGameRunner(
  game: GameId,
  ctx: GameContext,
  settings: GameSettings,
): GameRunner {
  switch (game) {
    case 'quiz':
      return new QuizGame(ctx, settings.quiz);
    case 'darts':
      return new DartsGame(ctx, settings.darts);
    case 'pool':
      return new PoolGame(ctx, settings.pool);
    case 'golf':
      return new GolfGame(ctx, settings.golf);
    case 'bowling':
      return new BowlingGame(ctx, settings.bowling);
    case 'karts':
      return new KartsGame(ctx, settings.karts);
    case 'arena':
      return new ArenaGame(ctx, settings.arena);
    default: {
      const never: never = game;
      throw new Error('Juego no soportado: ' + String(never));
    }
  }
}
