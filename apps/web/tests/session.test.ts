// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadName, loadSession, saveSession } from '../src/lib/session.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('la portada funciona cuando el navegador bloquea localStorage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  expect(loadName()).toBe('');
  expect(loadSession()).toBeNull();
});

it('ignora sesiones corruptas en lugar de pasar objetos al formulario', () => {
  for (const value of [
    null,
    [],
    { code: {}, token: 'x', playerId: 'a' },
    { code: 'ABC12', token: 'x', playerId: 'a', name: {} },
  ]) {
    localStorage.setItem('arcade.session.v1', JSON.stringify(value));
    expect(loadSession()).toBeNull();
  }
});

it('conserva el nombre y la sesión válidos', () => {
  saveSession({ code: 'ABC12', token: 'token', playerId: 'a', name: 'Ana' });
  expect(loadName()).toBe('Ana');
});
