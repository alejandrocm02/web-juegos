// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeActions, makePlayer, makeRoom } from './helpers/fixtures.js';

/**
 * Vista del lobby.
 *
 * Es la pantalla con mas reglas del cliente: quien puede tocar que, cuando se
 * puede empezar y que se oculta en una practica en solitario. Hasta ahora solo
 * la cubrian los E2E, que son lentos y no distinguen entre "no se ve" y "no
 * funciona".
 */

const actions = makeActions();
let value: Record<string, unknown> = {};

// El store abre un socket al importarse: se sustituye por completo.
vi.mock('../src/store.js', () => ({
  useApp: () => value,
}));
// La precarga de fragmentos no aporta nada aqui y evita import() reales.
vi.mock('../src/games/registry.js', () => ({ prefetchGame: vi.fn() }));

const { default: LobbyView } = await import('../src/views/LobbyView.js');

function setup(overrides: Record<string, unknown> = {}) {
  value = {
    room: makeRoom(),
    me: makePlayer(),
    isHost: true,
    isSolo: false,
    records: [],
    error: null,
    ...actions,
    ...overrides,
  };
  return render(<LobbyView />);
}

beforeEach(() => {
  for (const spy of Object.values(actions)) spy.mockClear();
});

afterEach(cleanup);

describe('estado de la sala', () => {
  it('muestra un aviso mientras se recupera la sesion', () => {
    setup({ room: null, me: null });
    expect(screen.getByText(/Recuperando tu sesión/i)).toBeDefined();
  });

  it('publica el codigo de la sala', () => {
    setup();
    expect(screen.getAllByText(/ABC12/).length).toBeGreaterThan(0);
  });
});

describe('permisos del anfitrion', () => {
  it('deja al anfitrion cambiar de juego', async () => {
    setup();
    const dardos = screen.getByRole('button', { name: /Dardos/i });
    await userEvent.click(dardos);
    expect(actions.selectGame).toHaveBeenCalledWith('darts');
  });

  it('no deja a un invitado cambiar de juego', async () => {
    setup({ isHost: false, me: makePlayer({ isHost: false, id: 'p2', name: 'Bea' }) });
    const dardos = screen.getByRole('button', { name: /Dardos/i });
    expect(dardos).toHaveProperty('disabled', true);
    await userEvent.click(dardos);
    expect(actions.selectGame).not.toHaveBeenCalled();
  });
});

describe('condiciones para empezar', () => {
  it('bloquea el inicio sin jugadores suficientes', () => {
    setup();
    const boton = screen.getByRole('button', { name: /Iniciar/i });
    expect(boton).toHaveProperty('disabled', true);
  });

  it('bloquea el inicio si alguien no esta listo', () => {
    setup({
      room: makeRoom({
        players: [
          makePlayer({ ready: true }),
          makePlayer({ id: 'p2', name: 'Bea', isHost: false, ready: false }),
        ],
      }),
    });
    expect(screen.getByRole('button', { name: /Iniciar/i })).toHaveProperty('disabled', true);
  });

  it('permite empezar con todos listos y minimo cubierto', async () => {
    setup({
      room: makeRoom({
        players: [
          makePlayer({ ready: true }),
          makePlayer({ id: 'p2', name: 'Bea', isHost: false, ready: true }),
        ],
      }),
    });
    const boton = screen.getByRole('button', { name: /Iniciar/i });
    expect(boton).toHaveProperty('disabled', false);
    await userEvent.click(boton);
    expect(actions.startGame).toHaveBeenCalledTimes(1);
  });

  it('los bots no bloquean el inicio: estan siempre listos', () => {
    setup({
      isSolo: true,
      room: makeRoom({
        solo: true,
        minPlayers: 1,
        soloConfig: { botCount: 1, botDifficulty: 'normal' },
        players: [
          makePlayer({ ready: true }),
          makePlayer({ id: 'b1', name: 'Bot', isHost: false, ready: true, isBot: true }),
        ],
      }),
    });
    expect(screen.getByRole('button', { name: /Empezar/i })).toHaveProperty('disabled', false);
  });
});

describe('sala de practica', () => {
  it('oculta el enlace de invitacion', () => {
    setup({ isSolo: true, room: makeRoom({ solo: true, minPlayers: 1 }) });
    expect(screen.queryByRole('button', { name: /Invitar amigos/i })).toBeNull();
  });

  it('en una sala normal si ofrece invitar', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Invitar amigos/i })).not.toBeNull();
  });
});

describe('lista de jugadores', () => {
  // La desconexion se marcaba solo con un punto ambar, sin texto: invisible
  // para un lector de pantalla y para quien no distinga ese color.
  it('dice con palabras quien esta desconectado, no solo con color', () => {
    setup({
      room: makeRoom({
        players: [
          makePlayer({ name: 'Ana' }),
          makePlayer({ id: 'p2', name: 'Bea', isHost: false, connection: 'disconnected' }),
        ],
      }),
    });
    const lista = screen.getByText('Bea').closest('li') ?? document.body;
    expect(within(lista).getByText(/desconectad/i)).toBeDefined();
  });
});
