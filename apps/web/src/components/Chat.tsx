import { CHAT_MAX_LENGTH, CHAT_REACTIONS, reactionEmoji } from '@arcade/shared';
import { memo, useEffect, useRef, useState } from 'react';
import { useChat } from '../lib/chat-store.js';
import { useApp } from '../store.js';

/**
 * Chat de sala y reacciones rapidas.
 *
 * Dos piezas para dos momentos distintos: el panel de mensajes vive en el
 * lobby, donde hay tiempo de escribir, y la barra de reacciones vive durante la
 * partida, donde nadie va a soltar el raton para teclear.
 */

/** Panel de conversacion del lobby. */
export const ChatPanel = memo(function ChatPanel() {
  const { messages, sendChat } = useChat();
  const { session } = useApp();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Se baja al ultimo mensaje conforme llegan, como en cualquier chat.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft('');
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        ref={listRef}
        className="max-h-56 min-h-[7rem] flex-1 space-y-2 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        aria-label="Mensajes de la sala"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Todavía no ha escrito nadie. Rompe el hielo.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.playerId === session?.playerId;
            return (
              <p
                key={message.id}
                className={
                  'rounded-lg px-2.5 py-1.5 text-sm ' +
                  (mine ? 'bg-neon-cyan/[0.08]' : 'bg-white/[0.03]')
                }
              >
                <span className="mr-1.5 text-xs font-semibold" style={{ color: message.color }}>
                  {message.name}
                </span>
                <span className="text-slate-200">{message.text}</span>
              </p>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Escribe algo…"
          aria-label="Mensaje para la sala"
        />
        <button
          type="submit"
          className="btn-secondary shrink-0"
          disabled={draft.trim().length === 0}
        >
          Enviar
        </button>
      </form>
      <ReactionBar compact />
    </div>
  );
});

/** Botonera de reacciones. Siempre disponible, con enfriamiento del servidor. */
export const ReactionBar = memo(function ReactionBar({ compact }: { compact?: boolean }) {
  const { sendReaction } = useChat();
  return (
    <div
      className={'flex flex-wrap gap-1.5' + (compact ? '' : ' justify-center')}
      role="group"
      aria-label="Reacciones rápidas"
    >
      {CHAT_REACTIONS.map((reaction) => (
        <button
          key={reaction.id}
          type="button"
          onClick={() => sendReaction(reaction.id)}
          title={reaction.label}
          aria-label={reaction.label}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-base leading-none transition hover:-translate-y-0.5 hover:bg-white/10"
        >
          {reaction.emoji}
        </button>
      ))}
    </div>
  );
});

/**
 * Reacciones flotando sobre la partida.
 *
 * Se dibujan encima de todo pero sin capturar el raton: durante un golpe de
 * golf o un tiro de billar el puntero no puede tropezar con ellas.
 */
export const ReactionOverlay = memo(function ReactionOverlay() {
  const { reactions } = useChat();
  if (reactions.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-24 right-6 z-40 flex flex-col-reverse items-end gap-1.5"
      aria-live="polite"
    >
      {reactions.map((reaction) => (
        <span
          key={reaction.key}
          className="animate-slideUp rounded-full border border-white/15 bg-night-700/90 px-3 py-1 text-sm shadow-xl backdrop-blur"
        >
          <span className="mr-1.5 text-base">{reactionEmoji(reaction.reaction)}</span>
          <span className="text-xs" style={{ color: reaction.color }}>
            {reaction.name}
          </span>
        </span>
      ))}
    </div>
  );
});
