import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@arcade/shared';
import { randomInt } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { Room, type RoomDeps } from './room.js';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly depsFactory: (code: string) => RoomDeps) {}

  startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), 15000);
    this.sweeper.unref?.();
  }

  stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('No se pudo generar un codigo de sala unico');
  }

  create(): Room {
    const code = this.generateCode();
    const room = new Room(code, this.depsFactory(code));
    this.rooms.set(code, room);
    logger.info('Sala creada', { code });
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  remove(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
    logger.info('Sala eliminada', { code });
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Elimina salas vacias caducadas y expulsa a desconectados sin vuelta. */
  sweep(now = Date.now()): void {
    const emptyTtl = env.ROOM_EMPTY_TTL_SECONDS * 1000;
    const grace = env.RECONNECT_GRACE_SECONDS * 1000;

    for (const [code, room] of this.rooms) {
      for (const player of room.publicPlayers()) {
        if (player.connection !== 'disconnected') continue;
        const internal = room.getPlayer(player.id);
        if (!internal?.disconnectedAt) continue;
        if (now - internal.disconnectedAt > grace) room.removePlayer(player.id);
      }
      if (room.isEmpty && room.emptySince && now - room.emptySince > emptyTtl) {
        this.remove(code);
      }
    }
  }
}
