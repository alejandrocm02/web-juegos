import {
  GAME_MODE_CATALOG,
  KART,
  type KartsPublicState,
  type KartsSnapshot,
  type KartState,
} from '@arcade/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const VIEW_W = 1000;
const VIEW_H = 640;

interface DriveInput {
  throttle: number;
  steer: number;
  braking: boolean;
}

const NEUTRAL: DriveInput = { throttle: 0, steer: 0, braking: false };

export default function KartsView({ state }: { state: KartsPublicState }) {
  const { sendAction, session, room, snapshotRef } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const touchRef = useRef<DriveInput>({ ...NEUTRAL });
  const lastSentRef = useRef<DriveInput>({ ...NEUTRAL });
  const renderRef = useRef(new Map<string, { x: number; y: number; heading: number }>());
  const [touchState, setTouchState] = useState<DriveInput>({ ...NEUTRAL });

  const modeInfo = GAME_MODE_CATALOG.karts.find((mode) => mode.id === state.mode);
  const myKart = state.karts.find((kart) => kart.playerId === session?.playerId);

  /**
   * Envia la conduccion solo cuando cambia.
   * Mandar un mensaje por fotograma superaria el limite de mensajes por socket
   * y no aportaria nada: el servidor mantiene la ultima intencion recibida.
   */
  const publish = useCallback(() => {
    const keys = keysRef.current;
    const touch = touchRef.current;
    const throttle = clamp(
      (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0) + touch.throttle,
      -1,
      1,
    );
    const steer = clamp(
      (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) + touch.steer,
      -1,
      1,
    );
    const braking = keys.has('brake') || touch.braking;

    const last = lastSentRef.current;
    if (last.throttle === throttle && last.steer === steer && last.braking === braking) return;
    lastSentRef.current = { throttle, steer, braking };
    sendAction({ type: 'karts:input', throttle, steer, braking });
  }, [sendAction]);

  useEffect(() => {
    const map: Record<string, string> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      Space: 'brake',
    };
    const onDown = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      event.preventDefault();
      keysRef.current.add(action);
      publish();
    };
    const onUp = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      keysRef.current.delete(action);
      publish();
    };
    const onBlur = () => {
      keysRef.current.clear();
      publish();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [publish]);

  const setTouch = (patch: Partial<DriveInput>) => {
    touchRef.current = { ...touchRef.current, ...patch };
    setTouchState({ ...touchRef.current });
    publish();
  };

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const snapshot = snapshotRef.current as KartsSnapshot | null;
        const source = snapshot && 'karts' in snapshot ? snapshot.karts : state.karts;
        interpolate(renderRef.current, source, dt);
        draw(ctx, canvas, state, renderRef.current, room?.players ?? [], session?.playerId);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state, snapshotRef, room, session?.playerId]);

  const countdownSeconds = Math.ceil(state.countdownMs / 1000);

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip font-display">{modeInfo?.name ?? state.mode}</span>
          <span className="chip">{state.track.name}</span>
          <span className="chip">
            Vuelta {Math.min((myKart?.lap ?? 0) + 1, state.totalLaps)}/{state.totalLaps}
          </span>
          <span className="chip">Posicion {myKart?.position ?? '-'}</span>
          {myKart?.bestLapMs && (
            <span className="chip">Mejor {(myKart.bestLapMs / 1000).toFixed(2)} s</span>
          )}
          {state.nextEliminationMs !== null && (
            <span className="chip text-[color:var(--accent-red-ink)]">
              Eliminacion en {Math.ceil(state.nextEliminationMs / 1000)} s
            </span>
          )}
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="w-full rounded-2xl border border-white/10 bg-black"
            aria-label={'Circuito ' + state.track.name}
          />

          {state.phase === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70">
              <span className="font-display text-7xl font-black text-white">
                {countdownSeconds > 0 ? countdownSeconds : 'YA'}
              </span>
            </div>
          )}

          {myKart?.eliminated && (
            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-xl bg-[color:var(--accent-red)] px-4 py-2 text-sm font-semibold text-white">
              Eliminado. Sigues viendo la carrera.
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Acelera con W o flecha arriba, gira con A y D, marcha atras con S y freno con espacio.
        </p>

        {/* Controles tactiles: objetivo minimo de 44 px por boton. */}
        <div className="grid grid-cols-4 gap-2 sm:hidden">
          <TouchButton
            label="Izquierda"
            active={touchState.steer < 0}
            onPress={() => setTouch({ steer: -1 })}
            onRelease={() => setTouch({ steer: 0 })}
          >
            &#8592;
          </TouchButton>
          <TouchButton
            label="Derecha"
            active={touchState.steer > 0}
            onPress={() => setTouch({ steer: 1 })}
            onRelease={() => setTouch({ steer: 0 })}
          >
            &#8594;
          </TouchButton>
          <TouchButton
            label="Frenar"
            active={touchState.braking}
            onPress={() => setTouch({ braking: true })}
            onRelease={() => setTouch({ braking: false })}
          >
            Freno
          </TouchButton>
          <TouchButton
            label="Acelerar"
            active={touchState.throttle > 0}
            onPress={() => setTouch({ throttle: 1 })}
            onRelease={() => setTouch({ throttle: 0 })}
          >
            Gas
          </TouchButton>
        </div>
      </div>

      <Panel title="Clasificacion">
        <ol className="space-y-2">
          {state.karts.map((kart) => {
            const player = room?.players.find((entry) => entry.id === kart.playerId);
            if (!player) return null;
            const mine = kart.playerId === session?.playerId;
            return (
              <li
                key={kart.playerId}
                className={
                  'flex items-center justify-between rounded-xl border px-3 py-2 text-sm ' +
                  (mine
                    ? 'border-[color:var(--accent-blue)] bg-[color:var(--accent-blue)]/10'
                    : 'border-white/5 bg-white/[0.03]')
                }
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 text-center font-display font-bold text-slate-400">
                    {kart.position}
                  </span>
                  <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                  <span className={kart.eliminated ? 'text-slate-500 line-through' : 'text-white'}>
                    {player.name}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-400">
                  {kart.finished
                    ? ((kart.totalMs ?? 0) / 1000).toFixed(1) + ' s'
                    : 'V' + kart.lap + ' P' + kart.gate}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-slate-400">{modeInfo?.rule}</p>
      </Panel>
    </div>
  );
}

function TouchButton({
  label,
  active,
  onPress,
  onRelease,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onRelease: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={
        'min-h-14 rounded-xl border text-sm font-semibold transition ' +
        (active
          ? 'border-[color:var(--accent-blue)] bg-[color:var(--accent-blue)]/25 text-white'
          : 'border-white/15 bg-white/5 text-slate-200')
      }
      onPointerDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
    >
      {children}
    </button>
  );
}

/** Suaviza el movimiento entre snapshots del servidor. */
function interpolate(
  store: Map<string, { x: number; y: number; heading: number }>,
  karts: KartState[],
  dt: number,
): void {
  const alpha = 1 - Math.pow(0.0015, dt);
  for (const kart of karts) {
    const current = store.get(kart.playerId);
    if (!current) {
      store.set(kart.playerId, { x: kart.x, y: kart.y, heading: kart.heading });
      continue;
    }
    current.x += (kart.x - current.x) * alpha;
    current.y += (kart.y - current.y) * alpha;
    let diff = kart.heading - current.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    current.heading += diff * alpha;
  }
  for (const id of [...store.keys()]) {
    if (!karts.some((kart) => kart.playerId === id)) store.delete(id);
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: KartsPublicState,
  render: Map<string, { x: number; y: number; heading: number }>,
  players: { id: string; name: string; color: string }[],
  myId?: string,
): void {
  const gates = state.track.gates;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Asfalto: banda cerrada entre los extremos de las puertas.
  ctx.beginPath();
  gates.forEach((gate, index) => {
    if (index === 0) ctx.moveTo(gate.left.x, gate.left.y);
    else ctx.lineTo(gate.left.x, gate.left.y);
  });
  for (let i = gates.length - 1; i >= 0; i--) {
    const gate = gates[i]!;
    ctx.lineTo(gate.right.x, gate.right.y);
  }
  ctx.closePath();
  ctx.fillStyle = '#14171f';
  ctx.fill();

  // Muros.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(143,182,255,0.55)';
  for (const side of ['left', 'right'] as const) {
    ctx.beginPath();
    gates.forEach((gate, index) => {
      const point = gate[side];
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Checkpoints tenues y meta destacada.
  gates.forEach((gate, index) => {
    ctx.beginPath();
    ctx.moveTo(gate.left.x, gate.left.y);
    ctx.lineTo(gate.right.x, gate.right.y);
    ctx.strokeStyle = index === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = index === 0 ? 4 : 1;
    ctx.stroke();
  });

  for (const kart of state.karts) {
    const view = render.get(kart.playerId) ?? kart;
    const player = players.find((entry) => entry.id === kart.playerId);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.rotate(view.heading);
    ctx.globalAlpha = kart.eliminated ? 0.35 : 1;
    ctx.fillStyle = player?.color ?? '#ffffff';
    ctx.fillRect(-KART.radius, -KART.radius * 0.7, KART.radius * 2, KART.radius * 1.4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(KART.radius * 0.2, -KART.radius * 0.45, KART.radius * 0.6, KART.radius * 0.9);
    ctx.restore();

    if (player) {
      ctx.globalAlpha = kart.eliminated ? 0.4 : 1;
      ctx.fillStyle = kart.playerId === myId ? '#ffffff' : 'rgba(226,232,240,0.75)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, view.x, view.y - KART.radius - 6);
      ctx.globalAlpha = 1;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
