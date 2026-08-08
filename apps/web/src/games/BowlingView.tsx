import {
  BOWLING_LANE,
  GAME_MODE_CATALOG,
  type BowlingPublicState,
  type BowlingSnapshot,
} from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useMatch, useRoom } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const VIEW_W = 360;
const VIEW_H = 620;

export default function BowlingView({ state }: { state: BowlingPublicState }) {
  const { session, room } = useRoom();
  const { sendAction, snapshotRef } = useMatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aim, setAim] = useState(0);
  const [spin, setSpin] = useState(0);
  const [power, setPower] = useState(0.7);
  const [now, setNow] = useState(Date.now());

  const isMyTurn = state.activePlayerId === session?.playerId && state.phase === 'aiming';
  const activePlayer = room?.players.find((player) => player.id === state.activePlayerId);
  const myCard = session ? state.cards[session.playerId] : undefined;
  const modeInfo = GAME_MODE_CATALOG.bowling.find((mode) => mode.id === state.mode);

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
        const snapshot = snapshotRef.current as BowlingSnapshot | null;
        const live = snapshot && 'pins' in snapshot ? snapshot : null;
        drawLane(
          ctx,
          canvas,
          live?.ball ?? state.ball,
          live?.pins ?? state.pins,
          isMyTurn ? aim : null,
          isMyTurn ? spin : 0,
        );
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [state.ball, state.pins, snapshotRef, aim, spin, isMyTurn]);

  const roll = () => {
    if (!isMyTurn) return;
    sendAction({ type: 'bowling:roll', aim, power, spin });
  };

  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="game-hud text-sm">
          <span className="hud-stat">
            <span className="hud-stat-label">Formato</span>
            <span className="hud-stat-value">{modeInfo?.name ?? state.mode}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Frame</span>
            <span className="hud-stat-value">
              {Math.min((myCard?.currentFrame ?? 0) + 1, state.totalFrames)}/{state.totalFrames}
            </span>
          </span>
          {state.phase === 'aiming' && (
            <span className="hud-stat ml-auto">
              <span className="hud-stat-label">Tiempo</span>
              <span className="hud-stat-value tabular-nums">{seconds}s</span>
            </span>
          )}
        </div>

        <div className="game-board-frame bowling-lane-frame">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="w-full bg-black"
            aria-label="Pista de bolos"
          />
          {state.lastEvent && (
            <div className={'bowling-result is-' + state.lastEvent}>
              <span className="bowling-result-label">Último lanzamiento</span>
              <strong>
                {state.lastEvent === 'strike'
                  ? 'STRIKE'
                  : state.lastEvent === 'spare'
                    ? 'SPARE'
                    : state.lastEvent === 'gutter'
                      ? 'CANALETA'
                      : state.lastKnocked + ' BOLOS'}
              </strong>
            </div>
          )}
        </div>

        <div className="bowling-console">
          <p className="mb-3 text-sm font-semibold text-white">
            {isMyTurn
              ? 'Tu turno: ajusta y lanza'
              : state.phase === 'rolling'
                ? 'Bola en movimiento...'
                : 'Turno de ' + (activePlayer?.name ?? '...')}
          </p>

          <label className="label" htmlFor="bowling-aim">
            Direccion
          </label>
          <input
            id="bowling-aim"
            type="range"
            min={-1}
            max={1}
            step={0.02}
            value={aim}
            disabled={!isMyTurn}
            onChange={(event) => setAim(Number(event.target.value))}
            className="h-11 w-full accent-[color:var(--accent-blue)]"
          />

          <label className="label mt-2" htmlFor="bowling-spin">
            Efecto
          </label>
          <input
            id="bowling-spin"
            type="range"
            min={-1}
            max={1}
            step={0.02}
            value={spin}
            disabled={!isMyTurn}
            onChange={(event) => setSpin(Number(event.target.value))}
            className="h-11 w-full accent-[color:var(--accent-red)]"
          />

          <label className="label mt-2" htmlFor="bowling-power">
            Potencia: {Math.round(power * 100)}%
          </label>
          <input
            id="bowling-power"
            type="range"
            min={0.15}
            max={1}
            step={0.01}
            value={power}
            disabled={!isMyTurn}
            onChange={(event) => setPower(Number(event.target.value))}
            className="h-11 w-full accent-white"
          />

          <button className="btn-primary mt-3 min-h-11 w-full" onClick={roll} disabled={!isMyTurn}>
            Lanzar bola
          </button>
        </div>
      </div>

      <Panel title="Tarjetas">
        <div className="space-y-3">
          {state.order.map((playerId) => {
            const player = room?.players.find((entry) => entry.id === playerId);
            const card = state.cards[playerId];
            if (!player || !card) return null;
            const active = playerId === state.activePlayerId;
            return (
              <div
                key={playerId}
                className={
                  'rounded-xl border p-3 transition ' +
                  (active
                    ? 'border-[color:var(--accent-red)] bg-[color:var(--accent-red)]/10'
                    : 'border-white/5 bg-white/[0.03]')
                }
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                    {player.name}
                    {state.teams[playerId] && (
                      <span className="chip px-2 py-0 text-[10px] uppercase">
                        {state.teams[playerId]}
                      </span>
                    )}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums text-white">
                    {card.total}
                  </span>
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {card.frames.map((frame, index) => (
                    <div
                      key={index}
                      className="min-w-[38px] rounded border border-white/10 bg-black/50 px-1 py-0.5 text-center"
                    >
                      <div className="flex justify-center gap-0.5 text-[10px] text-slate-300">
                        {frame.strike ? (
                          <span>X</span>
                        ) : frame.spare ? (
                          <>
                            <span>{frame.rolls[0]}</span>
                            <span>/</span>
                          </>
                        ) : (
                          frame.rolls.map((roll, rollIndex) => <span key={rollIndex}>{roll}</span>)
                        )}
                      </div>
                      <div className="text-[11px] font-semibold tabular-nums text-white">
                        {frame.score ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Un strike suma diez más los dos lanzamientos siguientes; un spare, diez más el siguiente.
        </p>
      </Panel>
    </div>
  );
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  ball: BowlingPublicState['ball'],
  pins: BowlingPublicState['pins'],
  aim: number | null,
  spin: number,
): void {
  const scaleX = canvas.width / BOWLING_LANE.width;
  const scaleY = canvas.height / (BOWLING_LANE.length + 120);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const room = ctx.createLinearGradient(0, 0, 0, canvas.height);
  room.addColorStop(0, '#070a11');
  room.addColorStop(0.55, '#10131b');
  room.addColorStop(1, '#05070b');
  ctx.fillStyle = room;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // La pista se dibuja con el fondo abajo: el jugador lanza desde la parte inferior.
  const toY = (y: number) => canvas.height - (y + 60) * scaleY;

  // Luz del pin deck.
  const laneGlow = ctx.createLinearGradient(0, 0, 0, canvas.height);
  laneGlow.addColorStop(0, '#f3d293');
  laneGlow.addColorStop(0.38, '#d7a85d');
  laneGlow.addColorStop(1, '#9c6231');
  ctx.shadowColor = 'rgba(245, 201, 126, 0.35)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = laneGlow;
  ctx.fillRect(
    BOWLING_LANE.gutterWidth * scaleX,
    toY(BOWLING_LANE.length + 40),
    (BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2) * scaleX,
    (BOWLING_LANE.length + 100) * scaleY,
  );
  ctx.shadowBlur = 0;

  const gutter = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gutter.addColorStop(0, '#030509');
  gutter.addColorStop(0.5, '#161a22');
  gutter.addColorStop(1, '#030509');
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, BOWLING_LANE.gutterWidth * scaleX, canvas.height);
  ctx.fillRect(
    canvas.width - BOWLING_LANE.gutterWidth * scaleX,
    0,
    BOWLING_LANE.gutterWidth * scaleX,
    canvas.height,
  );

  // Lamas de madera y reflejos longitudinales.
  ctx.strokeStyle = 'rgba(77, 42, 20, 0.28)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 15; i++) {
    const x =
      BOWLING_LANE.gutterWidth * scaleX +
      ((BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2) / 15) * i * scaleX;
    ctx.beginPath();
    ctx.moveTo(x, toY(BOWLING_LANE.length));
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Línea de falta, marcas de objetivo y puntos de salida.
  const foulY = toY(80);
  ctx.fillStyle = 'rgba(225, 29, 46, 0.9)';
  ctx.fillRect(BOWLING_LANE.gutterWidth * scaleX, foulY, (BOWLING_LANE.width - 24) * scaleX, 2);
  ctx.fillStyle = 'rgba(42, 52, 64, 0.72)';
  for (let i = -2; i <= 2; i++) {
    const x = (BOWLING_LANE.width / 2 + i * 12) * scaleX;
    const y = toY(520);
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - 3.5, y + 3);
    ctx.lineTo(x + 3.5, y + 3);
    ctx.closePath();
    ctx.fill();
  }

  if (aim !== null) {
    const usable = BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2;
    const startX = (BOWLING_LANE.width / 2 + aim * (usable / 2 - BOWLING_LANE.ballRadius)) * scaleX;
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.6)';
    ctx.shadowBlur = 8;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, canvas.height - 20);
    ctx.quadraticCurveTo(
      startX + spin * 90,
      canvas.height * 0.45,
      startX + spin * 150,
      toY(BOWLING_LANE.length),
    );
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  for (const pin of pins) {
    if (!pin.standing) continue;
    const px = pin.x * scaleX;
    const py = toY(pin.y);
    const radius = Math.max(3.4, BOWLING_LANE.pinRadius * scaleX);
    ctx.beginPath();
    ctx.ellipse(px + 1, py + radius * 0.72, radius * 0.95, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    const pinGradient = ctx.createRadialGradient(
      px - radius * 0.35,
      py - radius * 0.5,
      radius * 0.2,
      px,
      py,
      radius * 1.35,
    );
    pinGradient.addColorStop(0, '#ffffff');
    pinGradient.addColorStop(0.58, '#e8edf4');
    pinGradient.addColorStop(1, '#9ba7b8');
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = pinGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py - radius * 0.1, radius * 0.73, 0.15, Math.PI - 0.15);
    ctx.strokeStyle = '#e11d2e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const ballX = ball.x * scaleX;
  const ballY = toY(ball.y);
  const ballRadius = Math.max(4.5, BOWLING_LANE.ballRadius * scaleX);
  ctx.beginPath();
  ctx.ellipse(ballX + 2, ballY + ballRadius * 0.8, ballRadius, ballRadius * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  const ballGradient = ctx.createRadialGradient(
    ballX - ballRadius * 0.4,
    ballY - ballRadius * 0.45,
    1,
    ballX,
    ballY,
    ballRadius,
  );
  ballGradient.addColorStop(0, ball.gutter ? '#94a3b8' : '#67e8f9');
  ballGradient.addColorStop(0.35, ball.gutter ? '#475569' : '#1d5ae1');
  ballGradient.addColorStop(1, '#090d18');
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = ballGradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.62)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(3, 7, 18, 0.8)';
  for (const [dx, dy] of [
    [-0.22, -0.18],
    [0.18, -0.28],
    [0.05, 0.08],
  ]) {
    ctx.beginPath();
    ctx.arc(ballX + dx * ballRadius, ballY + dy * ballRadius, ballRadius * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
}
