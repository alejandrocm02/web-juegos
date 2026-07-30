import { useEffect } from 'react';
import { useApp } from './store.js';
import HomeView from './views/HomeView.js';
import LobbyView from './views/LobbyView.js';
import ResultsView from './views/ResultsView.js';
import QuizView from './games/QuizView.js';
import DartsView from './games/DartsView.js';
import PoolView from './games/PoolView.js';
import GolfView from './games/GolfView.js';
import BowlingView from './games/BowlingView.js';
import KartsView from './games/KartsView.js';
import ArenaView from './games/ArenaView.js';
import { Toasts } from './components/ui.js';
import { GameExitBar } from './components/GameExitBar.js';
import { GameStage } from './components/GameStage.js';
import { DisconnectedOverlay, EmptyState } from './views/StatusViews.js';

export default function App() {
  const { room, gameState, result, connected, toasts, session } = useApp();

  useEffect(() => {
    document.title = room ? 'Sala ' + room.code + ' | Parque Arcade' : 'Parque Arcade';
  }, [room]);

  let content: JSX.Element;
  let inGame = false;

  if (!session || !room) {
    content = <HomeView />;
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
      {inGame && <GameExitBar />}
      {inGame && gameState ? <GameStage state={gameState}>{content}</GameStage> : content}
      <Toasts toasts={toasts} />
    </>
  );
}
