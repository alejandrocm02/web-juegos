import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@arcade/shared';
import { randomInt } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { Room, type RoomDeps, type RoomOptions } from './room.js';

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

  /**
   * true si el proceso ya sostiene todas las salas que admite.
   *
   * Se consulta antes de crear: es preferible rechazar una sala nueva con un
   * error claro que quedarse sin memoria y tirar las partidas en curso.
   */
  get isAtCapacity(): boolean {
    return this.rooms.size >= env.MAX_ROOMS;
  }

  create(options: RoomOptions = {}): Room {
    if (this.isAtCapacity) {
      throw new Error('Limite de salas alcanzado (' + env.MAX_ROOMS + ')');
    }
    const code = this.generateCode();
    const room = new Room(code, this.depsFactory(code), options);
    this.rooms.set(code, room);
    logger.info('Sala creada', { code, solo: room.solo });
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

  /** Todas las salas vivas. Se usa para metricas y para el apagado ordenado. */
  all(): Room[] {
    return [...this.rooms.values()];
  }

  /**
   * Foto del estado del proceso.
   *
   * Es deliberadamente barata (recorre las salas una vez y no serializa nada)
   * para poder consultarse con frecuencia sin afectar a las partidas.
   */
  snapshotMetrics(): {
    rooms: number;
    maxRooms: number;
    playing: number;
    lobby: number;
    players: number;
    connected: number;
    bots: number;
    solo: number;
  } {
    let playing = 0;
    let lobby = 0;
    let players = 0;
    let connected = 0;
    let bots = 0;
    let solo = 0;

    for (const room of this.rooms.values()) {
      if (room.currentPhase === 'playing') playing += 1;
      if (room.currentPhase === 'lobby') lobby += 1;
      if (room.solo) solo += 1;
      for (const player of room.publicPlayers()) {
        if (player.isBot) {
          bots += 1;
          continue;
        }
        players += 1;
        if (player.connection === 'connected') connected += 1;
      }
    }

    return {
      rooms: this.rooms.size,
      maxRooms: env.MAX_ROOMS,
      playing,
      lobby,
      players,
      connected,
      bots,
      solo,
    };
  }

  /**
   * Avisa a todas las salas de que el proceso se va a apagar.
   *
   * No cierra nada: solo da a los jugadores unos segundos de contexto para que
   * la partida no se corte en seco sin explicacion.
   */
  announceShutdown(seconds: number): void {
    const message =
      'El servidor se reinicia en ' +
      seconds +
      ' s. Guarda el codigo de sala: podras volver a entrar en cuanto vuelva.';
    for (const room of this.rooms.values()) {
      if (room.isEmpty) continue;
      room.announce(message);
    }
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
