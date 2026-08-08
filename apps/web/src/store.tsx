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
  snapshotRef: React.MutableRefObject<
    GolfSnapshot | PoolSnapshot | ArcadeSportSnapshot | HeadSportSnapshot | null
  >;
  me: RoomSummary['players'][number] | null;
  isHost: boolean;
  /** true si la sala actual es una práctica en solitario. */
  isSolo: boolean;
  /** Marcas personales de este navegador, ya ordenadas por el servidor. */
  records: SoloRecord[];
  /** Desenlace de la última práctica terminada. */
  soloOutcome: SoloOutcome | null;
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
  sendAction: (action: GameAction) => void;
  pushToast: (message: string) => void;
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
  const [records, setRecords] = useState<SoloRecord[]>([]);
  const [soloOutcome, setSoloOutcome] = useState<SoloOutcome | null>(null);
  const eventId = useRef(0);
  const snapshotRef = useRef<
    GolfSnapshot | PoolSnapshot | ArcadeSportSnapshot | HeadSportSnapshot | null
  >(null);
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
    const onSnapshot = (
      payload: GolfSnapshot | PoolSnapshot | ArcadeSportSnapshot | HeadSportSnapshot,
    ) => {
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
      isSolo: Boolean(room?.solo),
      records,
      soloOutcome,
      createRoom: (name) => {
        pendingName.current = name;
        saveName(name);
        socket.emit(CLIENT_EVENTS.createRoom, { name });
      },
      createSoloRoom: (name, game, config) => {
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
      updateSoloConfig: (config) => socket.emit(CLIENT_EVENTS.updateSoloConfig, config),
      refreshRecords: () =>
        socket.emit(CLIENT_EVENTS.requestRecords, { profileId: profileId.current }),
      joinRoom: (code, name) => {
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
      },
      selectGame: (game) => socket.emit(CLIENT_EVENTS.selectGame, { game }),
      updateSettings: (game, settings) =>
        socket.emit(CLIENT_EVENTS.updateSettings, { game, settings }),
      setReady: (ready) => socket.emit(CLIENT_EVENTS.setReady, { ready }),
      startGame: () => socket.emit(CLIENT_EVENTS.startGame),
      kickPlayer: (playerId) => socket.emit(CLIENT_EVENTS.kickPlayer, { playerId }),
      transferHost: (playerId) => socket.emit(CLIENT_EVENTS.transferHost, { playerId }),
      backToLobby: () => socket.emit(CLIENT_EVENTS.backToLobby),
      setTournament: (games) => {
        if (!games) {
          socket.emit(CLIENT_EVENTS.updateTournament, { enabled: false });
          return;
        }
        socket.emit(CLIENT_EVENTS.updateTournament, {
          enabled: true,
          settings: { games, preset: 'personalizado' },
        });
      },
      sendAction,
      pushToast,
      dismissError: () => setError(null),
    }),
    [
      connected,
      session,
      room,
      gameState,
      result,
      error,
      toasts,
      golfEvents,
      lastGameEvent,
      me,
      records,
      soloOutcome,
      sendAction,
      pushToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStateValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}
