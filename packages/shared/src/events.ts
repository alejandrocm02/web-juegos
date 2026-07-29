import { z } from 'zod';
import { GAME_IDS, MAX_PLAYERS, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './constants.js';
import { QUIZ_CATEGORIES } from './games/quiz.js';
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
  questionCount: z.number().int().min(5).max(20),
  secondsPerQuestion: z.number().int().min(5).max(60),
  categories: z.array(z.enum(QUIZ_CATEGORIES)).max(QUIZ_CATEGORIES.length),
});

export const dartsSettingsSchema = z.object({
  startScore: z.literal(301),
  aimAssist: z.enum(['facil', 'normal', 'dificil']),
});

export const poolSettingsSchema = z.object({
  colorBalls: z.number().int().min(5).max(12),
  tableFriction: z.enum(['lenta', 'normal', 'rapida']),
});

export const golfSettingsSchema = z.object({
  ballCollisions: z.boolean(),
  holeTimeLimitSeconds: z.union([z.literal(60), z.literal(90), z.literal(120)]),
  maxStrokes: z.union([z.literal(8), z.literal(10), z.literal(12)]),
  autoResetOutOfBounds: z.boolean(),
  outOfBoundsPenalty: z.boolean(),
});

export const settingsPatchSchema = z.discriminatedUnion('game', [
  z.object({ game: z.literal('quiz'), settings: quizSettingsSchema }),
  z.object({ game: z.literal('darts'), settings: dartsSettingsSchema }),
  z.object({ game: z.literal('pool'), settings: poolSettingsSchema }),
  z.object({ game: z.literal('golf'), settings: golfSettingsSchema }),
]);

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/* -------------------------------------------------------------------------- */
/*  Payloads cliente -> servidor                                               */
/* -------------------------------------------------------------------------- */

export const createRoomSchema = z.object({ name: playerNameSchema });
export const joinRoomSchema = z.object({ code: roomCodeSchema, name: playerNameSchema });
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

export const golfResetSchema = z.object({ type: z.literal('golf:reset') });
export const golfSyncSchema = z.object({ type: z.literal('golf:sync') });

export const gameActionSchema = z.discriminatedUnion('type', [
  quizAnswerSchema,
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
  'RATE_LIMITED',
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
} as const;

export const MAX_ROOM_PLAYERS = MAX_PLAYERS;
