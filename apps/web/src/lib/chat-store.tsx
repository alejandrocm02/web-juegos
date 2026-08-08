import {
  CHAT_HISTORY_SIZE,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type ChatMessage,
  type ChatReactionEvent,
  type ChatReactionId,
} from '@arcade/shared';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { socket } from './socket.js';

/**
 * Estado del chat, en un contexto propio y separado del de la aplicacion.
 *
 * Vive aparte a proposito. Las reacciones llegan a rafagas durante la partida y
 * los mensajes mientras se configura la sala: si compartieran contexto con
 * `useApp`, cada emoji re-renderizaria el lobby entero y cada `game:state`
 * re-renderizaria el chat. Separandolos, cada cosa repinta solo lo suyo.
 */

/** Tiempo que una reaccion permanece en pantalla. */
const REACTION_TTL_MS = 3200;

interface ChatContextValue {
  messages: ChatMessage[];
  /** Reacciones vivas ahora mismo. Se retiran solas a los pocos segundos. */
  reactions: (ChatReactionEvent & { key: number })[];
  sendChat: (text: string) => void;
  sendReaction: (reaction: ChatReactionId) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<(ChatReactionEvent & { key: number })[]>([]);
  const reactionKey = useRef(0);
  /** Temporizadores vivos, para poder cancelarlos al desmontar. */
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const onHistory = (payload: { messages: ChatMessage[] }) => {
      setMessages(payload.messages ?? []);
    };
    const onMessage = (payload: ChatMessage) => {
      setMessages((prev) => [...prev, payload].slice(-CHAT_HISTORY_SIZE));
    };
    const onReaction = (payload: ChatReactionEvent) => {
      reactionKey.current += 1;
      const key = reactionKey.current;
      // Se limita la pila visible: en una celebracion de cinco jugadores no
      // tiene sentido apilar treinta globos.
      setReactions((prev) => [...prev.slice(-7), { ...payload, key }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setReactions((prev) => prev.filter((entry) => entry.key !== key));
      }, REACTION_TTL_MS);
      timers.current.add(timer);
    };
    // Al salir de la sala el hilo deja de tener sentido: pertenece a la sala,
    // no al navegador.
    const onSessionEnd = () => {
      setMessages([]);
      setReactions([]);
    };

    socket.on(SERVER_EVENTS.chatHistory, onHistory);
    socket.on(SERVER_EVENTS.chatMessage, onMessage);
    socket.on(SERVER_EVENTS.chatReaction, onReaction);
    socket.on(SERVER_EVENTS.kicked, onSessionEnd);
    socket.on(SERVER_EVENTS.sessionReplaced, onSessionEnd);

    const pending = timers.current;
    return () => {
      socket.off(SERVER_EVENTS.chatHistory, onHistory);
      socket.off(SERVER_EVENTS.chatMessage, onMessage);
      socket.off(SERVER_EVENTS.chatReaction, onReaction);
      socket.off(SERVER_EVENTS.kicked, onSessionEnd);
      socket.off(SERVER_EVENTS.sessionReplaced, onSessionEnd);
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      reactions,
      sendChat: (text: string) => socket.emit(CLIENT_EVENTS.sendChat, { text }),
      sendReaction: (reaction: ChatReactionId) =>
        socket.emit(CLIENT_EVENTS.sendReaction, { reaction }),
    }),
    [messages, reactions],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat debe usarse dentro de ChatProvider');
  return context;
}
