import { env } from './env.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limitador de mensajes por socket.
 *
 * Es una ventana FIJA, no deslizante: al cruzar `resetAt` el contador vuelve a
 * cero de golpe. Eso permite un pico de hasta 2x el limite justo en la frontera
 * de dos ventanas, que para este caso de uso es aceptable y cuesta O(1) por
 * mensaje. Si algun dia hace falta precision, aqui es donde se cambia.
 */
export class SocketRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit = env.SOCKET_RATE_LIMIT,
    private readonly windowMs = env.SOCKET_RATE_WINDOW_MS,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }
}

/** Tamano maximo aceptado para un payload de socket (bytes aproximados). */
export const MAX_PAYLOAD_BYTES = 4096;

export function payloadTooLarge(payload: unknown): boolean {
  try {
    return JSON.stringify(payload ?? null).length > MAX_PAYLOAD_BYTES;
  } catch {
    return true;
  }
}

/** Salas simultaneas que admite el proceso antes de rechazar creaciones. */
export const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 500);

/** Sockets simultaneos permitidos desde una misma direccion IP. */
export const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP ?? 24);

/** Salas activas que puede tener creadas a la vez una misma direccion IP. */
export const MAX_ROOMS_PER_IP = Number(process.env.MAX_ROOMS_PER_IP ?? 8);

/**
 * Contador de recursos por direccion IP.
 *
 * El limitador por socket no basta: abrir conexiones nuevas es barato, asi que
 * sin esto un script puede crear salas sin techo. Cada sala vacia sobrevive
 * ROOM_EMPTY_TTL_SECONDS y, si esta jugando, mantiene un bucle a 60 Hz.
 */
export class IpQuota {
  private sockets = new Map<string, number>();
  private rooms = new Map<string, number>();

  addSocket(ip: string): boolean {
    const current = this.sockets.get(ip) ?? 0;
    if (current >= MAX_SOCKETS_PER_IP) return false;
    this.sockets.set(ip, current + 1);
    return true;
  }

  removeSocket(ip: string): void {
    const next = (this.sockets.get(ip) ?? 0) - 1;
    if (next <= 0) this.sockets.delete(ip);
    else this.sockets.set(ip, next);
  }

  addRoom(ip: string): boolean {
    const current = this.rooms.get(ip) ?? 0;
    if (current >= MAX_ROOMS_PER_IP) return false;
    this.rooms.set(ip, current + 1);
    return true;
  }

  removeRoom(ip: string): void {
    const next = (this.rooms.get(ip) ?? 0) - 1;
    if (next <= 0) this.rooms.delete(ip);
    else this.rooms.set(ip, next);
  }

  socketCount(ip: string): number {
    return this.sockets.get(ip) ?? 0;
  }

  roomCount(ip: string): number {
    return this.rooms.get(ip) ?? 0;
  }

  clear(): void {
    this.sockets.clear();
    this.rooms.clear();
  }
}
