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

/**
 * Sockets simultaneos permitidos desde una misma direccion IP.
 *
 * El margen es amplio a proposito: detras de un NAT domestico, de una oficina
 * o de una red de instituto, decenas de personas comparten una unica IP
 * publica. Un limite ajustado no pararia a un atacante (le sobran IPs) y en
 * cambio dejaria fuera justo al grupo de amigos para el que existe el juego.
 */
export const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP ?? 64);

/**
 * Salas *en uso* que puede tener a la vez una misma direccion IP.
 *
 * Cuenta salas con alguien dentro, no salas que existan. La diferencia importa:
 * una sala vacia sobrevive ROOM_EMPTY_TTL_SECONDS por si alguien vuelve, asi
 * que contar por existencia castigaba a quien simplemente crea una sala, se
 * arrepiente y crea otra. Encadenar unas pocas partidas bastaba para agotar la
 * cuota, que es exactamente lo que ocurrio en los tests de extremo a extremo.
 */
export const MAX_ROOMS_PER_IP = Number(process.env.MAX_ROOMS_PER_IP ?? 16);

/**
 * Conexiones simultaneas por direccion IP.
 *
 * Las salas no se cuentan aqui: su cupo se calcula sobre las que de verdad
 * tienen gente dentro, y de eso sabe el RoomManager. Un contador aparte solo
 * podria desincronizarse.
 */
export class IpQuota {
  private sockets = new Map<string, number>();

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

  socketCount(ip: string): number {
    return this.sockets.get(ip) ?? 0;
  }

  clear(): void {
    this.sockets.clear();
  }
}
