// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenGameKeys } from '../src/lib/game-input.js';
import { HoldButton } from '../src/components/HoldButton.js';
import { ConfirmDialog } from '../src/components/navigation.js';

const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  cleanup();
  vi.restoreAllMocks();
});

function keyboard() {
  const changed = vi.fn();
  const reset = vi.fn();
  stops.push(listenGameKeys({ KeyW: 'up', ArrowUp: 'up', Space: 'attack' }, changed, reset));
  return { changed, reset };
}

describe('controles de juego', () => {
  it('mantiene la dirección mientras quede una tecla equivalente pulsada', () => {
    const { changed } = keyboard();
    fireEvent.keyDown(window, { code: 'KeyW' });
    fireEvent.keyDown(window, { code: 'ArrowUp' });
    fireEvent.keyUp(window, { code: 'KeyW' });
    expect(changed).toHaveBeenLastCalledWith(new Set(['up']));
    fireEvent.keyUp(window, { code: 'ArrowUp' });
    expect(changed).toHaveBeenLastCalledWith(new Set());
  });

  it('no duplica acciones por repetición del teclado', () => {
    const { changed } = keyboard();
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyDown(window, { code: 'Space', repeat: true });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('respeta campos, botones y diálogos abiertos', () => {
    const { changed } = keyboard();
    render(
      <>
        <input aria-label="Nombre" />
        <button>Ayuda</button>
        <div aria-modal="true" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('Nombre'), { code: 'KeyW' });
    fireEvent.keyDown(screen.getByRole('button'), { code: 'Space' });
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(changed).not.toHaveBeenCalled();
  });

  it('libera controles al perder foco, ocultarse o enfocar un botón', () => {
    const { reset } = keyboard();
    fireEvent.blur(window);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    render(<button>Ayuda</button>);
    fireEvent.focusIn(screen.getByRole('button'));
    expect(reset).toHaveBeenCalledTimes(3);
  });

  it('retira todos los eventos al salir y no acumula blur', () => {
    const { reset, changed } = keyboard();
    stops.pop()!();
    reset.mockClear();
    fireEvent.blur(window);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(reset).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('el botón mantenido funciona con teclado y libera una sola vez', () => {
    const change = vi.fn();
    render(
      <HoldButton label="Gas" onChange={change}>
        Gas
      </HoldButton>,
    );
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { code: 'Space' });
    fireEvent.keyDown(button, { code: 'Space', repeat: true });
    fireEvent.keyUp(button, { code: 'Space' });
    fireEvent.lostPointerCapture(button);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });

  it('un control táctil cancelado deja de actuar', () => {
    const change = vi.fn();
    render(
      <HoldButton label="Gas" onChange={change}>
        Gas
      </HoldButton>,
    );
    const button = screen.getByRole('button');
    button.setPointerCapture = vi.fn();
    fireEvent(
      button,
      Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, pointerId: 1 }),
    );
    fireEvent.pointerCancel(button);
    fireEvent.lostPointerCapture(button);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });
});

it('el diálogo retiene el foco, no lo reinicia al renderizar y lo devuelve al cerrar', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const props = {
    open: true,
    title: 'Salir',
    description: 'Terminar partida',
    confirmLabel: 'Terminar',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  const view = render(<ConfirmDialog {...props} />);
  const confirm = screen.getByRole('button', { name: 'Terminar' });
  const cancel = screen.getByRole('button', { name: 'Cancelar' });
  expect(document.activeElement).toBe(confirm);
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(document.activeElement).toBe(cancel);
  view.rerender(<ConfirmDialog {...props} onCancel={vi.fn()} />);
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(confirm);
  view.rerender(<ConfirmDialog {...props} open={false} />);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
