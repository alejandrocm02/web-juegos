import {
  EIGHT_BALL,
  POOL_TABLE,
  ballsOfGroup,
  groupOfBall,
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
  const eightBall = state.mode === 'bola8';
  const myGroup = session ? (state.groups[session.playerId] ?? null) : null;
  /** Bolas del grupo propio que siguen en la mesa. */
  const myGroupLeft = myGroup
    ? state.balls.filter((ball) => !ball.pocketed && ballsOfGroup(myGroup).includes(ball.id)).length
    : null;
  const blackOnTable = state.balls.some((ball) => ball.id === EIGHT_BALL.blackId && !ball.pocketed);

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
        draw(ctx, canvas, balls, dragRef.current, isMyTurn, eightBall);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [state.balls, snapshotRef, isMyTurn, eightBall]);

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
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:px-8">
      <Panel
        title={'Turno de ' + (activePlayer?.name ?? '...')}
        subtitle={
          isMyTurn
            ? 'Arrastra desde la bola blanca hacia atras para dar potencia'
            : state.phase === 'simulating'
              ? 'Bolas en movimiento...'
              : 'Espera tu turno'
        }
        className="overflow-hidden"
      >
        <div className="game-hud mb-4">
          <div className="hud-stat">
            <span className="hud-stat-label">Modalidad</span>
            <strong className="hud-stat-value">{eightBall ? 'Bola 8' : 'Clásico'}</strong>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Estado</span>
            <strong className="hud-stat-value">
              {state.phase === 'simulating' ? 'En movimiento' : isMyTurn ? 'Tu turno' : 'Rival'}
            </strong>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">Tiempo</span>
            <strong
              className={'hud-stat-value tabular-nums ' + (seconds <= 5 ? 'text-rose-300' : '')}
            >
              {state.phase === 'aiming' ? seconds + 's' : '—'}
            </strong>
          </div>
          <div className="hud-stat">
            <span className="hud-stat-label">{eightBall ? 'Tu objetivo' : 'Restantes'}</span>
            <strong className="hud-stat-value">
              {eightBall
                ? myGroup === 'lisas'
                  ? 'Lisas'
                  : myGroup === 'rayadas'
                    ? 'Rayadas'
                    : 'Mesa abierta'
                : state.ballsLeft}
            </strong>
          </div>
        </div>

        <div className="game-board-frame pool-table-frame relative">
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
          {state.phase === 'simulating' && (
            <div className="game-overlay pool-status-overlay">Bolas en movimiento</div>
          )}
        </div>

        <div className="pool-console mt-4">
          <div className="pool-console-copy">
            <span className="pool-console-kicker">Lectura de mesa</span>
            <strong>{state.lastShotSummary ?? 'Prepara el primer golpe'}</strong>
          </div>
          {eightBall ? (
            <div className="pool-objective">
              {state.tableOpen ? (
                <span>Mesa abierta · cualquier grupo es válido</span>
              ) : (
                <span>
                  {myGroupLeft === 0
                    ? blackOnTable
                      ? 'Mesa limpia · juega la bola 8'
                      : 'Bola 8 embocada'
                    : `${myGroupLeft ?? '—'} ${
                        myGroupLeft === 1 ? 'bola' : 'bolas'
                      } de tu grupo en mesa`}
                </span>
              )}
            </div>
          ) : (
            <div className="pool-objective">{state.ballsLeft} bolas de color restantes</div>
          )}
        </div>

        {isMyTurn && (
          <div className="pool-power mt-3">
            <span>Potencia</span>
            <div className="premium-progress flex-1">
              <div className="premium-progress-fill" style={{ width: dragPower * 100 + '%' }} />
            </div>
            <strong className="tabular-nums">{Math.round(dragPower * 100)}%</strong>
          </div>
        )}
      </Panel>

      <Panel title={eightBall ? 'Grupos' : 'Puntuación'}>
        <ul className="space-y-2">
          {state.order.map((playerId) => {
            const player = room?.players.find((p) => p.id === playerId);
            if (!player) return null;
            return (
              <li
                key={playerId}
                className={
                  'score-row ' +
                  (playerId === state.activePlayerId ? 'border-neon-cyan/60 bg-neon-cyan/10' : '')
                }
              >
                <span className="score-row-leading">
                  <span className="score-avatar">
                    <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                  </span>
                  <span className="score-row-player">
                    <strong>{player.name}</strong>
                    <small>{playerId === state.activePlayerId ? 'En la mesa' : 'Esperando'}</small>
                  </span>
                </span>
                {eightBall ? (
                  <span className="text-right text-xs leading-tight">
                    <span className="block font-semibold text-white">
                      {state.groups[playerId]
                        ? state.groups[playerId] === 'lisas'
                          ? 'Lisas'
                          : 'Rayadas'
                        : 'Sin grupo'}
                    </span>
                    <span className="text-slate-400">
                      {state.groups[playerId]
                        ? state.balls.filter(
                            (ball) =>
                              !ball.pocketed &&
                              ballsOfGroup(state.groups[playerId]!).includes(ball.id),
                          ).length + ' restantes'
                        : 'mesa abierta'}
                    </span>
                  </span>
                ) : (
                  <span className="font-display text-lg font-bold tabular-nums">
                    {state.scores[playerId] ?? 0}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          {eightBall
            ? 'La mesa está abierta hasta la primera entrada limpia. Limpia tu grupo y cierra con la negra: meterla antes pierde la partida.'
            : 'Cada bola de color embocada suma 1 punto. Embocar la blanca resta 1 y termina el turno.'}
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
  eightBall: boolean,
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
  ctx.fillStyle = '#17120d';
  ctx.fillRect(0, 0, POOL_TABLE.width, POOL_TABLE.height);
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = cloth;
  ctx.fillRect(7, 7, POOL_TABLE.width - 14, POOL_TABLE.height - 14);
  ctx.shadowBlur = 0;

  const rail = ctx.createLinearGradient(0, 0, 0, POOL_TABLE.height);
  rail.addColorStop(0, '#b78345');
  rail.addColorStop(0.18, '#71421d');
  rail.addColorStop(0.55, '#3b210f');
  rail.addColorStop(1, '#8a5427');
  ctx.strokeStyle = rail;
  ctx.lineWidth = 10;
  ctx.strokeRect(1, 1, POOL_TABLE.width - 2, POOL_TABLE.height - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(6, 6, POOL_TABLE.width - 12, POOL_TABLE.height - 12);

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 0.45;
  for (let x = 18; x < POOL_TABLE.width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, POOL_TABLE.height - 8);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.36)';
  ctx.beginPath();
  ctx.arc(POOL_TABLE.width * 0.25, POOL_TABLE.height / 2, 1.2, 0, Math.PI * 2);
  ctx.fill();

  for (const pocket of poolPockets()) {
    const pocketGlow = ctx.createRadialGradient(
      pocket.x,
      pocket.y,
      POOL_TABLE.pocketRadius * 0.2,
      pocket.x,
      pocket.y,
      POOL_TABLE.pocketRadius * 1.4,
    );
    pocketGlow.addColorStop(0, '#000000');
    pocketGlow.addColorStop(0.65, '#040609');
    pocketGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pocketGlow;
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POOL_TABLE.pocketRadius * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const cue = balls.find((b) => b.id === 0);
  if (isMyTurn && drag && cue && !cue.pocketed) {
    const dx = cue.x - drag.x;
    const dy = cue.y - drag.y;
    const length = Math.min(MAX_DRAG, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    ctx.shadowColor = 'rgba(34,211,238,0.75)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(103,232,249,0.95)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(cue.x + Math.cos(angle) * length * 1.4, cue.y + Math.sin(angle) * length * 1.4);
    ctx.stroke();
    ctx.shadowBlur = 0;
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
    const baseColor = eightBall && ball.id === EIGHT_BALL.blackId ? '#1b1d24' : ball.color;
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.18, baseColor);
    ballGradient.addColorStop(1, ball.id === 0 ? '#aeb7c2' : '#10131a');
    ctx.fillStyle = ballGradient;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
    if (eightBall && groupOfBall(ball.id) === 'rayadas') {
      // Franja horizontal blanca: distingue rayadas de lisas sin depender del color.
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, POOL_TABLE.ballRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(
        ball.x - POOL_TABLE.ballRadius,
        ball.y - POOL_TABLE.ballRadius * 0.34,
        POOL_TABLE.ballRadius * 2,
        POOL_TABLE.ballRadius * 0.68,
      );
      ctx.restore();
    }
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
