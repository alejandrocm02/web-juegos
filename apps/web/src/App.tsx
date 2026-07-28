import { useEffect } from 'react';
import { useApp } from './store.js';
import HomeView from './views/HomeView.js';
import LobbyView from './views/LobbyView.js';
import ResultsView from './views/ResultsView.js';
import QuizView from './games/QuizView.js';
import DartsView from './games/DartsView.js';
import PoolView from './games/PoolView.js';
import GolfView from './games/GolfView.js';
import { Toasts } from './components/ui.js';
import { DisconnectedOverlay, EmptyState } from './views/StatusViews.js';

export default function App() {
  const { room, gameState, result, connected, toasts, session } = useApp();

  useEffect(() => {
    document.title = room ? 'Sala ' + room.code + ' | Parque Arcade' : 'Parque Arcade';
  }, [room]);

  let content: JSX.Element;

  if (!session || !room) {
    content = <HomeView />;
  } else if (room.phase === 'results' && result) {
    content = <ResultsView />;
  } else if (room.phase === 'playing' && gameState) {
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
      {content}
      <Toasts toasts={toasts} />
    </>
  );
}
