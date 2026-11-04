// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from '../src/components/ui.js';
import { estimateOffset, resetClock, serverNow, setClockOffset } from '../src/lib/clock.js';

/** Reloj del servidor fijo en los tests: el del cliente va 10 s adelantado. */
const SERVER_NOW = 1_800_000_000_000;
const CLIENT_SKEW_MS = 10_000;

afterEach(() => {
  resetClock();
  vi.useRealTimers();
});

describe('estimateOffset', () => {
  it('usa la muestra con menor ida y vuelta y la corrige con su punto medio', () => {
    const offset = estimateOffset([
      // RTT 400 ms: la respuesta se retrasó y no es fiable.
      { sentAt: 1000, serverTime: 6300, receivedAt: 1400 },
      // RTT 40 ms: el servidor respondió en el punto medio, 1020 en reloj local.
      { sentAt: 2000, serverTime: 7020, receivedAt: 2040 },
    ]);
    expect(offset).toBe(5000);
  });

  it('descarta muestras imposibles y devuelve null si no queda ninguna', () => {
    expect(estimateOffset([])).toBeNull();
    expect(
      estimateOffset([
        { sentAt: 2000, serverTime: 5000, receivedAt: 1999 },
        { sentAt: 1000, serverTime: Number.NaN, receivedAt: 1010 },
        { sentAt: 1000, serverTime: 5000, receivedAt: 60_000 },
      ]),
    ).toBeNull();
  });
});

describe('serverNow', () => {
  it('aplica el desfase estimado sobre el reloj local', () => {
    vi.useFakeTimers({ now: SERVER_NOW + CLIENT_SKEW_MS });
    expect(serverNow()).toBe(SERVER_NOW + CLIENT_SKEW_MS);
    setClockOffset(-CLIENT_SKEW_MS);
    expect(serverNow()).toBe(SERVER_NOW);
  });
});

describe('Countdown con el reloj del cliente desfasado', () => {
  it('muestra el tiempo que queda según el servidor, no según el reloj local', () => {
    vi.useFakeTimers({ now: SERVER_NOW + CLIENT_SKEW_MS });
    setClockOffset(-CLIENT_SKEW_MS);

    render(<Countdown deadline={SERVER_NOW + 15_000} />);
    expect(screen.getByText('15s')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('10s')).toBeTruthy();
  });
});
