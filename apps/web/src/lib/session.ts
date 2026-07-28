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
