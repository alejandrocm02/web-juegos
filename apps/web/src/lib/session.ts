const KEY = 'arcade.session.v1';

export interface StoredSession {
  code: string;
  token: string;
  playerId: string;
  name: string;
}

/** Token anonimo de reconexion. No contiene datos personales. */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.code || !parsed.token || !parsed.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

const PROFILE_KEY = 'arcade.profile.v1';

/**
 * Identificador anonimo y estable de este navegador.
 *
 * Solo sirve para reconocer las marcas personales del modo individual entre
 * sesiones. Se genera al azar la primera vez y no viaja asociado a ningun dato
 * del usuario: si se borra, simplemente se empieza de cero.
 */
export function loadProfileId(): string {
  try {
    const existing = localStorage.getItem(PROFILE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const created = createProfileId();
    localStorage.setItem(PROFILE_KEY, created);
    return created;
  } catch {
    // Sin almacenamiento las marcas no persisten, pero la partida funciona.
    return createProfileId();
  }
}

function createProfileId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID().replace(/-/g, '');
  let id = '';
  for (let i = 0; i < 32; i += 1) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

export function loadName(): string {
  return loadSession()?.name ?? localStorage.getItem('arcade.name') ?? '';
}

export function saveName(name: string): void {
  try {
    localStorage.setItem('arcade.name', name);
  } catch {
    /* almacenamiento no disponible */
  }
}
