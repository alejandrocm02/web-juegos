import { useSyncExternalStore } from 'react';

/**
 * Vista 2D o 3D de los juegos que tienen las dos.
 *
 * La 3D es opcional y convive con la 2D: se activa con `?mode=3d` (o con el
 * botón de cada juego) y se recuerda en este navegador. Si el dispositivo no
 * puede con ella —sin WebGL2, contexto perdido o por debajo de 25 fps— se
 * vuelve a la 2D durante esta sesión sin tocar la partida: el estado lo manda
 * el servidor y las dos vistas pintan lo mismo.
 */

export type RenderMode = '2d' | '3d';

const STORAGE_KEY = 'arcade:render-mode';

/** Lee la vista pedida. La URL manda sobre lo recordado y además lo actualiza. */
export function readRequestedMode(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): RenderMode {
  const param = new URLSearchParams(search).get('mode');
  if (param === '3d' || param === '2d') {
    try {
      storage?.setItem(STORAGE_KEY, param);
    } catch {
      /* Almacenamiento bloqueado: la preferencia vale solo para esta carga. */
    }
    return param;
  }
  try {
    return storage?.getItem(STORAGE_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

let webgl2: boolean | null = null;
export function supportsWebGL2(): boolean {
  if (webgl2 === null) {
    try {
      webgl2 = Boolean(document.createElement('canvas').getContext('webgl2'));
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface Snapshot {
  /** Lo que el jugador ha pedido. */
  requested: RenderMode;
  /** Motivo por el que esta sesión se queda en 2D, si lo hay. */
  fallback: string | null;
}

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function current(): Snapshot {
  if (!snapshot) {
    snapshot = {
      requested: readRequestedMode(window.location.search, safeStorage()),
      fallback: null,
    };
  }
  return snapshot;
}

function update(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setRenderMode(mode: RenderMode): void {
  try {
    safeStorage()?.setItem(STORAGE_KEY, mode);
  } catch {
    /* Sin almacenamiento la elección dura lo que dure la página. */
  }
  // Pedir 3D a mano es también pedir otro intento tras un fallback.
  update({ requested: mode, fallback: null });
}

/** Deja la sesión en 2D. La preferencia guardada no cambia: es un fallo del momento. */
export function fallBackTo2D(reason: string): void {
  if (current().fallback) return;
  console.warn('[3d] Se vuelve a la vista 2D:', reason);
  update({ ...current(), fallback: reason });
}

export function useRenderMode(): {
  mode: RenderMode;
  requested: RenderMode;
  fallback: string | null;
  available: boolean;
} {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current,
    current,
  );
  const available = supportsWebGL2();
  return {
    mode: state.requested === '3d' && available && !state.fallback ? '3d' : '2d',
    requested: state.requested,
    fallback: state.fallback,
    available,
  };
}

/**
 * Lee `?mode=` al arrancar la aplicación. Las vistas de juego se cargan más
 * tarde, cuando la URL ya es la de la sala y el parámetro se ha perdido.
 */
export function initRenderMode(): void {
  current();
}

/** Solo para pruebas: olvida el estado en memoria. */
export function resetRenderModeForTests(): void {
  snapshot = null;
  webgl2 = null;
}
