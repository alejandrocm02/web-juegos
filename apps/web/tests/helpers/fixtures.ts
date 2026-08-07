import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PublicPlayer,
  type RoomSummary,
} from '@arcade/shared';
import { vi } from 'vitest';

/**
 * Piezas minimas de estado para los tests de componentes.
 *
 * El store real abre un socket nada mas importarse, asi que las pruebas
 * sustituyen `useApp` por un valor controlado. Estas fabricas traen valores por
 * defecto sensatos para que cada prueba solo declare lo que le importa.
 */

export function makePlayer(overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return {
    id: 'p1',
    name: 'Ana',
    color: '#38bdf8',
    icon: 'circle',
    isHost: true,
    ready: false,
    connection: 'connected',
    joinedAt: 1,
    ...overrides,
  };
}

export function makeRoom(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    code: 'ABC12',
    phase: 'lobby',
    result: null,
    selectedGame: 'quiz',
    players: [makePlayer()],
    hostId: 'p1',
    settings: structuredClone(DEFAULT_SETTINGS),
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    createdAt: 1,
    solo: false,
    soloConfig: { botCount: 0, botDifficulty: 'normal' },
    ...overrides,
  };
}

/** Acciones del store, todas espiadas, para comprobar que la vista las invoca. */
export function makeActions() {
  return {
    selectGame: vi.fn(),
    updateSettings: vi.fn(),
    updateSoloConfig: vi.fn(),
    setReady: vi.fn(),
    startGame: vi.fn(),
    kickPlayer: vi.fn(),
    transferHost: vi.fn(),
    leaveRoom: vi.fn(),
    dismissError: vi.fn(),
    backToLobby: vi.fn(),
    refreshRecords: vi.fn(),
  };
}
