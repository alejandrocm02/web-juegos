/**
 * Chat de sala y reacciones rápidas.
 *
 * Es la pieza social que faltaba en una plataforma pensada para jugar con
 * amigos. Se divide en dos canales con propósitos distintos:
 *
 * - **Mensajes**: texto libre, pensados para el lobby, donde hay tiempo de
 *   escribir. Se conservan los últimos para que quien entre tarde vea el hilo.
 * - **Reacciones**: seis emojis con enfriamiento, pensados para la partida,
 *   donde nadie va a soltar el ratón para teclear. No se guardan: aparecen,
 *   se ven y desaparecen.
 */

export const CHAT_MAX_LENGTH = 160;
/** Mensajes que conserva la sala. Lo justo para entender de qué se habla. */
export const CHAT_HISTORY_SIZE = 30;

/** Enfriamientos, en milisegundos. Evitan el spam sin entorpecer la charla. */
export const CHAT_MESSAGE_COOLDOWN_MS = 700;
export const CHAT_REACTION_COOLDOWN_MS = 1200;

/**
 * Reacciones disponibles.
 *
 * Se publican como catálogo cerrado en vez de aceptar cualquier emoji: así el
 * servidor valida contra una lista, no hay que sanear texto arbitrario y la
 * interfaz puede dibujar seis botones fijos sin selector de emojis.
 */
export const CHAT_REACTIONS = [
  { id: 'aplauso', emoji: '👏', label: 'Aplauso' },
  { id: 'risa', emoji: '😂', label: 'Risa' },
  { id: 'asombro', emoji: '😮', label: 'Asombro' },
  { id: 'fuego', emoji: '🔥', label: 'Jugada increíble' },
  { id: 'pena', emoji: '😅', label: 'Casi' },
  { id: 'saludo', emoji: '👋', label: 'Saludo' },
] as const;

export type ChatReactionId = (typeof CHAT_REACTIONS)[number]['id'];

export const CHAT_REACTION_IDS = CHAT_REACTIONS.map((reaction) => reaction.id) as [
  ChatReactionId,
  ...ChatReactionId[],
];

export function reactionEmoji(id: ChatReactionId): string {
  return CHAT_REACTIONS.find((reaction) => reaction.id === id)?.emoji ?? '·';
}

export interface ChatMessage {
  id: string;
  playerId: string;
  /** Se copia el nombre y el color: el mensaje sigue leyéndose si el autor sale. */
  name: string;
  color: string;
  text: string;
  at: number;
}

export interface ChatReactionEvent {
  playerId: string;
  name: string;
  color: string;
  reaction: ChatReactionId;
  at: number;
}

/**
 * Limpia un mensaje de chat.
 *
 * Quita caracteres de control (incluidos saltos de línea, que romperían la
 * lista), colapsa espacios y recorta. Devuelve cadena vacía si no queda nada
 * útil, que es la señal de "no publicar".
 */
export function sanitizeChatMessage(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // Los controles se sustituyen por un espacio en lugar de borrarse: si se
    // eliminan, "hola\nmundo" se convierte en "holamundo" y se pegan palabras
    // que el autor había separado. El colapso posterior quita los sobrantes.
    if (code < 32 || code === 127) {
      out += ' ';
      continue;
    }
    // Se conservan los emoji y el resto de texto tal cual.
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}
