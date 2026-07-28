import { env } from './env.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/** Limitador de mensajes por socket, con ventana deslizante simple. */
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
