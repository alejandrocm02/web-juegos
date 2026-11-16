/**
 * Nombres de los eventos de Socket.IO, códigos de error y tipos compartidos.
 * Sin dependencias en tiempo de ejecución: lo importa también el navegador.
 * Los esquemas de validación están en `schemas.ts`.
 */
import { MAX_PLAYERS } from './constants.js';

export type { GameAction, SettingsPatch } from './schemas.js';

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
  updateTournament: 'room:tournament',
  sendChat: 'chat:send',
  sendReaction: 'chat:react',
  setReady: 'room:ready',
  startGame: 'room:start',
  kickPlayer: 'room:kick',
  transferHost: 'room:transfer-host',
  backToLobby: 'room:back-to-lobby',
  gameAction: 'game:action',
  /**
   * Muestra de reloj. Se envia con acuse (`emitWithAck`) y el servidor responde
   * con su hora; el cliente calcula el desfase con el tiempo de ida y vuelta.
   * No necesita sala: la cuenta atras debe ser correcta desde el primer estado.
   */
  clockSync: 'clock:sync',
} as const;

/** Respuesta a `clock:sync`: la hora del servidor en milisegundos Unix. */
export interface ClockSyncReply {
  serverTime: number;
}

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
  /** Clasificacion del torneo tras cada prueba y al terminar. */
  tournament: 'tournament:state',
  /** Un mensaje nuevo. El historial completo viaja en `chat:history`. */
  chatMessage: 'chat:message',
  chatHistory: 'chat:history',
  /** Reaccion efimera: se muestra y se descarta, no se guarda. */
  chatReaction: 'chat:reaction',
  /** Marca personal calculada al terminar una partida en solitario. */
  soloOutcome: 'solo:outcome',
  /** Listado completo de marcas personales del perfil. */
  soloRecords: 'solo:records',
} as const;

export const MAX_ROOM_PLAYERS = MAX_PLAYERS;
