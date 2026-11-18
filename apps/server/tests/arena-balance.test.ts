import { describe, expect, it } from 'vitest';
import {
  ARENA,
  BOT_DIFFICULTY_META,
  PHYSICS_DT,
  PHYSICS_HZ,
  createRng,
  type ArenaPublicState,
  type BotDifficulty,
} from '@arcade/shared';
import { ArenaWorld } from '@arcade/game-engine';
import { ArenaBot } from '../src/bots/arena-bot.js';
import { BOT_TICK_HZ, type BotMemory } from '../src/bots/index.js';

const HUMAN = 'humano';

/**
 * Partida de práctica con un jugador que no toca nada.
 *
 * Reproduce lo que hace el servidor: física a PHYSICS_HZ y bots pensando a
 * BOT_TICK_HZ con su propia memoria. Devuelve cuántos segundos aguanta el
 * jugador quieto (o el máximo simulado si sigue vivo).
 */
function survivalSeconds(bots: number, difficulty: BotDifficulty, seed: number, maxS = 90): number {
  const ids = [HUMAN, ...Array.from({ length: bots }, (_, i) => `bot-${i}`)];
  const world = new ArenaWorld(ids, {}, seed);
  world.running = true;
  const brain = new ArenaBot();
  const memories = new Map<string, BotMemory>(ids.map((id) => [id, {}]));
  const random = createRng(seed * 7 + 3);
  const stepsPerThink = Math.round(PHYSICS_HZ / BOT_TICK_HZ);

  for (let step = 0; step < maxS * PHYSICS_HZ; step++) {
    if (step % stepsPerThink === 0) {
      const snapshot = world.snapshot();
      const state: ArenaPublicState = {
        game: 'arena',
        phase: 'fighting',
        mode: 'todos',
        fighters: snapshot.fighters,
        pickups: snapshot.pickups,
        zone: snapshot.zone,
        matchMs: snapshot.matchMs,
        countdownMs: 0,
        aliveCount: world.aliveIds().length,
        teams: {},
        feed: [],
        deadline: 0,
      };
      for (const id of ids.slice(1)) {
        const actions = brain.think(state, {
          botId: id,
          difficulty,
          meta: BOT_DIFFICULTY_META[difficulty],
          now: snapshot.matchMs,
          dtMs: 1000 / BOT_TICK_HZ,
          memory: memories.get(id)!,
          random,
        });
        for (const action of actions) {
          if (action.type === 'arena:input') world.setInput(id, action);
        }
      }
    }
    world.step(PHYSICS_DT);
    if (!world.getFighter(HUMAN)?.alive) return world.matchMs / 1000;
    if (world.aliveIds().length <= 1) return maxS;
  }
  return maxS;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe('balance de los bots de Battle Royale con un jugador quieto', () => {
  // Antes del arreglo: 7 s con un bot fácil y 4,5 s con tres, en cualquier dificultad.
  it.each([
    [1, 'facil', 18],
    [3, 'facil', 18],
    [3, 'normal', 15],
    [3, 'dificil', 12],
  ] as const)('%i bot(s) en %s: aguanta al menos %i s de mediana', (bots, difficulty, minS) => {
    const times = SEEDS.map((seed) => survivalSeconds(bots, difficulty, seed));
    expect(median(times)).toBeGreaterThanOrEqual(minS);
    // Nadie cae antes de que acabe la gracia inicial de la zona.
    expect(Math.min(...times)).toBeGreaterThanOrEqual(ARENA.zoneGraceMs / 1000);
  });

  it('un bot fácil sigue siendo un rival: acaba eliminando al jugador quieto', () => {
    const times = SEEDS.map((seed) => survivalSeconds(1, 'facil', seed));
    expect(median(times)).toBeLessThan(60);
  });
});
