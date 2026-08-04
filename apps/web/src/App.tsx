import { Suspense, useEffect } from 'react';
import { useApp } from './store.js';
import HomeView from './views/HomeView.js';
import LobbyView from './views/LobbyView.js';
import ResultsView from './views/ResultsView.js';
import {
  ArcadeSportView,
  ArenaView,
  BlackjackView,
  BowlingView,
  DartsView,
  GolfView,
  HeadSportView,
  KartsView,
  PoolView,
  QuizView,
  SonglessView,
  TanksView,
} from './games/registry.js';
import { ErrorBanner, Toasts } from './components/ui.js';
import { GameExitBar } from './components/GameExitBar.js';
import { GameStage } from './components/GameStage.js';
import { DisconnectedOverlay, EmptyState } from './views/StatusViews.js';

export default function App() {
  const { room, gameState, result, connected, toasts, session, me, error, dismissError } = useApp();

  useEffect(() => {
    document.title = room ? 'Sala ' + room.code + ' | Parque Arcade' : 'Parque Arcade';
  }, [room]);

  let content: JSX.Element;
  let inGame = false;

  if (!session || !room) {
    content = <HomeView />;
  } else if (!me) {
    content = (
      <EmptyState
        title="Recuperando tu sesión…"
        description="Estamos volviendo a enlazar tu jugador con la sala. Si tienes la partida abierta en otra pestaña, conserva solo una."
      />
    );
  } else if (room.phase === 'results') {
    content = result ? (
      <ResultsView />
    ) : (
      <EmptyState
        title="Preparando los resultados…"
        description="Estamos sincronizando la clasificación final de todos los jugadores."
      />
    );
  } else if (room.phase === 'playing' && gameState) {
    inGame = true;
    switch (gameState.game) {
      case 'quiz':
        content = <QuizView state={gameState} />;
        break;
      case 'darts':
        content = <DartsView state={gameState} />;
        break;
      case 'pool':
        content = <PoolView state={gameState} />;
        break;
      case 'golf':
        content = <GolfView state={gameState} />;
        break;
      case 'bowling':
        content = <BowlingView state={gameState} />;
        break;
      case 'karts':
        content = <KartsView state={gameState} />;
        break;
      case 'arena':
        content = <ArenaView state={gameState} />;
        break;
      case 'blackjack':
        content = <BlackjackView state={gameState} />;
        break;
      case 'songless':
        content = <SonglessView state={gameState} />;
        break;
      case 'air-hockey':
      case 'table-tennis':
        content = <ArcadeSportView state={gameState} />;
        break;
      case 'head-soccer':
      case 'head-basketball':
        content = <HeadSportView state={gameState} />;
        break;
      case 'tanks':
        content = <TanksView state={gameState} />;
        break;
      default:
        content = <EmptyState title="Juego desconocido" description="Vuelve al lobby." />;
    }
  } else if (room.phase === 'playing') {
    content = (
      <EmptyState
        title="Cargando partida..."
        description="Sincronizando el estado con el servidor."
      />
    );
  } else {
    content = <LobbyView />;
  }

  return (
    <>
      <DisconnectedOverlay visible={!connected} />
      {inGame && error && (
        <div className="fixed left-1/2 top-20 z-[60] w-[min(92vw,42rem)] -translate-x-1/2">
          <ErrorBanner error={error} onDismiss={dismissError} />
        </div>
      )}
      {inGame && <GameExitBar />}
      {inGame && gameState ? (
        <GameStage state={gameState}>
          {/*
            Solo las vistas de juego se cargan bajo demanda. El respaldo vive
            dentro de GameStage para que la cabecera (turno, modo y ayuda) ya
            este en pantalla mientras llega el fragmento.
          */}
          <Suspense
            fallback={
              <EmptyState
                title="Cargando el juego…"
                description="Descargando lo necesario para esta partida. Tarda un instante la primera vez."
              />
            }
          >
            {content}
          </Suspense>
        </GameStage>
      ) : (
        content
      )}
      <Toasts toasts={toasts} />
    </>
  );
}
