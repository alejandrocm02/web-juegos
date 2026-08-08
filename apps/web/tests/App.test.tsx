// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePlayer, makeRoom } from './helpers/fixtures.js';

/**
 * Enrutado de App y carga diferida de las vistas de juego.
 *
 * Desde que cada juego es un fragmento aparte, entre pulsar empezar y ver el
 * tablero hay un estado intermedio que antes no existia. Estas pruebas fijan
 * que ese estado aparece y que da paso a la vista correcta.
 */

let value: Record<string, unknown> = {};
vi.mock('../src/store.js', () => ({ useApp: () => value }));

// Se sustituyen las vistas por marcadores: aqui interesa el enrutado y el
// respaldo de Suspense, no lo que dibuja cada juego.
vi.mock('../src/games/registry.js', () => {
  const view = (nombre: string) => () => <div>vista:{nombre}</div>;
  return {
    QuizView: view('quiz'),
    DartsView: view('darts'),
    PoolView: view('pool'),
    GolfView: view('golf'),
    BowlingView: view('bowling'),
    KartsView: view('karts'),
    ArenaView: view('arena'),
    BlackjackView: view('blackjack'),
    SonglessView: view('songless'),
    ArcadeSportView: view('arcade-sport'),
    HeadSportView: view('head-sport'),
    TanksView: view('tanks'),
    prefetchGame: vi.fn(),
  };
});
// Las reacciones flotantes leen su propio contexto: se sustituye igual que el
// store para que App se pueda montar suelto.
vi.mock('../src/lib/chat-store.js', () => ({
  useChat: () => ({ messages: [], reactions: [], sendChat: vi.fn(), sendReaction: vi.fn() }),
}));
vi.mock('../src/views/LobbyView.js', () => ({ default: () => <div>vista:lobby</div> }));
vi.mock('../src/views/HomeView.js', () => ({ default: () => <div>vista:inicio</div> }));
vi.mock('../src/views/ResultsView.js', () => ({ default: () => <div>vista:resultados</div> }));

const { default: App } = await import('../src/App.js');

function setup(overrides: Record<string, unknown> = {}) {
  value = {
    room: null,
    me: null,
    gameState: null,
    result: null,
    connected: true,
    toasts: [],
    session: null,
    error: null,
    dismissError: vi.fn(),
    ...overrides,
  };
  return render(<App />);
}

const enSala = {
  session: { playerId: 'p1', token: 't', code: 'ABC12' },
  me: makePlayer(),
};

afterEach(cleanup);

describe('enrutado por fase', () => {
  it('sin sesion muestra el inicio', () => {
    setup();
    expect(screen.getByText('vista:inicio')).toBeDefined();
  });

  it('en lobby muestra el lobby', () => {
    setup({ ...enSala, room: makeRoom() });
    expect(screen.getByText('vista:lobby')).toBeDefined();
  });

  it('avisa si la sesion aun no ha enlazado al jugador', () => {
    setup({ session: enSala.session, room: makeRoom(), me: null });
    expect(screen.getByText(/Recuperando tu sesión/i)).toBeDefined();
  });

  it('espera a la clasificacion antes de pintar resultados', () => {
    setup({ ...enSala, room: makeRoom({ phase: 'results' }), result: null });
    expect(screen.getByText(/Preparando los resultados/i)).toBeDefined();
  });
});

describe('vistas de juego perezosas', () => {
  it('monta la vista del juego en curso', async () => {
    setup({
      ...enSala,
      room: makeRoom({ phase: 'playing', selectedGame: 'tanks' }),
      gameState: { game: 'tanks' },
    });
    await waitFor(() => expect(screen.getByText(/vista:tanks/)).toBeDefined());
  });

  it('air-hockey y tenis de mesa comparten vista', async () => {
    setup({
      ...enSala,
      room: makeRoom({ phase: 'playing', selectedGame: 'table-tennis' }),
      gameState: { game: 'table-tennis' },
    });
    await waitFor(() => expect(screen.getByText(/vista:arcade-sport/)).toBeDefined());
  });

  it('sin estado de juego avisa de que esta sincronizando', () => {
    setup({ ...enSala, room: makeRoom({ phase: 'playing' }), gameState: null });
    expect(screen.getByText(/Cargando partida/i)).toBeDefined();
  });
});

describe('estado de conexion', () => {
  it('avisa cuando se pierde la conexion', () => {
    setup({ connected: false });
    expect(screen.getByText(/conexión/i)).toBeDefined();
  });
});
