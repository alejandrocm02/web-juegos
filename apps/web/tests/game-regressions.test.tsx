// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getKartTrack,
  type KartsPublicState,
  type PoolPublicState,
  type SonglessPublicState,
  type QuizPublicState,
} from '@arcade/shared';
import { KartsWorld, PoolWorld } from '@arcade/game-engine';
import KartsView from '../src/games/KartsView.js';
import PoolView from '../src/games/PoolView.js';
import SonglessView from '../src/games/SonglessView.js';
import QuizView from '../src/games/QuizView.js';
import { makeRoom } from './helpers/fixtures.js';
import { playSonglessClip } from '../src/lib/songless-audio.js';

const sendAction = vi.fn();
let app: Record<string, unknown>;
vi.mock('../src/store.js', () => ({ useApp: () => app }));
vi.mock('../src/lib/songless-audio.js', () => ({ playSonglessClip: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  app = {
    sendAction,
    session: { playerId: 'p1' },
    room: makeRoom(),
    snapshotRef: { current: null },
    connected: true,
    pushToast: vi.fn(),
  };
  sendAction.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('reconectar al quiz respeta una respuesta ya registrada por el servidor', () => {
  const state: QuizPublicState = {
    game: 'quiz',
    phase: 'question',
    mode: 'clasico',
    teams: {},
    question: {
      id: 'q1',
      category: 'ciencia',
      text: 'Pregunta',
      answers: ['A', 'B', 'C', 'D'],
      index: 0,
      total: 10,
    },
    deadline: Date.now() + 15_000,
    answeredPlayerIds: ['p1'],
    correctIndex: null,
    breakdown: [],
    scoreboard: [],
    questionIndex: 0,
    totalQuestions: 10,
  };
  const view = render(<QuizView state={state} />);
  const answers = view.container.querySelectorAll<HTMLButtonElement>('.quiz-answer');
  expect([...answers].every((answer) => answer.disabled)).toBe(true);
  fireEvent.click(answers[0]!);
  expect(sendAction).not.toHaveBeenCalled();
  view.rerender(<QuizView state={{ ...state, questionIndex: 1, answeredPlayerIds: [] }} />);
  expect(answers[0]!.disabled).toBe(false);
  fireEvent.click(answers[0]!);
  expect(sendAction).toHaveBeenCalledOnce();
});

function karts(): KartsPublicState {
  const track = getKartTrack(DEFAULT_SETTINGS.karts.track);
  const world = new KartsWorld(track, ['p1']);
  return {
    ...world.snapshot(),
    game: 'karts',
    phase: 'countdown',
    track,
    totalLaps: track.laps,
    mode: 'clasico',
    countdownMs: 3000,
    nextEliminationMs: null,
    teams: {},
    deadline: Date.now() + 3000,
  };
}

it('acelerar durante la cuenta atrás funciona cuando empieza la carrera', () => {
  const state = karts();
  const view = render(<KartsView state={state} />);
  fireEvent.keyDown(window, { code: 'KeyW' });
  expect(sendAction).not.toHaveBeenCalled();
  view.rerender(<KartsView state={{ ...state, phase: 'racing' }} />);
  expect(sendAction).toHaveBeenLastCalledWith({
    type: 'karts:input',
    throttle: 1,
    steer: 0,
    braking: false,
  });
  fireEvent.blur(window);
  expect(sendAction).toHaveBeenLastCalledWith({
    type: 'karts:input',
    throttle: 0,
    steer: 0,
    braking: false,
  });
});

it('reconectar vuelve a enviar la intención aunque no haya cambiado', () => {
  const state = { ...karts(), phase: 'racing' as const };
  const view = render(<KartsView state={state} />);
  fireEvent.keyDown(window, { code: 'KeyW' });
  app.connected = false;
  view.rerender(<KartsView state={state} />);
  sendAction.mockClear();
  app.connected = true;
  view.rerender(<KartsView state={state} />);
  expect(sendAction).toHaveBeenLastCalledWith({
    type: 'karts:input',
    throttle: 1,
    steer: 0,
    braking: false,
  });
});

it('cancelar un gesto de billar no dispara y soltar un gesto válido dispara una vez', () => {
  const world = new PoolWorld(9, 'normal');
  const state: PoolPublicState = {
    game: 'pool',
    phase: 'aiming',
    mode: 'clasico',
    teams: {},
    sides: {},
    groups: {},
    order: ['p1'],
    activePlayerId: 'p1',
    scores: {},
    balls: world.snapshot().balls,
    ballsLeft: 9,
    tableOpen: true,
    lastShotSummary: null,
    deadline: Date.now() + 30000,
  };
  render(<PoolView state={state} />);
  const canvas = screen.getByLabelText('Mesa de billar');
  canvas.setPointerCapture = vi.fn();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1016,
    height: 508,
    right: 1016,
    bottom: 508,
    toJSON: () => ({}),
  });
  const down = () =>
    fireEvent(
      canvas,
      Object.assign(new Event('pointerdown', { bubbles: true }), {
        clientX: 20,
        clientY: 150,
        pointerId: 1,
      }),
    );
  down();
  fireEvent.pointerCancel(canvas);
  fireEvent.pointerUp(canvas);
  expect(sendAction).not.toHaveBeenCalled();
  down();
  fireEvent.pointerUp(canvas);
  fireEvent.pointerUp(canvas);
  expect(sendAction).toHaveBeenCalledTimes(1);
});

function song(): SonglessPublicState {
  return {
    game: 'songless',
    phase: 'listening',
    mode: 'clasico',
    roundIndex: 0,
    totalRounds: 5,
    clipLevel: 1,
    maxClipLevel: 3,
    track: {
      index: 0,
      total: 12,
      notes: [60, 62, 64, 65],
      bpm: 120,
      candidates: ['Uno', 'Dos', 'Tres', 'Cuatro'],
    },
    answeredPlayerIds: [],
    correctIndex: null,
    correctComposer: null,
    breakdown: [],
    scoreboard: [],
    deadline: Date.now() + 15000,
  };
}

it('una reproducción que termina de iniciarse después de salir se cierra', async () => {
  let resolve!: (stop: () => void) => void;
  vi.mocked(playSonglessClip).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<SonglessView state={song()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Escuchar fragmento' }));
  view.unmount();
  const stop = vi.fn();
  await act(async () => {
    resolve(stop);
  });
  expect(stop).toHaveBeenCalledOnce();
});

it('cambiar de ronda cancela audio y temporizadores de la reproducción anterior', async () => {
  const stop = vi.fn();
  vi.mocked(playSonglessClip).mockResolvedValue(stop);
  const state = song();
  const view = render(<SonglessView state={state} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar fragmento' }));
  });
  expect(vi.getTimerCount()).toBe(2);
  view.rerender(<SonglessView state={{ ...state, roundIndex: 1 }} />);
  expect(stop).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
