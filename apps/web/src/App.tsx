import { Suspense, lazy, useEffect } from 'react';
import { useMatch, useRoom } from './store.js';
import HomeView from './views/HomeView.js';
import LobbyView from './views/LobbyView.js';
import ResultsView from './views/ResultsView.js';
import { FloatingErrorBanner, ToastStack } from './components/Notices.js';
import { ReactionOverlay } from './components/Chat.js';
import { GameExitBar } from './components/GameExitBar.js';
import { GameStage } from './components/GameStage.js';
import { DisconnectedOverlay, EmptyState } from './views/StatusViews.js';

/**
 * Cada juego se descarga cuando hace falta, no al abrir la web.
 *
 * Con los catorce importados de golpe, quien solo quiere jugar al quiz se
 * bajaba tambien la fisica de karts, el renderizador de golf y la arena. El
 * `game:started` llega antes que el primer fotograma jugable, asi que la
 * descarga del trozo se solapa con la cuenta atras y no se nota.
 */
const QuizView = lazy(() => import('./games/QuizView.js'));
const DartsView = lazy(() => import('./games/DartsView.js'));
const PoolView = lazy(() => import('./games/PoolView.js'));
const GolfView = lazy(() => import('./games/GolfView.js'));
const BowlingView = lazy(() => import('./games/BowlingView.js'));
const KartsView = lazy(() => import('./games/KartsView.js'));
const ArenaView = lazy(() => import('./games/ArenaView.js'));
const BlackjackView = lazy(() => import('./games/BlackjackView.js'));
const SonglessView = lazy(() => import('./games/SonglessView.js'));
const ArcadeSportView = lazy(() => import('./games/ArcadeSportView.js'));
const HeadSportView = lazy(() => import('./games/HeadSportView.js'));
const TanksView = lazy(() => import('./games/TanksView.js'));

export default function App() {
  const { room, connected, session, me } = useRoom();
  const { gameState, result } = useMatch();

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
      {inGame && <FloatingErrorBanner />}
      {inGame && <GameExitBar />}
      {inGame && !room?.solo && <ReactionOverlay />}
      {inGame && gameState ? (
        <GameStage state={gameState}>
          <Suspense
            fallback={
              <EmptyState
                title="Cargando el juego…"
                description="Preparando el tablero. Tardará solo un instante."
              />
            }
          >
            {content}
          </Suspense>
        </GameStage>
      ) : (
        content
      )}
      <ToastStack />
    </>
  );
}
