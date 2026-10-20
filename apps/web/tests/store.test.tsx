// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@arcade/shared';
import { AppProvider, useApp } from '../src/store.js';
import { loadSession, saveSession } from '../src/lib/session.js';

const { socket, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, (value?: unknown) => void>();
  const socket = {
    connected: true,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (value?: unknown) => void) => {
      listeners.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
    }),
  };
  return { socket, listeners };
});
vi.mock('../src/lib/socket.js', () => ({ socket }));

function Probe() {
  const app = useApp();
  return (
    <>
      <span>{app.session ? 'En sala' : 'Sin sesión'}</span>
      <button
        onClick={() =>
          app.sendAction({ type: 'karts:input', throttle: 1, steer: 0, braking: false })
        }
      >
        Acelerar
      </button>
      <button onClick={() => app.createRoom('Ana')}>Crear</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  socket.emit.mockClear();
  socket.connected = true;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('una pestaña sustituida conserva la sesión de la nueva y no la reclama al reconectar', () => {
  const stored = { code: 'ABC12', token: 'token', playerId: 'p1', name: 'Ana' };
  saveSession(stored);
  render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  act(() => listeners.get(SERVER_EVENTS.session)!(stored));
  expect(screen.getByText('En sala')).toBeDefined();
  act(() => listeners.get(SERVER_EVENTS.sessionReplaced)!());
  expect(screen.getByText('Sin sesión')).toBeDefined();
  expect(loadSession()).toEqual(stored);
  socket.emit.mockClear();
  act(() => listeners.get('connect')!());
  expect(socket.emit.mock.calls.some(([event]) => event === CLIENT_EVENTS.rejoin)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.createRoom, { name: 'Ana' });
});

it('las acciones offline no se encolan para una partida posterior', () => {
  render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  socket.emit.mockClear();
  socket.connected = false;
  fireEvent.click(screen.getByRole('button', { name: 'Acelerar' }));
  expect(socket.emit).not.toHaveBeenCalled();
  socket.connected = true;
  fireEvent.click(screen.getByRole('button', { name: 'Acelerar' }));
  expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.gameAction, {
    type: 'karts:input',
    throttle: 1,
    steer: 0,
    braking: false,
  });
});
