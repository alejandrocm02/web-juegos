import { z } from 'zod';
import { GAME_IDS, MAX_PLAYERS, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './constants.js';
import { QUIZ_CATEGORIES } from './games/quiz.js';
import {
  ARENA_MODES,
  BLACKJACK_MODES,
  BOWLING_MODES,
  DARTS_MODES,
  GOLF_MODES,
  KARTS_MODES,
  POOL_MODES,
  QUIZ_MODES,
  SONGLESS_MODES,
  AIR_HOCKEY_MODES,
  TABLE_TENNIS_MODES,
  HEAD_SOCCER_MODES,
  HEAD_BASKETBALL_MODES,
  TANKS_MODES,
} from './games/modes.js';
import { TANK_MAP_IDS } from './games/tanks.js';
import { BOT_DIFFICULTIES } from './games/solo.js';
import { sanitizeName } from './util.js';

/* -------------------------------------------------------------------------- */
/*  Esquemas base                                                              */
/* -------------------------------------------------------------------------- */

export const gameIdSchema = z.enum(GAME_IDS);

export const playerNameSchema = z
  .string()
  .max(64)
  .transform((value) => sanitizeName(value))
  .refine((value) => value.length >= NAME_MIN_LENGTH, {
    message: 'El nombre debe tener al menos ' + NAME_MIN_LENGTH + ' caracteres',
  })
  .refine((value) => value.length <= NAME_MAX_LENGTH, {
    message: 'El nombre no puede superar los ' + NAME_MAX_LENGTH + ' caracteres',
  });

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, 'Codigo de sala invalido');

export const playerIdSchema = z.string().min(6).max(64);

/* -------------------------------------------------------------------------- */
/*  Configuracion por juego                                                    */
/* -------------------------------------------------------------------------- */

export const quizSettingsSchema = z.object({
  mode: z.enum(QUIZ_MODES),
  questionCount: z.number().int().min(5).max(20),
  secondsPerQuestion: z.number().int().min(5).max(60),
  categories: z.array(z.enum(QUIZ_CATEGORIES)).max(QUIZ_CATEGORIES.length),
});

export const dartsSettingsSchema = z.object({
  mode: z.enum(DARTS_MODES),
  aimAssist: z.enum(['facil', 'normal', 'dificil']),
});

export const poolSettingsSchema = z.object({
  mode: z.enum(POOL_MODES),
  colorBalls: z.number().int().min(5).max(12),
  tableFriction: z.enum(['lenta', 'normal', 'rapida']),
});

export const golfSettingsSchema = z.object({
  mode: z.enum(GOLF_MODES),
  ballCollisions: z.boolean(),
  holeTimeLimitSeconds: z.union([z.literal(60), z.literal(90), z.literal(120)]),
  maxStrokes: z.union([z.literal(8), z.literal(10), z.literal(12)]),
  autoResetOutOfBounds: z.boolean(),
  outOfBoundsPenalty: z.boolean(),
});

export const bowlingSettingsSchema = z.object({
  mode: z.enum(BOWLING_MODES),
  precision: z.enum(['facil', 'normal', 'dificil']),
});

export const kartsSettingsSchema = z.object({
  mode: z.enum(KARTS_MODES),
  track: z.string().min(2).max(24),
  laps: z.union([z.literal(2), z.literal(3), z.literal(5)]),
});

export const arenaSettingsSchema = z.object({
  mode: z.enum(ARENA_MODES),
  zonePace: z.enum(['lenta', 'normal', 'rapida']),
  pickups: z.boolean(),
});

export const blackjackSettingsSchema = z.object({
  mode: z.enum(BLACKJACK_MODES),
  rounds: z.union([z.literal(3), z.literal(5), z.literal(7)]),
});

export const songlessSettingsSchema = z.object({
  mode: z.enum(SONGLESS_MODES),
  rounds: z.union([z.literal(5), z.literal(7), z.literal(10)]),
});

export const airHockeySettingsSchema = z.object({
  mode: z.enum(AIR_HOCKEY_MODES),
  goalLimit: z.union([z.literal(5), z.literal(7), z.literal(9)]),
});

export const tableTennisSettingsSchema = z.object({
  mode: z.enum(TABLE_TENNIS_MODES),
  pointsToWin: z.union([z.literal(7), z.literal(11), z.literal(15)]),
});

export const headSoccerSettingsSchema = z.object({
  mode: z.enum(HEAD_SOCCER_MODES),
  goalLimit: z.union([z.literal(3), z.literal(5), z.literal(7)]),
});

export const headBasketballSettingsSchema = z.object({
  mode: z.enum(HEAD_BASKETBALL_MODES),
  pointsToWin: z.union([z.literal(6), z.literal(10), z.literal(14)]),
});

export const tanksSettingsSchema = z.object({
  mode: z.enum(TANKS_MODES),
  map: z.enum(TANK_MAP_IDS),
});

export const settingsPatchSchema = z.discriminatedUnion('game', [
  z.object({ game: z.literal('quiz'), settings: quizSettingsSchema }),
  z.object({ game: z.literal('darts'), settings: dartsSettingsSchema }),
  z.object({ game: z.literal('pool'), settings: poolSettingsSchema }),
  z.object({ game: z.literal('golf'), settings: golfSettingsSchema }),
  z.object({ game: z.literal('bowling'), settings: bowlingSettingsSchema }),
  z.object({ game: z.literal('karts'), settings: kartsSettingsSchema }),
  z.object({ game: z.literal('arena'), settings: arenaSettingsSchema }),
  z.object({ game: z.literal('blackjack'), settings: blackjackSettingsSchema }),
  z.object({ game: z.literal('songless'), settings: songlessSettingsSchema }),
  z.object({ game: z.literal('air-hockey'), settings: airHockeySettingsSchema }),
  z.object({ game: z.literal('table-tennis'), settings: tableTennisSettingsSchema }),
  z.object({ game: z.literal('head-soccer'), settings: headSoccerSettingsSchema }),
  z.object({ game: z.literal('head-basketball'), settings: headBasketballSettingsSchema }),
  z.object({ game: z.literal('tanks'), settings: tanksSettingsSchema }),
]);

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/* -------------------------------------------------------------------------- */
/*  Payloads cliente -> servidor                                               */
/* -------------------------------------------------------------------------- */

export const createRoomSchema = z.object({ name: playerNameSchema });
export const joinRoomSchema = z.object({ code: roomCodeSchema, name: playerNameSchema });

/**
 * Identificador anonimo y estable del navegador.
 *
 * Solo sirve para asociar las marcas personales del modo individual. No
 * contiene informacion del usuario: lo genera el cliente al azar y vive en
 * `localStorage`.
 */
export const profileIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Identificador de perfil invalido');

export const botDifficultySchema = z.enum(BOT_DIFFICULTIES);

export const soloConfigSchema = z.object({
  botCount: z
    .number()
    .int()
    .min(0)
    .max(MAX_PLAYERS - 1),
  botDifficulty: botDifficultySchema,
});

export const createSoloRoomSchema = z.object({
  name: playerNameSchema,
  profileId: profileIdSchema,
  game: gameIdSchema,
  config: soloConfigSchema,
});

export const updateSoloConfigSchema = soloConfigSchema;

export const recordsQuerySchema = z.object({ profileId: profileIdSchema });
export const rejoinSchema = z.object({ code: roomCodeSchema, token: z.string().min(10).max(200) });
export const selectGameSchema = z.object({ game: gameIdSchema });
export const readySchema = z.object({ ready: z.boolean() });
export const targetPlayerSchema = z.object({ playerId: playerIdSchema });

export const quizAnswerSchema = z.object({
  type: z.literal('quiz:answer'),
  questionIndex: z.number().int().min(0).max(50),
  answerIndex: z.number().int().min(0).max(3),
});

export const dartsThrowSchema = z.object({
  type: z.literal('darts:throw'),
  x: z.number().min(-1.2).max(1.2),
  y: z.number().min(-1.2).max(1.2),
});

export const poolShootSchema = z.object({
  type: z.literal('pool:shoot'),
  angle: z
    .number()
    .min(-Math.PI * 2)
    .max(Math.PI * 2),
  power: z.number().min(0.02).max(1),
});

export const golfShootSchema = z.object({
  type: z.literal('golf:shoot'),
  angle: z
    .number()
    .min(-Math.PI * 2)
    .max(Math.PI * 2),
  power: z.number().min(0.02).max(1),
  seq: z.number().int().min(0).max(100000),
});

export const bowlingRollSchema = z.object({
  type: z.literal('bowling:roll'),
  /** Desviacion lateral del lanzamiento, de -1 (izquierda) a 1 (derecha). */
  aim: z.number().min(-1).max(1),
  power: z.number().min(0.15).max(1),
  /** Efecto lateral que curva la bola durante el recorrido. */
  spin: z.number().min(-1).max(1),
});

/**
 * Entrada de conduccion.
 * El cliente solo la envia cuando cambia (tecla pulsada o soltada), no en cada
 * fotograma: asi la carrera cabe de sobra en el limite de mensajes por socket.
 */
export const kartsInputSchema = z.object({
  type: z.literal('karts:input'),
  throttle: z.number().min(-1).max(1),
  steer: z.number().min(-1).max(1),
  braking: z.boolean(),
});

/**
 * Intencion de movimiento y ataque en la arena.
 * Como en karts, el cliente solo la envia cuando cambia. El servidor decide si
 * la posicion resultante es valida y cuanto dano se aplica.
 */
export const arenaInputSchema = z.object({
  type: z.literal('arena:input'),
  moveX: z.number().min(-1).max(1),
  moveY: z.number().min(-1).max(1),
  facing: z
    .number()
    .min(-Math.PI * 2)
    .max(Math.PI * 2),
  attack: z.boolean(),
});

export const blackjackHitSchema = z.object({ type: z.literal('blackjack:hit') });
export const blackjackStandSchema = z.object({ type: z.literal('blackjack:stand') });
export const songlessAnswerSchema = z.object({
  type: z.literal('songless:answer'),
  roundIndex: z.number().int().min(0).max(20),
  answerIndex: z.number().int().min(0).max(3),
});

export const sportInputSchema = z.object({
  type: z.literal('sport:input'),
  game: z.enum(['air-hockey', 'table-tennis']),
  /** Posición deseada, normalizada para no confiar en dimensiones del cliente. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const headSportInputSchema = z.object({
  type: z.literal('head-sport:input'),
  game: z.enum(['head-soccer', 'head-basketball']),
  moveX: z.number().min(-1).max(1),
  jump: z.boolean(),
  kick: z.boolean(),
});

export const tanksMoveSchema = z.object({
  type: z.literal('tanks:move'),
  direction: z.union([z.literal(-1), z.literal(1)]),
});

export const tanksFireSchema = z.object({
  type: z.literal('tanks:fire'),
  angle: z
    .number()
    .min(-Math.PI + 0.12)
    .max(-0.12),
  power: z.number().min(0.2).max(1),
});

export const golfResetSchema = z.object({ type: z.literal('golf:reset') });
export const golfSyncSchema = z.object({ type: z.literal('golf:sync') });

export const gameActionSchema = z.discriminatedUnion('type', [
  quizAnswerSchema,
  bowlingRollSchema,
  kartsInputSchema,
  arenaInputSchema,
  blackjackHitSchema,
  blackjackStandSchema,
  songlessAnswerSchema,
  sportInputSchema,
  headSportInputSchema,
  tanksMoveSchema,
  tanksFireSchema,
  dartsThrowSchema,
  poolShootSchema,
  golfShootSchema,
  golfResetSchema,
  golfSyncSchema,
]);

export type GameAction = z.infer<typeof gameActionSchema>;

/* -------------------------------------------------------------------------- */
/*  Errores                                                                    */
/* -------------------------------------------------------------------------- */

export const ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_IN_PROGRESS',
  'NAME_TAKEN',
  'INVALID_NAME',
  'INVALID_PAYLOAD',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'ALREADY_STARTED',
  'NOT_IN_ROOM',
  'NOT_YOUR_TURN',
  'ACTION_REJECTED',
  'SOLO_ROOM',
  'RATE_LIMITED',
  'SERVER_BUSY',
  'SESSION_EXPIRED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  code: ErrorCode;
  message: string;
}

/* -------------------------------------------------------------------------- */
/*  Nombres de eventos                                                         */
/* -------------------------------------------------------------------------- */

export const CLIENT_EVENTS = {
  createRoom: 'room:create',
  createSoloRoom: 'room:create-solo',
  updateSoloConfig: 'room:solo-config',
  requestRecords: 'solo:records',
  joinRoom: 'room:join',
  rejoin: 'room:rejoin',
  leaveRoom: 'room:leave',
  selectGame: 'room:select-game',
  updateSettings: 'room:update-settings',
  setReady: 'room:ready',
  startGame: 'room:start',
  kickPlayer: 'room:kick',
  transferHost: 'room:transfer-host',
  backToLobby: 'room:back-to-lobby',
  gameAction: 'game:action',
} as const;

export const SERVER_EVENTS = {
  session: 'session',
  sessionReplaced: 'session:replaced',
  roomState: 'room:state',
  error: 'app:error',
  gameStarted: 'game:started',
  gameState: 'game:state',
  gameSnapshot: 'game:snapshot',
  gameEvent: 'game:event',
  gameOver: 'game:over',
  kicked: 'room:kicked',
  toast: 'app:toast',
  /** Marca personal calculada al terminar una partida en solitario. */
  soloOutcome: 'solo:outcome',
  /** Listado completo de marcas personales del perfil. */
  soloRecords: 'solo:records',
} as const;

export const MAX_ROOM_PLAYERS = MAX_PLAYERS;
