import {
  BOWLING_LANE,
  GAME_MODE_CATALOG,
  type BowlingPublicState,
  type BowlingSnapshot,
} from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const VIEW_W = 360;
const VIEW_H = 620;

export default function BowlingView({ state }: { state: BowlingPublicState }) {
  const { sendAction, session, room, snapshotRef } = useApp();
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
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip font-display">{modeInfo?.name ?? state.mode}</span>
          <span className="chip">
            Frame {Math.min((myCard?.currentFrame ?? 0) + 1, state.totalFrames)}/{state.totalFrames}
          </span>
          {state.phase === 'aiming' && <span className="chip tabular-nums">{seconds}s</span>}
        </div>

        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="w-full rounded-2xl border border-white/10 bg-black"
          aria-label="Pista de bolos"
        />

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
            Lanzar
          </button>

          {state.lastEvent && (
            <p
              className="mt-3 text-center font-display text-lg font-bold"
              style={{
                color:
                  state.lastEvent === 'strike'
                    ? 'var(--accent-red-ink)'
                    : state.lastEvent === 'spare'
                      ? 'var(--accent-blue-ink)'
                      : 'var(--text-secondary)',
              }}
            >
              {state.lastEvent === 'strike'
                ? 'STRIKE'
                : state.lastEvent === 'spare'
                  ? 'SPARE'
                  : state.lastEvent === 'gutter'
                    ? 'CANALETA'
                    : state.lastKnocked + ' bolos'}
            </p>
          )}
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
          Un strike suma diez mas los dos lanzamientos siguientes; un spare, diez mas el siguiente.
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
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // La pista se dibuja con el fondo abajo: el jugador lanza desde la parte inferior.
  const toY = (y: number) => canvas.height - (y + 60) * scaleY;

  ctx.fillStyle = '#1a1206';
  ctx.fillRect(
    BOWLING_LANE.gutterWidth * scaleX,
    toY(BOWLING_LANE.length + 40),
    (BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2) * scaleX,
    (BOWLING_LANE.length + 100) * scaleY,
  );

  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, BOWLING_LANE.gutterWidth * scaleX, canvas.height);
  ctx.fillRect(
    canvas.width - BOWLING_LANE.gutterWidth * scaleX,
    0,
    BOWLING_LANE.gutterWidth * scaleX,
    canvas.height,
  );

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    const x = (BOWLING_LANE.width / 7) * i * scaleX;
    ctx.beginPath();
    ctx.moveTo(x, toY(BOWLING_LANE.length));
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  if (aim !== null) {
    const usable = BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2;
    const startX = (BOWLING_LANE.width / 2 + aim * (usable / 2 - BOWLING_LANE.ballRadius)) * scaleX;
    ctx.strokeStyle = 'rgba(143,182,255,0.75)';
    ctx.lineWidth = 2;
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
    ctx.setLineDash([]);
  }

  for (const pin of pins) {
    if (!pin.standing) continue;
    ctx.beginPath();
    ctx.arc(
      pin.x * scaleX,
      toY(pin.y),
      Math.max(3, BOWLING_LANE.pinRadius * scaleX),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,29,46,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(
    ball.x * scaleX,
    toY(ball.y),
    Math.max(4, BOWLING_LANE.ballRadius * scaleX),
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = ball.gutter ? '#4b5563' : '#1d5ae1';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
