import { CLIENT_EVENTS, type ClockSyncReply } from '@arcade/shared';
import type { Socket } from 'socket.io-client';

/**
 * Reloj del servidor visto desde el cliente.
 *
 * Los `deadline` de las partidas son horas absolutas del reloj del servidor.
 * Restarlos al `Date.now()` local mostraba una cuenta atrás distinta en cada
 * equipo, tan desfasada como sus relojes. Aquí se estima ese desfase con el
 * método de NTP: se pide la hora al servidor, se mide la ida y vuelta y se
 * supone que respondió en el punto medio. De varias muestras se queda la de
 * menor ida y vuelta, que es la que menos error puede tener.
 *
 * El servidor sigue decidiendo cuándo termina cada ronda; esto solo corrige lo
 * que ve el jugador.
 */

export interface ClockSample {
  /** `Date.now()` local al enviar la petición. */
  sentAt: number;
  /** Hora que devolvió el servidor. */
  serverTime: number;
  /** `Date.now()` local al recibir la respuesta. */
  receivedAt: number;
}

/** Una respuesta que tarda más que esto no dice nada útil sobre el desfase. */
const MAX_USEFUL_RTT_MS = 5_000;
const SAMPLES_PER_SYNC = 5;
const SAMPLE_GAP_MS = 120;
const SAMPLE_TIMEOUT_MS = 2_000;
/** Los relojes derivan y el usuario puede cambiar la hora: se repite cada minuto. */
const RESYNC_INTERVAL_MS = 60_000;

let offsetMs = 0;

/** Hora actual según el servidor. Úsala en vez de `Date.now()` con cualquier `deadline`. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function setClockOffset(offset: number): void {
  offsetMs = offset;
}

export function clockOffset(): number {
  return offsetMs;
}

export function resetClock(): void {
  offsetMs = 0;
}

/** Desfase servidor − cliente en ms, o `null` si ninguna muestra es válida. */
export function estimateOffset(samples: readonly ClockSample[]): number | null {
  let best: { rtt: number; offset: number } | null = null;
  for (const sample of samples) {
    const { sentAt, serverTime, receivedAt } = sample;
    if (![sentAt, serverTime, receivedAt].every(Number.isFinite)) continue;
    const rtt = receivedAt - sentAt;
    if (rtt < 0 || rtt > MAX_USEFUL_RTT_MS) continue;
    if (!best || rtt < best.rtt) {
      best = { rtt, offset: serverTime - (sentAt + rtt / 2) };
    }
  }
  return best ? Math.round(best.offset) : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeSample(socket: Socket): Promise<ClockSample | null> {
  const sentAt = Date.now();
  try {
    const reply = (await socket
      .timeout(SAMPLE_TIMEOUT_MS)
      .emitWithAck(CLIENT_EVENTS.clockSync)) as ClockSyncReply;
    return { sentAt, serverTime: Number(reply?.serverTime), receivedAt: Date.now() };
  } catch {
    // Sin respuesta (desconexión, cupo agotado): muestra perdida.
    return null;
  }
}

let syncing: Promise<void> | null = null;

/** Toma varias muestras y actualiza el desfase. Las llamadas simultáneas se agrupan. */
export function syncClock(socket: Socket): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const samples: ClockSample[] = [];
    for (let i = 0; i < SAMPLES_PER_SYNC && socket.connected; i += 1) {
      if (i > 0) await wait(SAMPLE_GAP_MS);
      const sample = await takeSample(socket);
      if (sample) samples.push(sample);
    }
    const offset = estimateOffset(samples);
    if (offset !== null) offsetMs = offset;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/**
 * Mantiene el reloj sincronizado mientras la página vive: al conectar y
 * reconectar, cada minuto con la pestaña visible y al volver de segundo plano,
 * que es cuando el reloj local ha podido saltar (suspensión del equipo).
 */
export function startClockSync(socket: Socket): () => void {
  const sync = () => {
    if (socket.connected) void syncClock(socket);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') sync();
  };
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, RESYNC_INTERVAL_MS);

  socket.on('connect', sync);
  document.addEventListener('visibilitychange', onVisibility);
  sync();

  return () => {
    window.clearInterval(interval);
    socket.off('connect', sync);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
