import {
  GAME_MODE_CATALOG,
  SPORT_FIELD,
  TEAM_META,
  type ArcadeSportPaddle,
  type ArcadeSportPublicState,
  type ArcadeSportSnapshot,
  type PublicPlayer,
  type TeamId,
  clamp,
} from '@arcade/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PlayerIconGlyph } from '../components/ui.js';
import { syncCanvasResolution } from '../lib/canvas.js';
import { useApp } from '../store.js';

interface RenderState {
  ball: { x: number; y: number };
  paddles: Map<string, { x: number; y: number }>;
}

export default function ArcadeSportView({ state }: { state: ArcadeSportPublicState }) {
  const { room, session, sendAction, snapshotRef } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const targetRef = useRef({ x: 0.5, y: 0.5 });
  const lastSentRef = useRef({ x: -1, y: -1 });
  const lastPublishAtRef = useRef(0);
  const pendingPublishRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const renderRef = useRef<RenderState>({
    ball: { x: state.ball.x, y: state.ball.y },
    paddles: new Map(),
  });
  const [, uiTick] = useState(0);
  const meId = session?.playerId ?? '';
  const myPaddle = state.paddles.find((paddle) => paddle.playerId === meId);
  const myTeam = myPaddle?.team;
  const modeInfo = GAME_MODE_CATALOG[state.game].find((mode) => mode.id === state.mode);

  useEffect(() => {
    initializedRef.current = false;
    lastSentRef.current = { x: -1, y: -1 };
  }, [state.game]);

  useEffect(() => {
    if (!myPaddle || initializedRef.current) return;
    targetRef.current = {
      x: normalizedSideX(myPaddle.x, myPaddle.team),
      y: myPaddle.y / SPORT_FIELD.height,
    };
    initializedRef.current = true;
  }, [myPaddle]);

  const publish = useCallback(() => {
    if (state.phase !== 'playing') return;
    const emitCurrent = () => {
      const target = targetRef.current;
      const last = lastSentRef.current;
      if (Math.abs(target.x - last.x) < 0.004 && Math.abs(target.y - last.y) < 0.004) return;
      lastSentRef.current = { ...target };
      lastPublishAtRef.current = performance.now();
      sendAction({ type: 'sport:input', game: state.game, x: target.x, y: target.y });
    };
    // Mantiene margen bajo el límite global de 60 acciones cada cinco segundos.
    const waitMs = 110 - (performance.now() - lastPublishAtRef.current);
    if (waitMs > 0) {
      if (pendingPublishRef.current === null) {
        pendingPublishRef.current = window.setTimeout(() => {
          pendingPublishRef.current = null;
          emitCurrent();
        }, waitMs);
      }
      return;
    }
    emitCurrent();
  }, [sendAction, state.game, state.phase]);

  useEffect(
    () => () => {
      if (pendingPublishRef.current !== null) window.clearTimeout(pendingPublishRef.current);
    },
    [state.game, state.phase],
  );

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
    };
    const onDown = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      event.preventDefault();
      keysRef.current.add(action);
    };
    const onUp = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      keysRef.current.delete(action);
    };
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);

    let frame = 0;
    let last = performance.now();
    let sendAccumulator = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      if (dx || dy) {
        targetRef.current.x = clamp(targetRef.current.x + dx * dt * 0.72, 0, 1);
        targetRef.current.y = clamp(targetRef.current.y + dy * dt * 0.92, 0, 1);
        sendAccumulator += dt;
        if (sendAccumulator >= 0.115) {
          sendAccumulator = 0;
          publish();
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [publish]);

  useEffect(() => {
    const id = setInterval(() => uiTick((tick) => tick + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        // El buffer se ajusta a la densidad de pantalla en cada fotograma: es
        // idempotente y cubre el caso de arrastrar la ventana a otro monitor.
        syncCanvasResolution(canvas, ctx, SPORT_FIELD.width, SPORT_FIELD.height);
        const possible = snapshotRef.current;
        const live = possible && 'paddles' in possible ? (possible as ArcadeSportSnapshot) : null;
        const snapshot = live?.teams ? live : state;
        smooth(renderRef.current, snapshot);
        drawBoard(ctx, state.game, snapshot, renderRef.current, room?.players ?? [], meId);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [meId, room?.players, snapshotRef, state]);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!myTeam || state.phase !== 'playing') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fieldX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const fieldY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    targetRef.current = {
      x: myTeam === 'rojo' ? clamp(fieldX * 2, 0, 1) : clamp((fieldX - 0.5) * 2, 0, 1),
      y: fieldY,
    };
    publish();
  };

  const redPlayers = teamPlayers(room?.players ?? [], state.teams, 'rojo');
  const bluePlayers = teamPlayers(room?.players ?? [], state.teams, 'azul');
  const serving = state.phase === 'playing' && state.serveMs > 0;

  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="game-hud justify-center text-sm">
          <TeamScore team="rojo" value={state.scores.rojo} />
          <span className="rounded-xl border border-white/10 bg-black/35 px-4 py-2 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {modeInfo?.name ?? state.mode} · a {state.targetScore}
            </span>
            <span className="font-display text-2xl font-black text-white">VS</span>
          </span>
          <TeamScore team="azul" value={state.scores.azul} />
        </div>

        <div className="game-board-frame relative overflow-hidden">
          <canvas
            ref={canvasRef}
            width={SPORT_FIELD.width}
            height={SPORT_FIELD.height}
            className="w-full touch-none bg-black"
            aria-label={state.game === 'air-hockey' ? 'Mesa de Air Hockey' : 'Mesa de tenis'}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointAt(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons > 0 || event.pointerType === 'touch') pointAt(event);
            }}
          />
          {state.phase === 'countdown' && (
            <div className="absolute inset-1.5 z-[4] flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-sm">
              <div className="game-countdown">
                <span className="game-countdown-label">Preparados</span>
                <span className="game-countdown-value">
                  {Math.max(1, Math.ceil(state.countdownMs / 1000))}
                </span>
              </div>
            </div>
          )}
          {serving && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
              Nuevo saque
            </div>
          )}
        </div>

        <p className="text-center text-xs leading-5 text-slate-400">
          Arrastra sobre tu mitad o usa WASD / flechas. El servidor limita tu pala a tu campo y
          valida cada rebote y cada punto.
        </p>
      </div>

      <div className="space-y-4">
        <TeamPanel team="rojo" players={redPlayers} meId={meId} />
        <TeamPanel team="azul" players={bluePlayers} meId={meId} />
        <Panel title="Regla activa">
          <p className="text-sm leading-6 text-slate-300">{modeInfo?.rule}</p>
          <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs text-slate-500">
            {state.game === 'air-hockey'
              ? 'Los mazos se mueven libremente por su mitad. La abertura iluminada es la portería.'
              : 'El punto de contacto determina el ángulo. Las devoluciones consecutivas aceleran la pelota.'}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function TeamScore({ team, value }: { team: TeamId; value: number }) {
  return (
    <span
      className="min-w-24 rounded-2xl border px-5 py-2 text-center"
      style={{
        borderColor: TEAM_META[team].color + '66',
        background: TEAM_META[team].color + '16',
      }}
    >
      <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {team}
      </span>
      <span className="font-display text-4xl font-black" style={{ color: TEAM_META[team].color }}>
        {value}
      </span>
    </span>
  );
}

function TeamPanel({
  team,
  players,
  meId,
}: {
  team: TeamId;
  players: PublicPlayer[];
  meId: string;
}) {
  return (
    <Panel title={TEAM_META[team].name}>
      <ul className="space-y-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm"
          >
            <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
            <span className="text-white">{player.name}</span>
            {player.id === meId && <span className="ml-auto text-[10px] text-slate-500">Tú</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function teamPlayers(players: PublicPlayer[], teams: Record<string, TeamId>, team: TeamId) {
  return players.filter((player) => teams[player.id] === team);
}

function smooth(render: RenderState, snapshot: ArcadeSportSnapshot) {
  render.ball.x += (snapshot.ball.x - render.ball.x) * 0.34;
  render.ball.y += (snapshot.ball.y - render.ball.y) * 0.34;
  for (const paddle of snapshot.paddles) {
    const current = render.paddles.get(paddle.playerId) ?? { x: paddle.x, y: paddle.y };
    current.x += (paddle.x - current.x) * 0.38;
    current.y += (paddle.y - current.y) * 0.38;
    render.paddles.set(paddle.playerId, current);
  }
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  game: ArcadeSportPublicState['game'],
  snapshot: ArcadeSportSnapshot,
  render: RenderState,
  players: PublicPlayer[],
  meId: string,
) {
  const { width, height, margin } = SPORT_FIELD;
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  if (game === 'air-hockey') {
    gradient.addColorStop(0, '#061828');
    gradient.addColorStop(0.5, '#07111f');
    gradient.addColorStop(1, '#170910');
  } else {
    gradient.addColorStop(0, '#102344');
    gradient.addColorStop(0.5, '#13203b');
    gradient.addColorStop(1, '#451723');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  for (let x = margin; x <= width - margin; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, height - margin);
    ctx.stroke();
  }
  for (let y = margin; y <= height - margin; y += 50) {
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,.72)';
  ctx.lineWidth = 5;
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
  ctx.beginPath();
  ctx.moveTo(width / 2, margin);
  ctx.lineTo(width / 2, height - margin);
  ctx.stroke();

  if (game === 'air-hockey') drawHockeyMarkings(ctx);
  else drawTennisMarkings(ctx);

  for (const paddle of snapshot.paddles) {
    const position = render.paddles.get(paddle.playerId) ?? paddle;
    const player = players.find((entry) => entry.id === paddle.playerId);
    if (game === 'air-hockey')
      drawHockeyPaddle(ctx, position, paddle, player, paddle.playerId === meId);
    else drawTennisPaddle(ctx, position, paddle, player, paddle.playerId === meId);
  }

  ctx.save();
  ctx.shadowBlur = game === 'air-hockey' ? 24 : 18;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = game === 'air-hockey' ? '#e8faff' : '#fff7ed';
  ctx.beginPath();
  ctx.arc(render.ball.x, render.ball.y, snapshot.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHockeyMarkings(ctx: CanvasRenderingContext2D) {
  const { width, height, margin, goalHalfHeight } = SPORT_FIELD;
  ctx.strokeStyle = 'rgba(34,211,238,.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 92, 0, Math.PI * 2);
  ctx.stroke();
  for (const [x, color] of [
    [margin, TEAM_META.rojo.color],
    [width - margin, TEAM_META.azul.color],
  ] as const) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - goalHalfHeight);
    ctx.lineTo(x, height / 2 + goalHalfHeight);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTennisMarkings(ctx: CanvasRenderingContext2D) {
  const { width, height, margin } = SPORT_FIELD;
  ctx.strokeStyle = 'rgba(255,255,255,.32)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(margin, height / 2);
  ctx.lineTo(width - margin, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHockeyPaddle(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  paddle: ArcadeSportPaddle,
  player: PublicPlayer | undefined,
  mine: boolean,
) {
  const teamColor = TEAM_META[paddle.team].color;
  ctx.save();
  ctx.shadowBlur = mine ? 28 : 14;
  ctx.shadowColor = teamColor;
  ctx.fillStyle = teamColor + 'cc';
  ctx.beginPath();
  ctx.arc(position.x, position.y, SPORT_FIELD.hockeyPaddleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = mine ? 7 : 4;
  ctx.strokeStyle = mine ? '#ffffff' : 'rgba(255,255,255,.5)';
  ctx.stroke();
  ctx.fillStyle = player?.color ?? '#fff';
  ctx.beginPath();
  ctx.arc(position.x, position.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTennisPaddle(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  paddle: ArcadeSportPaddle,
  player: PublicPlayer | undefined,
  mine: boolean,
) {
  const color = player?.color ?? TEAM_META[paddle.team].color;
  const w = SPORT_FIELD.tennisPaddleWidth;
  const h = SPORT_FIELD.tennisPaddleHeight;
  ctx.save();
  ctx.shadowBlur = mine ? 26 : 14;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.fillRect(position.x - w / 2, position.y - h / 2, w, h);
  ctx.strokeStyle = mine ? '#ffffff' : 'rgba(255,255,255,.45)';
  ctx.lineWidth = mine ? 5 : 3;
  ctx.strokeRect(position.x - w / 2, position.y - h / 2, w, h);
  ctx.restore();
}

function normalizedSideX(x: number, team: TeamId): number {
  return team === 'rojo'
    ? clamp(x / (SPORT_FIELD.width / 2), 0, 1)
    : clamp((x - SPORT_FIELD.width / 2) / (SPORT_FIELD.width / 2), 0, 1);
}
