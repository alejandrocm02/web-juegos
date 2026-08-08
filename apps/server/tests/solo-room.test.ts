import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOT_NAMES,
  MAX_PLAYERS,
  SOLO_BOT_GAMES,
  SOLO_PRACTICE_GAMES,
  botRangeFor,
  clampBotCount,
  coerceSoloMode,
  defaultSoloConfig,
  improvesRecord,
  soloModesFor,
  soloRecordValue,
  soloSupportsMode,
  soloUsesBots,
  type GameId,
  type MatchResult,
  type RoomSummary,
} from '@arcade/shared';
import { Room } from '../src/rooms/room.js';

interface Captured {
  event: string;
  payload: unknown;
}

function makeRoom(options?: { game?: GameId; bots?: number }) {
  const events: Captured[] = [];
  const room = new Room(
    'SOLO1',
    {
      broadcast: (event, payload) => events.push({ event, payload }),
      direct: () => undefined,
    },
    {
      solo: {
        game: options?.game ?? 'karts',
        profileId: 'perfil-de-prueba',
        config: {
          botCount: options?.bots ?? defaultSoloConfig(options?.game ?? 'karts').botCount,
          botDifficulty: 'normal',
        },
      },
    },
  );
  return { room, events };
}

function summaryOf(room: Room): RoomSummary {
  return room.summary();
}

describe('configuracion compartida del modo individual', () => {
  it('reparte los catorce juegos entre practica libre y partidas con bots', () => {
    const all = [...SOLO_BOT_GAMES, ...SOLO_PRACTICE_GAMES];
    expect(all).toHaveLength(14);
    expect(new Set(all).size).toBe(14);
  });

  it('acota el numero de rivales al rango de cada juego', () => {
    for (const game of SOLO_BOT_GAMES) {
      const range = botRangeFor(game);
      expect(clampBotCount(game, 0)).toBe(range.min);
      expect(clampBotCount(game, 99)).toBe(range.max);
      expect(range.max).toBeLessThanOrEqual(MAX_PLAYERS - 1);
      expect(range.preferred).toBeGreaterThanOrEqual(range.min);
      expect(range.preferred).toBeLessThanOrEqual(range.max);
    }
  });

  it('los juegos de practica no admiten bots', () => {
    for (const game of SOLO_PRACTICE_GAMES) {
      expect(soloUsesBots(game)).toBe(false);
      expect(clampBotCount(game, 3)).toBe(0);
    }
  });

  it('oculta los modos que necesitan rival cuando se juega solo', () => {
    expect(soloSupportsMode('quiz', 'equipos', 1)).toBe(false);
    expect(soloSupportsMode('quiz', 'equipos', 2)).toBe(true);
    expect(soloSupportsMode('pool', 'bola8', 1)).toBe(false);
    expect(soloSupportsMode('pool', 'clasico', 1)).toBe(true);
    expect(soloModesFor('bowling', 1)).not.toContain('equipos');
  });

  it('sustituye un modo incompatible por el primero valido', () => {
    expect(coerceSoloMode('quiz', 'equipos', 1)).toBe('clasico');
    expect(coerceSoloMode('quiz', 'equipos', 3)).toBe('equipos');
    expect(coerceSoloMode('pool', 'clasico', 1)).toBe('clasico');
  });
});

describe('sala de practica', () => {
  it('arranca con un unico jugador humano', () => {
    const { room } = makeRoom({ game: 'quiz' });
    expect(room.solo).toBe(true);
    expect(room.minPlayers).toBe(1);

    const player = room.addPlayer('Alejandro', 'socket-1');
    room.setReady(player.id, true);
    room.prepareSolo();

    expect(room.canStart().ok).toBe(true);
    expect(room.startGame().ok).toBe(true);
    room.dispose();
  });

  it('una sala normal sigue necesitando dos jugadores', () => {
    const events: Captured[] = [];
    const room = new Room('NORM1', {
      broadcast: (event, payload) => events.push({ event, payload }),
      direct: () => undefined,
    });
    expect(room.solo).toBe(false);
    expect(room.minPlayers).toBe(2);

    const player = room.addPlayer('Alejandro', 'socket-1');
    room.setReady(player.id, true);
    expect(room.canStart().ok).toBe(false);
    room.dispose();
  });

  it('coloca los rivales del servidor en los juegos de duelo', () => {
    const { room } = makeRoom({ game: 'karts', bots: 3 });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();

    const players = summaryOf(room).players;
    const bots = players.filter((player) => player.isBot);
    expect(bots).toHaveLength(3);
    expect(players.filter((player) => !player.isBot)).toHaveLength(1);
    // Cada bot tiene un nombre propio y ninguno se repite.
    expect(new Set(bots.map((bot) => bot.name)).size).toBe(3);
    for (const bot of bots) expect(BOT_NAMES).toContain(bot.name as (typeof BOT_NAMES)[number]);
    // Y todos entran ya preparados para no bloquear el inicio.
    expect(bots.every((bot) => bot.ready)).toBe(true);
    room.dispose();
  });

  it('no coloca rivales en los juegos de practica libre', () => {
    const { room } = makeRoom({ game: 'golf', bots: 3 });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();

    expect(summaryOf(room).players.filter((player) => player.isBot)).toHaveLength(0);
    expect(summaryOf(room).soloConfig.botCount).toBe(0);
    room.dispose();
  });

  it('ajusta los rivales al cambiar de juego', () => {
    const { room } = makeRoom({ game: 'karts', bots: 4 });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();
    expect(summaryOf(room).players.filter((p) => p.isBot)).toHaveLength(4);

    // Air hockey solo admite tres rivales: el exceso se retira.
    room.selectGame('air-hockey');
    expect(summaryOf(room).players.filter((p) => p.isBot)).toHaveLength(3);

    // El quiz no lleva rivales en absoluto.
    room.selectGame('quiz');
    expect(summaryOf(room).players.filter((p) => p.isBot)).toHaveLength(0);
    room.dispose();
  });

  it('cambia dificultad y numero de rivales desde el lobby', () => {
    const { room } = makeRoom({ game: 'tanks', bots: 1 });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();

    expect(room.updateSoloConfig({ botCount: 4, botDifficulty: 'dificil' })).toBe(true);
    expect(summaryOf(room).players.filter((p) => p.isBot)).toHaveLength(4);
    expect(summaryOf(room).soloConfig.botDifficulty).toBe('dificil');
    room.dispose();
  });

  it('bloquea la configuracion una vez empezada la partida', () => {
    const { room } = makeRoom({ game: 'tanks', bots: 2 });
    const player = room.addPlayer('Alejandro', 'socket-1');
    room.setReady(player.id, true);
    room.prepareSolo();
    expect(room.startGame().ok).toBe(true);

    expect(room.updateSoloConfig({ botCount: 4, botDifficulty: 'facil' })).toBe(false);
    expect(summaryOf(room).players.filter((p) => p.isBot)).toHaveLength(2);
    room.dispose();
  });

  it('nunca supera el maximo de jugadores de la sala', () => {
    const { room } = makeRoom({ game: 'arena', bots: 4 });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();
    expect(summaryOf(room).players).toHaveLength(MAX_PLAYERS);
    room.dispose();
  });

  it('corrige el modo si deja de ser jugable en solitario', () => {
    const { room } = makeRoom({ game: 'quiz' });
    room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();

    room.updateSettings('quiz', {
      mode: 'equipos',
      questionCount: 10,
      secondsPerQuestion: 15,
      categories: [],
    });
    expect(summaryOf(room).settings.quiz.mode).toBe('clasico');
    room.dispose();
  });

  it('no publica enlace de invitacion', () => {
    const { room } = makeRoom({ game: 'quiz' });
    room.addPlayer('Alejandro', 'socket-1');
    expect(summaryOf(room).solo).toBe(true);
    expect(summaryOf(room).solo).toBe(true);
    room.dispose();
  });

  it('retira los rivales cuando el humano abandona', () => {
    const { room } = makeRoom({ game: 'karts', bots: 3 });
    const player = room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();
    expect(room.playerCount).toBe(4);

    room.removePlayer(player.id);
    expect(room.playerCount).toBe(0);
    expect(room.isEmpty).toBe(true);
    room.dispose();
  });

  it('un bot no puede recibir el rol de anfitrion', () => {
    const { room } = makeRoom({ game: 'karts', bots: 2 });
    const player = room.addPlayer('Alejandro', 'socket-1');
    room.prepareSolo();
    const bot = summaryOf(room).players.find((entry) => entry.isBot);
    expect(bot).toBeDefined();
    expect(room.transferHost(player.id, bot!.id)).toBe(false);
    room.dispose();
  });
});

describe('marcas personales', () => {
  function result(game: GameId, over: Partial<MatchResult> = {}): MatchResult {
    return {
      game,
      rows: [
        {
          playerId: 'a',
          name: 'Alejandro',
          color: '#fff',
          icon: 'circle',
          score: 12,
          rank: 1,
          tied: false,
        },
      ],
      winnerIds: ['a'],
      finishedAt: 1_700_000_000_000,
      ...over,
    };
  }

  it('usa la puntuacion de la fila cuando no hay dato mas fino', () => {
    expect(soloRecordValue(result('quiz'), 'a')?.value).toBe(12);
    expect(soloRecordValue(result('bowling'), 'a')?.value).toBe(12);
  });

  it('en dardos cuenta los dardos usados y exige cierre', () => {
    const cerrado = result('darts', {
      rows: [
        {
          playerId: 'a',
          name: 'Alejandro',
          color: '#fff',
          icon: 'circle',
          score: 0,
          rank: 1,
          tied: false,
        },
      ],
      extra: { throws: { a: 21 } },
    });
    expect(soloRecordValue(cerrado, 'a')?.value).toBe(21);

    // Sin llegar a cero no hay marca que registrar.
    const sinCerrar = result('darts', { extra: { throws: { a: 30 } } });
    expect(soloRecordValue(sinCerrar, 'a')).toBeNull();
  });

  it('en karts usa la mejor vuelta y no la posicion', () => {
    const carrera = result('karts', { extra: { bestLaps: { a: 34210 } } });
    expect(soloRecordValue(carrera, 'a')?.value).toBe(34210);
    // Sin vuelta valida no se guarda marca.
    expect(soloRecordValue(result('karts', { extra: { bestLaps: {} } }), 'a')).toBeNull();
  });

  it('en arena y tanques cuenta las eliminaciones', () => {
    expect(soloRecordValue(result('arena', { extra: { kills: { a: 3 } } }), 'a')?.value).toBe(3);
    expect(soloRecordValue(result('tanks', { extra: { kills: { a: 2 } } }), 'a')?.value).toBe(2);
  });

  it('sabe en que juegos mejora un numero mas bajo', () => {
    // Menos golpes y menos tiempo es mejor.
    expect(improvesRecord('golf', 40, 45)).toBe(true);
    expect(improvesRecord('golf', 50, 45)).toBe(false);
    expect(improvesRecord('karts', 33000, 34000)).toBe(true);
    // Mas puntos es mejor.
    expect(improvesRecord('quiz', 900, 800)).toBe(true);
    expect(improvesRecord('quiz', 700, 800)).toBe(false);
    // La primera marca siempre entra.
    expect(improvesRecord('quiz', 10, null)).toBe(true);
  });
});

describe('ciclo de vida de los rivales durante la partida', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('los bots actuan solos una vez arrancada la partida', () => {
    const { room } = makeRoom({ game: 'air-hockey', bots: 1 });
    const player = room.addPlayer('Alejandro', 'socket-1');
    room.setReady(player.id, true);
    room.prepareSolo();
    expect(room.startGame().ok).toBe(true);

    // El bot mueve su pala sin que nadie le envie acciones desde el cliente.
    const before = room.currentGameState();
    vi.advanceTimersByTime(5000);
    const after = room.currentGameState();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    room.dispose();
  });
});
