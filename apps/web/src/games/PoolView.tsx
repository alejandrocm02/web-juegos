import {
  POOL_TABLE,
  poolPockets,
  type PoolBallState,
  type PoolPublicState,
  type PoolSnapshot,
} from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const MAX_DRAG = 190;

export default function PoolView({ state }: { state: PoolPublicState }) {
  const { sendAction, session, room, snapshotRef } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  const isMyTurn = state.activePlayerId === session?.playerId && state.phase === 'aiming';
  const activePlayer = room?.players.find((p) => p.id === state.activePlayerId);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const snapshot = snapshotRef.current as PoolSnapshot | null;
        const balls =
          snapshot && 'balls' in snapshot && Array.isArray(snapshot.balls) && 'settled' in snapshot
            ? (snapshot.balls as PoolBallState[])
            : state.balls;
        draw(ctx, canvas, balls, dragRef.current, isMyTurn);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [state.balls, snapshotRef, isMyTurn]);

  const pointerToWorld = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * POOL_TABLE.width,
      y: ((event.clientY - rect.top) / rect.height) * POOL_TABLE.height,
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!isMyTurn) return;
    const point = pointerToWorld(event);
    if (!point) return;
    dragRef.current = point;
    setDrag(point);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const point = pointerToWorld(event);
    if (!point) return;
    dragRef.current = point;
    setDrag(point);
  };

  const onPointerUp = () => {
    const point = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!point || !isMyTurn) return;
    const cue = (state.balls.find((b) => b.id === 0) ?? null) as PoolBallState | null;
    const snapshot = snapshotRef.current as PoolSnapshot | null;
    const liveCue = snapshot?.balls?.find?.((b) => b.id === 0) ?? cue;
    if (!liveCue) return;
    const dx = liveCue.x - point.x;
    const dy = liveCue.y - point.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) return;
    const power = Math.min(1, distance / MAX_DRAG);
    sendAction({ type: 'pool:shoot', angle: Math.atan2(dy, dx), power: Math.max(0.03, power) });
  };

  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const cue = state.balls.find((b) => b.id === 0);
  const dragPower =
    drag && cue ? Math.min(1, Math.hypot(cue.x - drag.x, cue.y - drag.y) / MAX_DRAG) : 0;

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">
      <Panel
        title={'Turno de ' + (activePlayer?.name ?? '...')}
        subtitle={
          isMyTurn
            ? 'Arrastra desde la bola blanca hacia atras para dar potencia'
            : state.phase === 'simulating'
              ? 'Bolas en movimiento...'
              : 'Espera tu turno'
        }
        actions={
          <span className={'chip tabular-nums ' + (seconds <= 5 ? 'text-rose-300' : '')}>
            {state.phase === 'aiming' ? seconds + 's' : '...'}
          </span>
        }
        className="overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-20 top-1/4 h-64 w-64 rounded-full bg-neon-cyan/[0.07] blur-3xl" />
        <div className="canvas-frame relative">
          <canvas
            ref={canvasRef}
            width={1016}
            height={508}
            className={'w-full touch-none rounded-[1.1rem] ' + (isMyTurn ? 'cursor-crosshair' : '')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Mesa de billar"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          <span>Bolas de color restantes: {state.ballsLeft}</span>
          <span className="text-right text-xs">
            {state.lastShotSummary ?? 'Sin golpes todavía'}
          </span>
        </div>
        {isMyTurn && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-neon-cyan transition-[width] duration-75"
              style={{ width: dragPower * 100 + '%' }}
            />
          </div>
        )}
      </Panel>

      <Panel title="Puntuacion">
        <ul className="space-y-2">
          {state.order.map((playerId) => {
            const player = room?.players.find((p) => p.id === playerId);
            if (!player) return null;
            return (
              <li
                key={playerId}
                className={
                  'flex items-center justify-between rounded-xl border px-3 py-2 ' +
                  (playerId === state.activePlayerId
                    ? 'border-neon-cyan bg-neon-cyan/10'
                    : 'border-white/5 bg-white/5')
                }
              >
                <span className="flex items-center gap-2">
                  <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                  {player.name}
                </span>
                <span className="font-display text-lg font-bold tabular-nums">
                  {state.scores[playerId] ?? 0}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Cada bola de color embocada suma 1 punto. Embocar la blanca resta 1 y termina el turno.
        </p>
      </Panel>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  balls: PoolBallState[],
  drag: { x: number; y: number } | null,
  isMyTurn: boolean,
): void {
  const scale = canvas.width / POOL_TABLE.width;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const cloth = ctx.createRadialGradient(
    POOL_TABLE.width * 0.45,
    POOL_TABLE.height * 0.35,
    20,
    POOL_TABLE.width / 2,
    POOL_TABLE.height / 2,
    POOL_TABLE.width * 0.7,
  );
  cloth.addColorStop(0, '#167a55');
  cloth.addColorStop(0.65, '#0e6042');
  cloth.addColorStop(1, '#08442f');
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, POOL_TABLE.width, POOL_TABLE.height);
  ctx.strokeStyle = '#6f4220';
  ctx.lineWidth = 9;
  ctx.strokeRect(1, 1, POOL_TABLE.width - 2, POOL_TABLE.height - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(6, 6, POOL_TABLE.width - 12, POOL_TABLE.height - 12);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(POOL_TABLE.width * 0.25, POOL_TABLE.height / 2, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0b0f1a';
  for (const pocket of poolPockets()) {
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POOL_TABLE.pocketRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  const cue = balls.find((b) => b.id === 0);
  if (isMyTurn && drag && cue && !cue.pocketed) {
    const dx = cue.x - drag.x;
    const dy = cue.y - drag.y;
    const length = Math.min(MAX_DRAG, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    ctx.strokeStyle = 'rgba(34,211,238,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(cue.x + Math.cos(angle) * length * 1.4, cue.y + Math.sin(angle) * length * 1.4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(248,250,252,0.6)';
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(drag.x, drag.y);
    ctx.stroke();
  }

  for (const ball of balls) {
    if (ball.pocketed) continue;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1.2;
    ctx.shadowOffsetY = 1.7;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, POOL_TABLE.ballRadius, 0, Math.PI * 2);
    const ballGradient = ctx.createRadialGradient(
      ball.x - POOL_TABLE.ballRadius * 0.35,
      ball.y - POOL_TABLE.ballRadius * 0.4,
      POOL_TABLE.ballRadius * 0.1,
      ball.x,
      ball.y,
      POOL_TABLE.ballRadius,
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.18, ball.color);
    ballGradient.addColorStop(1, ball.id === 0 ? '#aeb7c2' : '#10131a');
    ctx.fillStyle = ballGradient;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
    if (ball.id !== 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, POOL_TABLE.ballRadius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '2.6px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.id), ball.x, ball.y);
    }
  }

  ctx.restore();
}
