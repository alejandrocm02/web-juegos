import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@arcade/shared';
import { randomInt } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { Room, type RoomDeps, type RoomOptions } from './room.js';
import { MAX_ROOMS, MAX_ROOMS_PER_IP } from '../security.js';

/** Se lanza cuando el proceso ya sostiene todas las salas que admite. */
export class RoomCapacityError extends Error {
  constructor() {
    super('El servidor esta al completo. Intentalo dentro de un momento.');
    this.name = 'RoomCapacityError';
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;
  constructor(
    private readonly depsFactory: (code: string) => RoomDeps,
    private readonly maxRooms: number = MAX_ROOMS,
  ) {}

  /** true si todavia cabe una sala mas en el proceso. */
  get hasCapacity(): boolean {
    return this.rooms.size < this.maxRooms;
  }

  /**
   * Salas de esa IP que ahora mismo tienen a alguien conectado.
   *
   * Se mira `hasPlayersOnline` y no `!isEmpty` a proposito: al cerrar la
   * pestana el jugador conserva su plaza durante RECONNECT_GRACE_SECONDS por si
   * vuelve, asi que una sala abandonada seguiria pareciendo ocupada minuto y
   * medio. Con partidas encadenadas eso agota el cupo sin que haya en ningun
   * momento mas de una sala en uso.
   *
   * Se recorre en vez de llevar un contador porque un contador se
   * desincroniza: habria que acertar en cada alta, baja, barrido, desconexion y
   * reconexion. Crear salas es raro y el total esta acotado por MAX_ROOMS, asi
   * que recorrer sale gratis y no puede mentir.
   */
  activeRoomsForIp(ip: string): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      if (room.ownerIp === ip && room.hasPlayersOnline) total += 1;
    }
    return total;
  }

  /** true si esa IP puede abrir otra sala. */
  hasCapacityForIp(ip: string): boolean {
    return this.activeRoomsForIp(ip) < MAX_ROOMS_PER_IP;
  }

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

  create(options: RoomOptions = {}): Room {
    // El techo se comprueba aqui y no solo en el handler, para que ninguna via
    // futura de creacion pueda saltarselo por descuido.
    if (!this.hasCapacity) throw new RoomCapacityError();
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
      maxRooms: this.maxRooms,
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
