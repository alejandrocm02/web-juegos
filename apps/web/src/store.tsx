import {
  CHAT_HISTORY_SIZE,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AppError,
  type ChatMessage,
  type ChatReactionEvent,
  type ChatReactionId,
  type GameAction,
  type GameId,
  type GamePublicState,
  type GameSettings,
  type GolfFeedEvent,
  type GolfSnapshot,
  type MatchResult,
  type PoolSnapshot,
  type ArcadeSportSnapshot,
  type HeadSportSnapshot,
  type RoomSummary,
  type SoloConfig,
  type SoloOutcome,
  type SoloRecord,
} from '@arcade/shared';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { socket } from './lib/socket.js';
import { clearSession, loadProfileId, loadSession, saveName, saveSession } from './lib/session.js';

/**
 * Estado compartido de la aplicacion, repartido en tres contextos.
 *
 * Antes habia uno solo con todo dentro, asi que un `game:state` —hasta dos por
 * segundo en los juegos con fisica— re-renderizaba tambien el lobby, los avisos
 * y la barra de salida. Ahora cada consumidor se suscribe solo a lo que mira:
 *
 * - `useRoom`   sala, sesion, jugadores y acciones de lobby.
 * - `useMatch`  estado de la partida en curso y envio de acciones.
 * - `useNotices` avisos efimeros y errores.
 *
 * Los snapshots de fisica (20 Hz) siguen viajando por una `ref` y no provocan
 * ningun render: las vistas los leen dentro de su propio bucle de dibujo.
 */

export interface Toast {
  id: number;
  message: string;
}

interface SessionInfo {
  playerId: string;
  token: string;
  code: string;
}

export type AnySnapshot = GolfSnapshot | PoolSnapshot | ArcadeSportSnapshot | HeadSportSnapshot;

interface RoomContextValue {
  connected: boolean;
  session: SessionInfo | null;
  room: RoomSummary | null;
  me: RoomSummary['players'][number] | null;
  isHost: boolean;
  /** true si la sala actual es una práctica en solitario. */
  isSolo: boolean;
  /** Marcas personales de este navegador, ya ordenadas por el servidor. */
  records: SoloRecord[];
  createRoom: (name: string) => void;
  createSoloRoom: (name: string, game: GameId, config: SoloConfig) => void;
  updateSoloConfig: (config: SoloConfig) => void;
  refreshRecords: () => void;
  joinRoom: (code: string, name: string) => void;
  leaveRoom: () => void;
  selectGame: (game: GameId) => void;
  updateSettings: <K extends GameId>(game: K, settings: GameSettings[K]) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  kickPlayer: (playerId: string) => void;
  transferHost: (playerId: string) => void;
  backToLobby: () => void;
  /** Monta, reconfigura o cancela el torneo de la sala. */
  setTournament: (games: GameId[] | null) => void;
}

interface MatchContextValue {
  gameState: GamePublicState | null;
  result: MatchResult | null;
  golfEvents: GolfFeedEvent[];
  /** Ultimo evento de partida sin interpretar, para los momentos destacados. */
  lastGameEvent: { id: number; payload: unknown } | null;
  snapshotRef: React.MutableRefObject<AnySnapshot | null>;
  /** Desenlace de la última práctica terminada. */
  soloOutcome: SoloOutcome | null;
  sendAction: (action: GameAction) => void;
}

interface NoticeContextValue {
  toasts: Toast[];
  error: AppError | null;
  pushToast: (message: string) => void;
  dismissError: () => void;
}

interface ChatContextValue {
  messages: ChatMessage[];
  /** Reacciones vivas ahora mismo. Se retiran solas a los pocos segundos. */
  reactions: (ChatReactionEvent & { key: number })[];
  /** Mensajes recibidos desde la última vez que se abrió el chat. */
  unread: number;
  sendChat: (text: string) => void;
  sendReaction: (reaction: ChatReactionId) => void;
  markChatRead: () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);
const MatchContext = createContext<MatchContextValue | null>(null);
const NoticeContext = createContext<NoticeContextValue | null>(null);
const ChatContext = createContext<ChatContextValue | null>(null);

/** Tiempo que una reaccion permanece en pantalla. */
const REACTION_TTL_MS = 3200;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [gameState, setGameState] = useState<GamePublicState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [golfEvents, setGolfEvents] = useState<GolfFeedEvent[]>([]);
  const [lastGameEvent, setLastGameEvent] = useState<{ id: number; payload: unknown } | null>(null);
  const [records, setRecords] = useState<SoloRecord[]>([]);
  const [soloOutcome, setSoloOutcome] = useState<SoloOutcome | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<(ChatReactionEvent & { key: number })[]>([]);
  const [unread, setUnread] = useState(0);
  const eventId = useRef(0);
  const reactionKey = useRef(0);
  const snapshotRef = useRef<AnySnapshot | null>(null);
  const pendingName = useRef<string>('');
  const sessionRef = useRef<SessionInfo | null>(null);
  const sessionRecoveryRef = useRef(false);
  // El perfil se resuelve una sola vez: crea el identificador si aún no existe.
  const profileId = useRef<string>('');
  if (!profileId.current) profileId.current = loadProfileId();

  const pushToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // Esta referencia debe ser estable: varios juegos la usan como dependencia
  // de efectos de entrada o sincronización.
  const sendAction = useCallback((action: GameAction) => {
    socket.emit(CLIENT_EVENTS.gameAction, action);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const stored = loadSession();
      // La sesión en memoria pertenece a esta pestaña y tiene prioridad sobre
      // localStorage, que puede haber sido modificado por otra pestaña.
      const active = sessionRef.current ?? stored;
      if (active) {
        sessionRecoveryRef.current = true;
        socket.emit(CLIENT_EVENTS.rejoin, { code: active.code, token: active.token });
      }
      socket.emit(CLIENT_EVENTS.requestRecords, { profileId: profileId.current });
    };
    const onDisconnect = () => setConnected(false);

    const onSession = (payload: SessionInfo) => {
      sessionRef.current = payload;
      sessionRecoveryRef.current = false;
      setSession(payload);
      setError(null);
      saveSession({ ...payload, name: pendingName.current || loadSession()?.name || '' });
    };
    const onRoom = (payload: RoomSummary) => {
      setRoom(payload);
      const active = sessionRef.current;
      if (
        active?.code === payload.code &&
        !payload.players.some((player) => player.id === active.playerId) &&
        !sessionRecoveryRef.current
      ) {
        sessionRecoveryRef.current = true;
        socket.emit(CLIENT_EVENTS.rejoin, { code: active.code, token: active.token });
      }
      if (payload.phase === 'results' && payload.result) {
        // El resultado viaja también dentro del estado de la sala. Así la
        // pantalla final no depende de haber recibido un único evento efímero.
        setResult(payload.result);
      }
      if (payload.phase === 'lobby') {
        snapshotRef.current = null;
        setGameState(null);
        setResult(null);
        setSoloOutcome(null);
      }
    };
    const onError = (payload: AppError) => {
      sessionRecoveryRef.current = false;
      setError(payload);
      if (payload.code === 'SESSION_EXPIRED' || payload.code === 'ROOM_NOT_FOUND') {
        sessionRef.current = null;
        clearSession();
        setSession(null);
        setRoom(null);
      }
    };
    const onRecords = (payload: { records: SoloRecord[] }) => setRecords(payload.records ?? []);
    const onSoloOutcome = (payload: SoloOutcome) => {
      setSoloOutcome(payload);
      // La marca guardada cambia, así que la lista local se actualiza en el sitio.
      setRecords((prev) => {
        const rest = prev.filter((record) => record.game !== payload.record.game);
        return [payload.record, ...rest];
      });
    };
    const onStarted = (payload: { game: GameId; state: GamePublicState }) => {
      setResult(null);
      setSoloOutcome(null);
      setGolfEvents([]);
      // Evita interpolar durante unos milisegundos el último snapshot de la
      // partida anterior cuando dos juegos comparten la misma forma de datos.
      snapshotRef.current = null;
      setGameState(payload.state);
    };
    const onState = (payload: GamePublicState) => setGameState(payload);
    const onSnapshot = (payload: AnySnapshot) => {
      snapshotRef.current = payload;
    };
    const onGameEvent = (payload: GolfFeedEvent) => {
      setGolfEvents((prev) => [payload, ...prev].slice(0, 8));
      eventId.current += 1;
      // El evento se interpreta en la vista, que ya conoce a los jugadores.
      setLastGameEvent({ id: eventId.current, payload });
    };
    const onOver = (payload: { result: MatchResult }) => setResult(payload.result);
    const onKicked = () => {
      sessionRef.current = null;
      sessionRecoveryRef.current = false;
      clearSession();
      setSession(null);
      setRoom(null);
      setGameState(null);
      setError({ code: 'NOT_IN_ROOM', message: 'El anfitrión te ha expulsado de la sala.' });
    };
    const onSessionReplaced = () => {
      sessionRef.current = null;
      sessionRecoveryRef.current = false;
      clearSession();
      setSession(null);
      setRoom(null);
      setGameState(null);
      setResult(null);
      setError({
        code: 'SESSION_EXPIRED',
        message: 'La partida se ha abierto en otra pestaña. Esta sesión se ha cerrado.',
      });
    };
    const onToast = (payload: { message: string }) => pushToast(payload.message);
    const onChatHistory = (payload: { messages: ChatMessage[] }) => {
      setMessages(payload.messages ?? []);
      setUnread(0);
    };
    const onChatMessage = (payload: ChatMessage) => {
      setMessages((prev) => [...prev, payload].slice(-CHAT_HISTORY_SIZE));
      // Los mensajes propios no cuentan como pendientes de leer.
      if (payload.playerId !== sessionRef.current?.playerId) setUnread((prev) => prev + 1);
    };
    const onChatReaction = (payload: ChatReactionEvent) => {
      reactionKey.current += 1;
      const key = reactionKey.current;
      setReactions((prev) => [...prev.slice(-7), { ...payload, key }]);
      // Se retira sola: una reaccion es un instante, no un registro.
      setTimeout(
        () => setReactions((prev) => prev.filter((entry) => entry.key !== key)),
        REACTION_TTL_MS,
      );
    };
    const onTournament = () => {
      // El estado del torneo ya viaja dentro de room:state; este evento solo
      // sirve para no depender del orden de llegada al terminar una prueba.
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SERVER_EVENTS.session, onSession);
    socket.on(SERVER_EVENTS.roomState, onRoom);
    socket.on(SERVER_EVENTS.error, onError);
    socket.on(SERVER_EVENTS.gameStarted, onStarted);
    socket.on(SERVER_EVENTS.gameState, onState);
    socket.on(SERVER_EVENTS.gameSnapshot, onSnapshot);
    socket.on(SERVER_EVENTS.gameEvent, onGameEvent);
    socket.on(SERVER_EVENTS.gameOver, onOver);
    socket.on(SERVER_EVENTS.kicked, onKicked);
    socket.on(SERVER_EVENTS.sessionReplaced, onSessionReplaced);
    socket.on(SERVER_EVENTS.toast, onToast);
    socket.on(SERVER_EVENTS.soloRecords, onRecords);
    socket.on(SERVER_EVENTS.soloOutcome, onSoloOutcome);
    socket.on(SERVER_EVENTS.chatHistory, onChatHistory);
    socket.on(SERVER_EVENTS.chatMessage, onChatMessage);
    socket.on(SERVER_EVENTS.chatReaction, onChatReaction);
    socket.on(SERVER_EVENTS.tournament, onTournament);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SERVER_EVENTS.session, onSession);
      socket.off(SERVER_EVENTS.roomState, onRoom);
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.gameStarted, onStarted);
      socket.off(SERVER_EVENTS.gameState, onState);
      socket.off(SERVER_EVENTS.gameSnapshot, onSnapshot);
      socket.off(SERVER_EVENTS.gameEvent, onGameEvent);
      socket.off(SERVER_EVENTS.gameOver, onOver);
      socket.off(SERVER_EVENTS.kicked, onKicked);
      socket.off(SERVER_EVENTS.sessionReplaced, onSessionReplaced);
      socket.off(SERVER_EVENTS.toast, onToast);
      socket.off(SERVER_EVENTS.soloRecords, onRecords);
      socket.off(SERVER_EVENTS.soloOutcome, onSoloOutcome);
      socket.off(SERVER_EVENTS.chatHistory, onChatHistory);
      socket.off(SERVER_EVENTS.chatMessage, onChatMessage);
      socket.off(SERVER_EVENTS.chatReaction, onChatReaction);
      socket.off(SERVER_EVENTS.tournament, onTournament);
    };
  }, [pushToast]);

  const me = useMemo(() => {
    if (!room || !session) return null;
    return room.players.find((p) => p.id === session.playerId) ?? null;
  }, [room, session]);

  /* --------------------------- Acciones estables -------------------------- */

  const actions = useMemo(
    () => ({
      createRoom: (name: string) => {
        pendingName.current = name;
        saveName(name);
        socket.emit(CLIENT_EVENTS.createRoom, { name });
      },
      createSoloRoom: (name: string, game: GameId, config: SoloConfig) => {
        pendingName.current = name;
        saveName(name);
        setSoloOutcome(null);
        socket.emit(CLIENT_EVENTS.createSoloRoom, {
          name,
          profileId: profileId.current,
          game,
          config,
        });
      },
      updateSoloConfig: (config: SoloConfig) => socket.emit(CLIENT_EVENTS.updateSoloConfig, config),
      refreshRecords: () =>
        socket.emit(CLIENT_EVENTS.requestRecords, { profileId: profileId.current }),
      joinRoom: (code: string, name: string) => {
        pendingName.current = name;
        saveName(name);
        socket.emit(CLIENT_EVENTS.joinRoom, { code, name });
      },
      leaveRoom: () => {
        socket.emit(CLIENT_EVENTS.leaveRoom);
        sessionRef.current = null;
        sessionRecoveryRef.current = false;
        clearSession();
        setSession(null);
        setRoom(null);
        setGameState(null);
        setResult(null);
        setSoloOutcome(null);
        setMessages([]);
        setReactions([]);
        setUnread(0);
      },
      selectGame: (game: GameId) => socket.emit(CLIENT_EVENTS.selectGame, { game }),
      updateSettings: <K extends GameId>(game: K, settings: GameSettings[K]) =>
        socket.emit(CLIENT_EVENTS.updateSettings, { game, settings }),
      setReady: (ready: boolean) => socket.emit(CLIENT_EVENTS.setReady, { ready }),
      startGame: () => socket.emit(CLIENT_EVENTS.startGame),
      kickPlayer: (playerId: string) => socket.emit(CLIENT_EVENTS.kickPlayer, { playerId }),
      transferHost: (playerId: string) => socket.emit(CLIENT_EVENTS.transferHost, { playerId }),
      backToLobby: () => socket.emit(CLIENT_EVENTS.backToLobby),
      setTournament: (games: GameId[] | null) => {
        if (!games) {
          socket.emit(CLIENT_EVENTS.updateTournament, { enabled: false });
          return;
        }
        socket.emit(CLIENT_EVENTS.updateTournament, {
          enabled: true,
          settings: { games, preset: 'personalizado' },
        });
      },
    }),
    [],
  );

  /* ------------------------------- Contextos ------------------------------ */

  const roomValue = useMemo<RoomContextValue>(
    () => ({
      connected,
      session,
      room,
      me,
      isHost: Boolean(me?.isHost),
      isSolo: Boolean(room?.solo),
      records,
      ...actions,
    }),
    [connected, session, room, me, records, actions],
  );

  const matchValue = useMemo<MatchContextValue>(
    () => ({
      gameState,
      result,
      golfEvents,
      lastGameEvent,
      snapshotRef,
      soloOutcome,
      sendAction,
    }),
    [gameState, result, golfEvents, lastGameEvent, soloOutcome, sendAction],
  );

  const chatValue = useMemo<ChatContextValue>(
    () => ({
      messages,
      reactions,
      unread,
      sendChat: (text: string) => socket.emit(CLIENT_EVENTS.sendChat, { text }),
      sendReaction: (reaction: ChatReactionId) =>
        socket.emit(CLIENT_EVENTS.sendReaction, { reaction }),
      markChatRead: () => setUnread(0),
    }),
    [messages, reactions, unread],
  );

  const noticeValue = useMemo<NoticeContextValue>(
    () => ({ toasts, error, pushToast, dismissError }),
    [toasts, error, pushToast, dismissError],
  );

  return (
    <RoomContext.Provider value={roomValue}>
      <MatchContext.Provider value={matchValue}>
        <NoticeContext.Provider value={noticeValue}>
          <ChatContext.Provider value={chatValue}>{children}</ChatContext.Provider>
        </NoticeContext.Provider>
      </MatchContext.Provider>
    </RoomContext.Provider>
  );
}

function useRequired<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) throw new Error(name + ' debe usarse dentro de AppProvider');
  return value;
}

/** Sala, sesion y acciones de lobby. No cambia durante la fisica de la partida. */
export function useRoom(): RoomContextValue {
  return useRequired(RoomContext, 'useRoom');
}

/** Estado de la partida en curso y envio de acciones. */
export function useMatch(): MatchContextValue {
  return useRequired(MatchContext, 'useMatch');
}

/** Avisos efimeros y ultimo error recibido. */
export function useNotices(): NoticeContextValue {
  return useRequired(NoticeContext, 'useNotices');
}

/** Chat de sala y reacciones rapidas. */
export function useChat(): ChatContextValue {
  return useRequired(ChatContext, 'useChat');
}
