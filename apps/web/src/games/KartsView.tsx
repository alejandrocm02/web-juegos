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
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="game-hud text-sm">
          <span className="hud-stat">
            <span className="hud-stat-label">Circuito</span>
            <span className="hud-stat-value">{state.track.name}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Vuelta</span>
            <span className="hud-stat-value">
              {Math.min((myKart?.lap ?? 0) + 1, state.totalLaps)}/{state.totalLaps}
            </span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Posición</span>
            <span className="hud-stat-value">P{myKart?.position ?? '-'}</span>
          </span>
          {myKart?.bestLapMs && (
            <span className="hud-stat">
              <span className="hud-stat-label">Mejor vuelta</span>
              <span className="hud-stat-value">{(myKart.bestLapMs / 1000).toFixed(2)} s</span>
            </span>
          )}
          {state.nextEliminationMs !== null && (
            <span className="hud-stat ml-auto border-rose-500/30">
              <span className="hud-stat-label text-rose-300">Eliminación</span>
              <span className="hud-stat-value text-rose-200">
                {Math.ceil(state.nextEliminationMs / 1000)} s
              </span>
            </span>
          )}
        </div>

        <div className="game-board-frame relative">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="w-full bg-black"
            aria-label={'Circuito ' + state.track.name}
          />

          {state.phase === 'countdown' && (
            <div className="absolute inset-1.5 z-[4] flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-sm">
              <div className="game-countdown">
                <span className="game-countdown-label">Parrilla preparada</span>
                <span className="game-countdown-value">
                  {countdownSeconds > 0 ? countdownSeconds : 'YA'}
                </span>
              </div>
            </div>
          )}

          {myKart?.eliminated && (
            <div className="game-overlay absolute left-1/2 top-6 z-[4] -translate-x-1/2 px-4 py-2 text-sm font-semibold text-rose-200">
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
  const ground = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ground.addColorStop(0, '#0a231e');
  ground.addColorStop(0.55, '#071a18');
  ground.addColorStop(1, '#081311');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Textura técnica del terreno.
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.045)';
  ctx.lineWidth = 1;
  for (let x = -canvas.height; x < canvas.width; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + canvas.height, canvas.height);
    ctx.stroke();
  }

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
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  const asphalt = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  asphalt.addColorStop(0, '#2a303a');
  asphalt.addColorStop(0.45, '#171c24');
  asphalt.addColorStop(1, '#252a32');
  ctx.fillStyle = asphalt;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Bordes luminosos y pianos alternos.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(5,8,12,0.85)';
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
  for (const side of ['left', 'right'] as const) {
    for (let index = 0; index < gates.length; index++) {
      const current = gates[index]![side];
      const next = gates[(index + 1) % gates.length]![side];
      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(next.x, next.y);
      ctx.strokeStyle = index % 2 === 0 ? '#f1f5f9' : '#e11d48';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.82;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Checkpoints tenues y meta destacada.
  gates.forEach((gate, index) => {
    ctx.beginPath();
    ctx.moveTo(gate.left.x, gate.left.y);
    ctx.lineTo(gate.right.x, gate.right.y);
    ctx.strokeStyle = index === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(103,232,249,0.055)';
    ctx.lineWidth = index === 0 ? 5 : 1;
    ctx.stroke();
  });

  // Cajones de parrilla junto a la meta.
  const start = gates[0]!;
  const previous = gates[gates.length - 1]!;
  const centerX = (start.left.x + start.right.x) / 2;
  const centerY = (start.left.y + start.right.y) / 2;
  const previousX = (previous.left.x + previous.right.x) / 2;
  const previousY = (previous.left.y + previous.right.y) / 2;
  const heading = Math.atan2(centerY - previousY, centerX - previousX);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(heading);
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      ctx.strokeRect(-20 - row * 28, side * 18 - 9, 20, 18);
    }
  }
  ctx.restore();

  for (const kart of state.karts) {
    const view = render.get(kart.playerId) ?? kart;
    const player = players.find((entry) => entry.id === kart.playerId);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.rotate(view.heading);
    ctx.globalAlpha = kart.eliminated ? 0.35 : 1;
    ctx.shadowColor = kart.playerId === myId ? 'rgba(255,255,255,0.8)' : (player?.color ?? '#fff');
    ctx.shadowBlur = kart.playerId === myId ? 12 : 7;
    // Neumáticos.
    ctx.fillStyle = '#05070a';
    ctx.fillRect(-KART.radius * 0.65, -KART.radius, KART.radius * 0.62, KART.radius * 0.38);
    ctx.fillRect(KART.radius * 0.25, -KART.radius, KART.radius * 0.62, KART.radius * 0.38);
    ctx.fillRect(-KART.radius * 0.65, KART.radius * 0.62, KART.radius * 0.62, KART.radius * 0.38);
    ctx.fillRect(KART.radius * 0.25, KART.radius * 0.62, KART.radius * 0.62, KART.radius * 0.38);
    // Carrocería.
    const body = ctx.createLinearGradient(-KART.radius, 0, KART.radius, 0);
    body.addColorStop(0, player?.color ?? '#fff');
    body.addColorStop(0.55, player?.color ?? '#fff');
    body.addColorStop(1, '#f8fafc');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-KART.radius, -KART.radius * 0.68);
    ctx.lineTo(KART.radius * 0.72, -KART.radius * 0.54);
    ctx.lineTo(KART.radius, 0);
    ctx.lineTo(KART.radius * 0.72, KART.radius * 0.54);
    ctx.lineTo(-KART.radius, KART.radius * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Cabina y alerón.
    ctx.fillStyle = 'rgba(3,7,18,0.78)';
    ctx.fillRect(-KART.radius * 0.28, -KART.radius * 0.42, KART.radius * 0.72, KART.radius * 0.84);
    ctx.fillRect(-KART.radius * 1.05, -KART.radius * 0.82, KART.radius * 0.18, KART.radius * 1.64);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(KART.radius * 0.78, -KART.radius * 0.38, 2.5, 2.5);
    ctx.fillRect(KART.radius * 0.78, KART.radius * 0.18, 2.5, 2.5);
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
