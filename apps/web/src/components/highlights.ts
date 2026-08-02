import type { PublicPlayer } from '@arcade/shared';

/**
 * Traduce los eventos que emite el servidor durante una partida a un "momento
 * destacado" que se muestra grande y centrado. Vive en el cliente porque es
 * puramente presentacional: el servidor sigue siendo la fuente de la verdad.
 */

export type HighlightTone = 'good' | 'bad' | 'neutral';

export interface Highlight {
  /** Identificador incremental para reiniciar la animacion en repeticiones. */
  id: number;
  title: string;
  detail: string | null;
  tone: HighlightTone;
}

interface RawEvent {
  kind?: unknown;
  playerId?: unknown;
  targetId?: unknown;
  strokes?: unknown;
  value?: unknown;
  result?: unknown;
  team?: unknown;
}

function nameOf(players: PublicPlayer[], id: unknown): string | null {
  if (typeof id !== 'string') return null;
  return players.find((player) => player.id === id)?.name ?? null;
}

/** Devuelve null si el evento no merece un momento destacado. */
export function describeGameEvent(
  payload: unknown,
  players: PublicPlayer[],
): Omit<Highlight, 'id'> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const event = payload as RawEvent;
  const kind = typeof event.kind === 'string' ? event.kind : null;
  if (!kind) return null;
  const who = nameOf(players, event.playerId);
  const target = nameOf(players, event.targetId);

  switch (kind) {
    case 'ace':
      return { title: 'Hoyo en uno', detail: who, tone: 'good' };
    case 'strike':
      return { title: 'Strike', detail: who, tone: 'good' };
    case 'spare':
      return { title: 'Spare', detail: who, tone: 'good' };
    case 'bust':
      return { title: 'Bust', detail: who ? who + ' se pasa' : null, tone: 'bad' };
    case 'checkout':
      return { title: 'Cierre exacto', detail: who, tone: 'good' };
    case 'kill':
      return {
        title: 'Eliminacion',
        detail: who && target ? who + ' elimina a ' + target : (target ?? who),
        tone: 'neutral',
      };
    case 'out':
      return { title: 'Fuera del recorrido', detail: who, tone: 'bad' };
    case 'blackjack-bust':
      return { title: 'Se pasa de 21', detail: who, tone: 'bad' };
    case 'blackjack-result':
      if (event.result === 'blackjack') {
        return { title: 'Blackjack', detail: who, tone: 'good' };
      }
      return null;
    case 'songless-hit':
      return { title: 'Melodía reconocida', detail: who, tone: 'good' };
    case 'sport-goal':
      return {
        title: '¡Punto!',
        detail: event.team === 'rojo' ? 'Equipo rojo' : 'Equipo azul',
        tone: 'good',
      };
    case 'head-score':
      return {
        title: '¡' + (typeof event.value === 'string' ? event.value : 'Punto') + '!',
        detail: event.team === 'rojo' ? 'Equipo rojo' : 'Equipo azul',
        tone: 'good',
      };
    default:
      // El resto de eventos (penalizaciones, reinicios, fin de tiempo) ya se
      // comunican en el HUD de cada juego y no interrumpen la pantalla.
      return null;
  }
}
