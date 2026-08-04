import { describe, expect, it } from 'vitest';
import {
  BOT_DIFFICULTY_META,
  HEAD_SPORT_FIELD,
  SPORT_FIELD,
  TANK_FIELD,
  TANK_MAPS,
  getKartTrack,
  type ArcadeSportPublicState,
  type ArenaPublicState,
  type BotDifficulty,
  type GameAction,
  type HeadSportPublicState,
  type KartsPublicState,
  type TanksPublicState,
} from '@arcade/shared';
import { TanksWorld } from '@arcade/game-engine';
import { KartsBot } from '../src/bots/karts-bot.js';
import { ArenaBot } from '../src/bots/arena-bot.js';
import { ArcadeSportBot } from '../src/bots/arcade-sport-bot.js';
import { HeadSportBot } from '../src/bots/head-sport-bot.js';
import { TanksBot } from '../src/bots/tanks-bot.js';
import type { BotThinkContext } from '../src/bots/types.js';

/** Contexto sin aleatoriedad: las decisiones son reproducibles. */
function context(
  botId: string,
  difficulty: BotDifficulty = 'dificil',
  overrides: Partial<BotThinkContext> = {},
): BotThinkContext {
  return {
    botId,
    difficulty,
    meta: BOT_DIFFICULTY_META[difficulty],
    now: 10_000,
    dtMs: 50,
    memory: {},
    // 0.5 anula el ruido simetrico: jitter(0.5, n) === 0.
    random: () => 0.5,
    ...overrides,
  };
}

describe('piloto de karts', () => {
  const track = getKartTrack('ovalo');

  function state(overrides: Partial<KartsPublicState> = {}): KartsPublicState {
    return {
      game: 'karts',
      phase: 'racing',
      mode: 'rapida',
      track,
      totalLaps: 3,
      karts: [
        {
          playerId: 'bot',
          x: track.gates[0]!.left.x,
          y: track.gates[0]!.left.y,
          heading: 0,
          speed: 100,
          lap: 1,
          gate: 0,
          finished: false,
          eliminated: false,
          bestLapMs: null,
          totalMs: null,
          position: 1,
        },
      ],
      countdownMs: 0,
      raceMs: 1000,
      nextEliminationMs: null,
      teams: {},
      deadline: 0,
      ...overrides,
    };
  }

  it('acelera y gira hacia la siguiente puerta', () => {
    const actions = new KartsBot().think(state(), context('bot'));
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.type).toBe('karts:input');
    if (action.type !== 'karts:input') throw new Error('accion inesperada');
    expect(action.throttle).toBeGreaterThan(0);
    expect(Math.abs(action.steer)).toBeLessThanOrEqual(1);
  });

  it('no conduce durante la cuenta atras ni al terminar', () => {
    expect(new KartsBot().think(state({ phase: 'countdown' }), context('bot'))).toHaveLength(0);
    expect(new KartsBot().think(state({ phase: 'finished' }), context('bot'))).toHaveLength(0);
  });

  it('ignora a un kart eliminado', () => {
    const eliminated = state();
    eliminated.karts[0]!.eliminated = true;
    expect(new KartsBot().think(eliminated, context('bot'))).toHaveLength(0);
  });

  it('gira hacia el lado correcto', () => {
    // Con la siguiente puerta a la izquierda del morro, el volante va a negativo.
    const target = track.gates[1]!;
    const centerX = (target.left.x + target.right.x) / 2;
    const centerY = (target.left.y + target.right.y) / 2;
    const custom = state();
    custom.karts[0]!.x = centerX;
    custom.karts[0]!.y = centerY + 200;
    custom.karts[0]!.heading = 0; // mirando a +x, la puerta queda arriba (-y)
    const action = new KartsBot().think(custom, context('bot'))[0]!;
    if (action.type !== 'karts:input') throw new Error('accion inesperada');
    expect(action.steer).toBeLessThan(0);
  });
});

describe('luchador de la arena', () => {
  function state(overrides: Partial<ArenaPublicState> = {}): ArenaPublicState {
    return {
      game: 'arena',
      phase: 'fighting',
      mode: 'individual',
      fighters: [
        {
          playerId: 'bot',
          x: 450,
          y: 450,
          facing: 0,
          health: 100,
          shield: 0,
          alive: true,
          placement: null,
          kills: 0,
          attackCooldownMs: 0,
          speedBuffMs: 0,
          damageBuffMs: 0,
          inStorm: false,
        },
        {
          playerId: 'humano',
          x: 480,
          y: 450,
          facing: Math.PI,
          health: 100,
          shield: 0,
          alive: true,
          placement: null,
          kills: 0,
          attackCooldownMs: 0,
          speedBuffMs: 0,
          damageBuffMs: 0,
          inStorm: false,
        },
      ],
      pickups: [],
      zone: { x: 450, y: 450, radius: 430 },
      matchMs: 5000,
      countdownMs: 0,
      aliveCount: 2,
      teams: {},
      feed: [],
      deadline: 0,
      ...overrides,
    };
  }

  it('ataca al rival que tiene al alcance', () => {
    // random 0 fuerza la rama de ataque: el bot ya lo tiene en rango.
    const action = new ArenaBot().think(
      state(),
      context('bot', 'dificil', { random: () => 0 }),
    )[0]!;
    if (action.type !== 'arena:input') throw new Error('accion inesperada');
    expect(action.attack).toBe(true);
    // Y mira hacia el, que es lo que define el cono.
    expect(Math.abs(action.facing)).toBeLessThan(0.2);
  });

  it('vuelve a la zona segura si se queda fuera', () => {
    const outside = state({ zone: { x: 100, y: 100, radius: 120 } });
    const action = new ArenaBot().think(outside, context('bot'))[0]!;
    if (action.type !== 'arena:input') throw new Error('accion inesperada');
    // Desde (450,450) hacia (100,100): ambos ejes negativos.
    expect(action.moveX).toBeLessThan(0);
    expect(action.moveY).toBeLessThan(0);
  });

  it('no hace nada si esta eliminado o la partida no ha empezado', () => {
    const dead = state();
    dead.fighters[0]!.alive = false;
    expect(new ArenaBot().think(dead, context('bot'))).toHaveLength(0);
    expect(new ArenaBot().think(state({ phase: 'countdown' }), context('bot'))).toHaveLength(0);
  });
});

describe('pala automatica', () => {
  function state(
    game: 'air-hockey' | 'table-tennis',
    ball: { x: number; y: number; vx: number; vy: number },
  ): ArcadeSportPublicState {
    return {
      game,
      phase: 'playing',
      mode: 'clasico',
      targetScore: 7,
      countdownMs: 0,
      deadline: 0,
      tick: 1,
      matchMs: 4000,
      paddles: [
        { playerId: 'bot', team: 'rojo', x: 120, y: 300 },
        { playerId: 'humano', team: 'azul', x: 880, y: 300 },
      ],
      ball: { ...ball, radius: 12 },
      scores: { rojo: 0, azul: 0 },
      teams: { bot: 'rojo', humano: 'azul' },
      serveMs: 0,
      lastScoringTeam: null,
    };
  }

  it('se coloca donde va a llegar la bola, no donde esta', () => {
    // Bola en el centro bajando y viniendo hacia el campo del bot.
    const action = new ArcadeSportBot().think(
      state('table-tennis', { x: 500, y: 300, vx: -400, vy: 300 }),
      context('bot'),
    )[0]!;
    if (action.type !== 'sport:input') throw new Error('accion inesperada');
    // La prediccion la lleva por debajo del centro del campo.
    expect(action.y).toBeGreaterThan(0.5);
    expect(action.y).toBeLessThanOrEqual(1);
  });

  it('mantiene la posicion normalizada dentro del rango valido', () => {
    // Trayectoria extrema: aun asi la salida debe quedar acotada a [0,1].
    const action = new ArcadeSportBot().think(
      state('air-hockey', { x: 900, y: 40, vx: -900, vy: -900 }),
      context('bot'),
    )[0]!;
    if (action.type !== 'sport:input') throw new Error('accion inesperada');
    expect(action.x).toBeGreaterThanOrEqual(0);
    expect(action.x).toBeLessThanOrEqual(1);
    expect(action.y).toBeGreaterThanOrEqual(0);
    expect(action.y).toBeLessThanOrEqual(1);
  });

  it('un bot facil predice menos que uno dificil', () => {
    const scene = state('table-tennis', { x: 500, y: 300, vx: -400, vy: 400 });
    const easy = new ArcadeSportBot().think(scene, context('bot', 'facil'))[0]!;
    const hard = new ArcadeSportBot().think(scene, context('bot', 'dificil'))[0]!;
    if (easy.type !== 'sport:input' || hard.type !== 'sport:input') {
      throw new Error('accion inesperada');
    }
    const center = 300 / SPORT_FIELD.height;
    expect(Math.abs(hard.y - center)).toBeGreaterThan(Math.abs(easy.y - center));
  });
});

describe('cabezon automatico', () => {
  function state(ball: { x: number; y: number }): HeadSportPublicState {
    return {
      game: 'head-soccer',
      phase: 'playing',
      mode: 'clasico',
      targetScore: 5,
      countdownMs: 0,
      deadline: 0,
      tick: 1,
      matchMs: 3000,
      players: [
        {
          playerId: 'bot',
          team: 'rojo',
          x: 250,
          y: HEAD_SPORT_FIELD.groundY - 40,
          vx: 0,
          vy: 0,
          facing: 1,
          onGround: true,
          kickMs: 0,
        },
      ],
      ball: { ...ball, vx: 0, vy: 0, radius: 25, spin: 0 },
      scores: { rojo: 0, azul: 0 },
      teams: { bot: 'rojo' },
      resetMs: 0,
      lastScoringTeam: null,
    };
  }

  it('persigue la bola', () => {
    const action = new HeadSportBot().think(
      state({ x: 600, y: HEAD_SPORT_FIELD.groundY - 30 }),
      context('bot'),
    )[0]!;
    if (action.type !== 'head-sport:input') throw new Error('accion inesperada');
    expect(action.moveX).toBeGreaterThan(0);
  });

  it('el salto se dispara por flanco y no se queda pegado', () => {
    const bot = new HeadSportBot();
    const ctx = context('bot', 'dificil', { random: () => 0 });
    const high = state({ x: 260, y: HEAD_SPORT_FIELD.groundY - 130 });

    const first = bot.think(high, ctx)[0]!;
    if (first.type !== 'head-sport:input') throw new Error('accion inesperada');
    expect(first.jump).toBe(true);

    // En el tick siguiente el boton se suelta: si no, el motor lo ignoraria.
    const second = bot.think(high, ctx)[0]!;
    if (second.type !== 'head-sport:input') throw new Error('accion inesperada');
    expect(second.jump).toBe(false);
  });
});

describe('artillero automatico', () => {
  function state(world: TanksWorld, overrides: Partial<TanksPublicState> = {}): TanksPublicState {
    return {
      game: 'tanks',
      phase: 'aiming',
      mode: 'clasico',
      map: world.mapId,
      order: ['bot', 'humano'],
      activePlayerId: 'bot',
      turnNumber: 1,
      turnDurationMs: 32_000,
      countdownMs: 0,
      deadline: 0,
      ...world.snapshot(),
      ...overrides,
    };
  }

  it('espera un momento antes de disparar y solo dispara una vez por turno', () => {
    const world = new TanksWorld(['bot', 'humano'], 'crater-lunar', 'clasico', () => 0.5);
    const bot = new TanksBot();
    const memory = {};

    // Primer vistazo del turno: aun no dispara, solo toma nota del instante.
    expect(bot.think(state(world), context('bot', 'normal', { memory, now: 0 }))).toHaveLength(0);
    // Antes de que pase la pausa tampoco.
    expect(bot.think(state(world), context('bot', 'normal', { memory, now: 300 }))).toHaveLength(0);

    const fired = bot.think(state(world), context('bot', 'normal', { memory, now: 5000 }));
    expect(fired).toHaveLength(1);
    expect(fired[0]!.type).toBe('tanks:fire');

    // Ya disparó: no repite en el mismo turno.
    expect(bot.think(state(world), context('bot', 'normal', { memory, now: 6000 }))).toHaveLength(
      0,
    );
  });

  it('no dispara si no es su turno', () => {
    const world = new TanksWorld(['bot', 'humano'], 'crater-lunar', 'clasico', () => 0.5);
    const actions = new TanksBot().think(
      state(world, { activePlayerId: 'humano' }),
      context('bot', 'normal', { memory: { turnSeenAt: 0, aimingTurn: 1 }, now: 9000 }),
    );
    expect(actions).toHaveLength(0);
  });

  it('propone un disparo dentro de los limites que acepta el servidor', () => {
    const world = new TanksWorld(['bot', 'humano'], 'canon-carmesi', 'clasico', () => 0.5);
    const memory = { turnSeenAt: 0, aimingTurn: 1 };
    const action = new TanksBot().think(
      state(world),
      context('bot', 'dificil', { memory, now: 9000 }),
    )[0]!;
    if (action.type !== 'tanks:fire') throw new Error('accion inesperada');
    expect(action.angle).toBeGreaterThanOrEqual(-Math.PI + 0.12);
    expect(action.angle).toBeLessThanOrEqual(-0.12);
    expect(action.power).toBeGreaterThanOrEqual(0.2);
    expect(action.power).toBeLessThanOrEqual(1);
  });

  it('en dificil acierta al rival en un mapa despejado', () => {
    // Mapa sin obstaculos entre los dos tanques: la solucion balistica del bot
    // debe llevar el proyectil lo bastante cerca como para hacer daño.
    const world = new TanksWorld(['bot', 'humano'], 'crater-lunar', 'clasico', () => 0.5);
    const enemyBefore = world.tanks.find((tank) => tank.playerId === 'humano')!.health;
    const memory = { turnSeenAt: 0, aimingTurn: 1 };
    const action = new TanksBot().think(
      state(world),
      context('bot', 'dificil', { memory, now: 9000 }),
    )[0]!;
    if (action.type !== 'tanks:fire') throw new Error('accion inesperada');

    expect(world.fire('bot', action.angle, action.power)).toBe(true);
    for (let step = 0; step < 1200 && world.hasProjectile(); step += 1) world.step();

    const enemyAfter = world.tanks.find((tank) => tank.playerId === 'humano')!.health;
    expect(enemyAfter).toBeLessThan(enemyBefore);
  });

  it('esquiva su propia cobertura al calcular la trayectoria', () => {
    // En Cañón Carmesí hay una aguja central: el bot no debe estrellarse en ella.
    const world = new TanksWorld(['bot', 'humano'], 'canon-carmesi', 'clasico', () => 0.5);
    const memory = { turnSeenAt: 0, aimingTurn: 1 };
    const action = new TanksBot().think(
      state(world),
      context('bot', 'dificil', { memory, now: 9000 }),
    )[0]!;
    if (action.type !== 'tanks:fire') throw new Error('accion inesperada');
    world.fire('bot', action.angle, action.power);

    const spire = TANK_MAPS.find((map) => map.id === 'canon-carmesi')!.obstacles[0]!;
    let maxHeightOverSpire = TANK_FIELD.height;
    for (let step = 0; step < 1200 && world.hasProjectile(); step += 1) {
      world.step();
      const projectile = world.projectile;
      if (!projectile) break;
      if (projectile.x > spire.x && projectile.x < spire.x + spire.width) {
        maxHeightOverSpire = Math.min(maxHeightOverSpire, projectile.y);
      }
    }
    // Si cruzó por encima de la aguja, lo hizo despejando su altura.
    if (maxHeightOverSpire < TANK_FIELD.height) {
      expect(maxHeightOverSpire).toBeLessThan(spire.y);
    }
  });
});

describe('acciones validas para el runner', () => {
  it('una IA solo actua sobre el juego que le corresponde', () => {
    // El estado es de tenis de mesa, pero se le pasa al cerebro equivocado: no
    // debe producir ninguna accion. Asi un bot nunca inyecta una accion ajena.
    const tennis: ArcadeSportPublicState = {
      game: 'table-tennis',
      phase: 'playing',
      mode: 'clasico',
      targetScore: 11,
      countdownMs: 0,
      deadline: 0,
      tick: 1,
      matchMs: 0,
      paddles: [{ playerId: 'bot', team: 'rojo', x: 120, y: 300 }],
      ball: { x: 500, y: 300, vx: -300, vy: 0, radius: 12 },
      scores: { rojo: 0, azul: 0 },
      teams: { bot: 'rojo' },
      serveMs: 0,
      lastScoringTeam: null,
    };

    expect(new KartsBot().think(tennis, context('bot'))).toHaveLength(0);
    expect(new ArenaBot().think(tennis, context('bot'))).toHaveLength(0);
    expect(new TanksBot().think(tennis, context('bot'))).toHaveLength(0);
    expect(new HeadSportBot().think(tennis, context('bot'))).toHaveLength(0);

    const action: GameAction | undefined = new ArcadeSportBot().think(tennis, context('bot'))[0];
    expect(action?.type).toBe('sport:input');
  });
});
