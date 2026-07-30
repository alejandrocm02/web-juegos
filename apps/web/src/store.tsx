import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AppError,
  type GameAction,
  type GameId,
  type GamePublicState,
  type GameSettings,
  type GolfFeedEvent,
  type GolfSnapshot,
  type MatchResult,
  type PoolSnapshot,
  type RoomSummary,
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
import { clearSession, loadSession, saveName, saveSession } from './lib/session.js';

export interface Toast {
  id: number;
  message: string;
}

interface SessionInfo {
  playerId: string;
  token: string;
  code: string;
}

interface AppStateValue {
  connected: boolean;
  session: SessionInfo | null;
  room: RoomSummary | null;
  gameState: GamePublicState | null;
  result: MatchResult | null;
  error: AppError | null;
  toasts: Toast[];
  golfEvents: GolfFeedEvent[];
  /** Ultimo evento de partida sin interpretar, para los momentos destacados. */
  lastGameEvent: { id: number; payload: unknown } | null;
  snapshotRef: React.MutableRefObject<GolfSnapshot | PoolSnapshot | null>;
  me: RoomSummary['players'][number] | null;
  isHost: boolean;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  leaveRoom: () => void;
  selectGame: (game: GameId) => void;
  updateSettings: <K extends GameId>(game: K, settings: GameSettings[K]) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  kickPlayer: (playerId: string) => void;
  transferHost: (playerId: string) => void;
  backToLobby: () => void;
  sendAction: (action: GameAction) => void;
  dismissError: () => void;
}

const AppContext = createContext<AppStateValue | null>(null);

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
  const eventId = useRef(0);
  const snapshotRef = useRef<GolfSnapshot | PoolSnapshot | null>(null);
  const pendingName = useRef<string>('');

  const pushToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const stored = loadSession();
      if (stored) socket.emit(CLIENT_EVENTS.rejoin, { code: stored.code, token: stored.token });
    };
    const onDisconnect = () => setConnected(false);

    const onSession = (payload: SessionInfo) => {
      setSession(payload);
      setError(null);
      saveSession({ ...payload, name: pendingName.current || loadSession()?.name || '' });
    };
    const onRoom = (payload: RoomSummary) => {
      setRoom(payload);
      if (payload.phase === 'lobby') snapshotRef.current = null;
    };
    const onError = (payload: AppError) => {
      setError(payload);
      if (payload.code === 'SESSION_EXPIRED' || payload.code === 'ROOM_NOT_FOUND') {
        clearSession();
        setSession(null);
        setRoom(null);
      }
    };
    const onStarted = (payload: { game: GameId; state: GamePublicState }) => {
      setResult(null);
      setGolfEvents([]);
      setGameState(payload.state);
    };
    const onState = (payload: GamePublicState) => setGameState(payload);
    const onSnapshot = (payload: GolfSnapshot | PoolSnapshot) => {
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
      clearSession();
      setSession(null);
      setRoom(null);
      setGameState(null);
      setError({ code: 'NOT_IN_ROOM', message: 'El anfitrion te ha expulsado de la sala.' });
    };
    const onSessionReplaced = () => {
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
    };
  }, [pushToast]);

  const me = useMemo(() => {
    if (!room || !session) return null;
    return room.players.find((p) => p.id === session.playerId) ?? null;
  }, [room, session]);

  const value = useMemo<AppStateValue>(
    () => ({
      connected,
      session,
      room,
      gameState,
      result,
      error,
      toasts,
      golfEvents,
      lastGameEvent,
      snapshotRef,
      me,
      isHost: Boolean(me?.isHost),
      createRoom: (name) => {
        pendingName.current = name;
        saveName(name);
        socket.emit(CLIENT_EVENTS.createRoom, { name });
      },
      joinRoom: (code, name) => {
        pendingName.current = name;
        saveName(name);
        socket.emit(CLIENT_EVENTS.joinRoom, { code, name });
      },
      leaveRoom: () => {
        socket.emit(CLIENT_EVENTS.leaveRoom);
        clearSession();
        setSession(null);
        setRoom(null);
        setGameState(null);
        setResult(null);
      },
      selectGame: (game) => socket.emit(CLIENT_EVENTS.selectGame, { game }),
      updateSettings: (game, settings) =>
        socket.emit(CLIENT_EVENTS.updateSettings, { game, settings }),
      setReady: (ready) => socket.emit(CLIENT_EVENTS.setReady, { ready }),
      startGame: () => socket.emit(CLIENT_EVENTS.startGame),
      kickPlayer: (playerId) => socket.emit(CLIENT_EVENTS.kickPlayer, { playerId }),
      transferHost: (playerId) => socket.emit(CLIENT_EVENTS.transferHost, { playerId }),
      backToLobby: () => socket.emit(CLIENT_EVENTS.backToLobby),
      sendAction: (action) => socket.emit(CLIENT_EVENTS.gameAction, action),
      dismissError: () => setError(null),
    }),
    [connected, session, room, gameState, result, error, toasts, golfEvents, lastGameEvent, me],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStateValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}
