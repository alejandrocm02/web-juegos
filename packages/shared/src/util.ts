import { NAME_MAX_LENGTH } from './constants.js';

const SPACE_CODE = 32;
const DEL_CODE = 127;
const COMBINING_START = 0x300;
const COMBINING_END = 0x36f;

function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= SPACE_CODE && code !== DEL_CODE) out += ch;
  }
  return out;
}

function stripDiacritics(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < COMBINING_START || code > COMBINING_END) out += ch;
  }
  return out;
}

/** Limpia un nombre de jugador: elimina caracteres de control, colapsa espacios y recorta. */
export function sanitizeName(raw: string): string {
  return stripControlChars(raw).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
}

/** Comparación de nombres insensible a mayúsculas y acentos, para detectar duplicados. */
export function normalizeName(name: string): string {
  return stripDiacritics(sanitizeName(name).toLowerCase());
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * PRNG determinista (mulberry32). El mismo seed produce la misma secuencia en
 * cualquier máquina, lo que permite que servidor y cliente compartan resultados.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}
