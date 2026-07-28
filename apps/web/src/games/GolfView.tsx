import {
  GOLF,
  GOLF_SURFACE_COLORS,
  motionOffsetPublic,
  type GolfBallState,
  type GolfLevel,
  type GolfPublicState,
  type GolfSnapshot,
} from '@arcade/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph, Scoreboard } from '../components/ui.js';
import { playAceSound, playHoledSound, playOutSound } from '../lib/sound.js';
import { relativeToPar } from '../lib/format.js';

const VIEW_W = 960;
const VIEW_H = 560;
const MAX_DRAG = 170;

interface RenderBall extends GolfBallState {
  rx: number;
  ry: number;
}

export default function GolfView({ state }: { state: GolfPublicState }) {
  const { sendAction, session, room, snapshotRef, golfEvents } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderBalls = useRef<Map<string, RenderBall>>(new Map());
  const cameraRef = useRef({ x: state.level.start.x, y: state.level.start.y, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const seqRef = useRef(0);
  const clockRef = useRef({ levelClockMs: 0, receivedAt: performance.now() });
  const [overview, setOverview] = useState(false);
  const [aceBanner, setAceBanner] = useState<string | null>(null);
  const lastEventRef = useRef<string>('');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const myBall = state.balls.find((ball) => ball.playerId === session?.playerId) ?? null;
  const myPlayer = room?.players.find((p) => p.id === session?.playerId) ?? null;

  useEffect(() => {
    renderBalls.current = new Map();
    cameraRef.current = { x: state.level.start.x, y: state.level.start.y, zoom: 1 };
  }, [state.levelIndex, state.level.start.x, state.level.start.y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'z' || event.key === 'Z') setOverview((prev) => !prev);
      if (event.key === 'r' || event.key === 'R') sendAction({ type: 'golf:reset' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sendAction]);

  useEffect(() => {
    sendAction({ type: 'golf:sync' });
  }, [state.levelIndex, sendAction]);

  // Sonido y animacion de los sucesos destacados (hoyo en uno, embocada, fuera).
  useEffect(() => {
    const latest = golfEvents[0];
    if (!latest) return;
    const key = latest.kind + latest.playerId + latest.atMs + latest.levelId;
    if (lastEventRef.current === key) return;
    lastEventRef.current = key;
    if (latest.kind === 'ace') {
      playAceSound();
      const name = room?.players.find((p) => p.id === latest.playerId)?.name ?? 'Alguien';
      setAceBanner(name);
      const timer = setTimeout(() => setAceBanner(null), 4200);
      return () => clearTimeout(timer);
    }
    if (latest.kind === 'holed') playHoledSound();
    if (latest.kind === 'out') playOutSound();
    return undefined;
  }, [golfEvents, room]);

  const colorOf = useMemo(() => {
    const map = new Map<string, { color: string; icon: string; name: string }>();
    for (const player of room?.players ?? []) {
      map.set(player.id, { color: player.color, icon: player.icon, name: player.name });
    }
    return map;
  }, [room]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const snapshot = snapshotRef.current as GolfSnapshot | null;
        const source =
          snapshot && Array.isArray(snapshot.balls) && 'levelClockMs' in snapshot
            ? snapshot.balls
            : state.balls;
        if (snapshot && 'levelClockMs' in snapshot) {
          clockRef.current = { levelClockMs: snapshot.levelClockMs, receivedAt: time };
        }

        // Interpolacion suave hacia la ultima posicion autoritativa.
        for (const ball of source) {
          const existing = renderBalls.current.get(ball.playerId);
          if (!existing) {
            renderBalls.current.set(ball.playerId, { ...ball, rx: ball.x, ry: ball.y });
            continue;
          }
          const alpha = 1 - Math.pow(0.0008, dt);
          existing.rx += (ball.x - existing.rx) * alpha;
          existing.ry += (ball.y - existing.ry) * alpha;
          Object.assign(existing, ball, { rx: existing.rx, ry: existing.ry });
        }
        for (const id of [...renderBalls.current.keys()]) {
          if (!source.some((ball) => ball.playerId === id)) renderBalls.current.delete(id);
        }

        const mine = session?.playerId ? renderBalls.current.get(session.playerId) : undefined;
        const camera = cameraRef.current;
        const targetZoom = overview
          ? Math.min(VIEW_W / state.level.size.w, VIEW_H / state.level.size.h)
          : 1;
        camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 6);
        const targetX = overview ? state.level.size.w / 2 : (mine?.rx ?? state.level.start.x);
        const targetY = overview ? state.level.size.h / 2 : (mine?.ry ?? state.level.start.y);
        camera.x += (targetX - camera.x) * Math.min(1, dt * 5);
        camera.y += (targetY - camera.y) * Math.min(1, dt * 5);

        const levelTime =
          (clockRef.current.levelClockMs + (time - clockRef.current.receivedAt)) / 1000;

        drawLevel(ctx, canvas, state.level, camera, levelTime);
        drawBalls(
          ctx,
          canvas,
          [...renderBalls.current.values()],
          camera,
          colorOf,
          session?.playerId,
        );
        if (dragRef.current && mine) drawAim(ctx, canvas, camera, mine, dragRef.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [
    state.balls,
    state.level,
    state.levelIndex,
    snapshotRef,
    overview,
    colorOf,
    session?.playerId,
  ]);

  const pointerToWorld = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    const px = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    return {
      x: camera.x + (px - VIEW_W / 2) / camera.zoom,
      y: camera.y + (py - VIEW_H / 2) / camera.zoom,
    };
  };

  const canShoot =
    state.phase === 'playing' &&
    myBall !== null &&
    !myBall.holed &&
    !myBall.finished &&
    !myBall.airborne &&
    !myBall.outOfBounds &&
    Math.hypot(myBall.vx, myBall.vy) <= GOLF.stopSpeed;

  const onPointerDown = (event: React.PointerEvent) => {
    if (!canShoot) return;
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
    if (!point || !canShoot || !myBall) return;
    const dx = myBall.x - point.x;
    const dy = myBall.y - point.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 6) return;
    seqRef.current += 1;
    sendAction({
      type: 'golf:shoot',
      angle: Math.atan2(dy, dx),
      power: Math.max(0.03, Math.min(1, distance / MAX_DRAG)),
      seq: seqRef.current,
    });
  };

  const power =
    drag && myBall ? Math.min(1, Math.hypot(myBall.x - drag.x, myBall.y - drag.y) / MAX_DRAG) : 0;
  const timeLeft = Math.max(0, Math.ceil(state.timeLeftMs / 1000));
  const level = state.level;

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip font-display">
            Hoyo {level.id}/{state.totalLevels}: {level.name}
          </span>
          <span className="chip">{level.difficulty}</span>
          <span className="chip">Par {level.par}</span>
          <span className="chip">Golpes: {myBall?.strokes ?? 0}</span>
          <span className={'chip tabular-nums ' + (timeLeft <= 10 ? 'text-rose-300' : '')}>
            {timeLeft}s
          </span>
          <span className="chip">
            Colisiones: {state.settings.ballCollisions ? 'activadas' : 'desactivadas'}
          </span>
          <span className="chip">Limite: {state.settings.maxStrokes} golpes</span>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className={
              'w-full touch-none rounded-2xl border border-white/10 ' +
              (canShoot ? 'cursor-crosshair' : '')
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={'Nivel de minigolf: ' + level.name}
          />

          {state.phase === 'scoreboard' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-night-900/85 p-6 backdrop-blur">
              <div className="w-full max-w-md">
                <h3 className="mb-3 text-center font-display text-xl font-bold">
                  Hoyo {level.id} completado
                </h3>
                <ul className="mb-4 space-y-1.5 text-sm">
                  {state.holeResults.map((result) => {
                    const player = colorOf.get(result.playerId);
                    return (
                      <li
                        key={result.playerId}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-1.5"
                      >
                        <span>{player?.name ?? 'Jugador'}</span>
                        <span className="tabular-nums">
                          {result.strokes} golpes ({relativeToPar(result.strokes, level.par)})
                          {result.ace && <span className="ml-2 text-neon-amber">HOYO EN UNO</span>}
                          {!result.holed && (
                            <span className="ml-2 text-slate-500">sin embocar</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Scoreboard rows={state.scoreboard} unit="golpes" />
              </div>
            </div>
          )}

          {aceBanner && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="animate-pop rounded-2xl border-2 border-neon-amber bg-night-900/85 px-8 py-5 text-center shadow-glow">
                <p className="font-display text-3xl font-black text-neon-amber">HOYO EN UNO</p>
                <p className="mt-1 text-sm text-slate-200">
                  {aceBanner} lo ha clavado al primer golpe
                </p>
              </div>
            </div>
          )}

          {myBall?.outOfBounds && (
            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-xl bg-rose-500/90 px-4 py-2 text-sm font-semibold">
              Fuera del recorrido. Pulsa Reiniciar (R).
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={() => setOverview((prev) => !prev)}>
            {overview ? 'Seguir mi bola' : 'Ver el nivel (Z)'}
          </button>
          <button
            className="btn-danger"
            onClick={() => sendAction({ type: 'golf:reset' })}
            disabled={state.phase !== 'playing' || !myBall || myBall.holed}
          >
            Reiniciar bola (+1) [R]
          </button>
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <span className="text-xs text-slate-400">Potencia</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-neon-lime via-neon-amber to-rose-500"
                style={{ width: power * 100 + '%' }}
              />
            </div>
          </div>
          <span className="text-xs text-slate-500">{level.hint}</span>
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Clasificacion provisional">
          <Scoreboard rows={state.scoreboard} unit="golpes" />
        </Panel>

        <Panel title="Jugadores">
          <ul className="space-y-1.5 text-sm">
            {state.balls.map((ball) => {
              const player = colorOf.get(ball.playerId);
              return (
                <li
                  key={ball.playerId}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <PlayerIconGlyph
                      icon={(player?.icon ?? 'circle') as never}
                      color={player?.color ?? '#94a3b8'}
                      size={14}
                    />
                    {player?.name ?? 'Jugador'}
                  </span>
                  <span className="text-xs tabular-nums text-slate-400">
                    {ball.holed
                      ? 'Embocada (' + ball.strokes + ')'
                      : ball.finished
                        ? 'Limite alcanzado'
                        : ball.strokes + ' golpes'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Sucesos">
          <ul className="space-y-1 text-xs text-slate-300">
            {golfEvents.length === 0 && <li className="text-slate-500">Sin novedades.</li>}
            {golfEvents.map((event, index) => {
              const player = colorOf.get(event.playerId);
              return (
                <li key={index}>
                  <span style={{ color: player?.color }}>{player?.name ?? 'Jugador'}</span>{' '}
                  {describeEvent(event.kind)}
                </li>
              );
            })}
          </ul>
        </Panel>

        {myPlayer && (
          <p className="text-center text-xs text-slate-500">
            Tu bola: {myPlayer.name} ({myPlayer.icon})
          </p>
        )}
      </div>
    </div>
  );
}

function describeEvent(kind: string): string {
  switch (kind) {
    case 'ace':
      return 'ha hecho HOYO EN UNO!';
    case 'holed':
      return 'ha embocado.';
    case 'out':
      return 'se ha salido del recorrido.';
    case 'penalty':
      return 'recibe una penalizacion.';
    case 'reset':
      return 'ha reiniciado su bola.';
    case 'maxStrokes':
      return 'ha alcanzado el limite de golpes.';
    case 'timeUp':
      return 'se ha quedado sin tiempo.';
    default:
      return kind;
  }
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function applyCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: Camera) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: GolfLevel,
  camera: Camera,
  time: number,
): void {
  applyCamera(ctx, canvas, camera);

  ctx.fillStyle = '#070912';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyCamera(ctx, canvas, camera);

  for (const pad of level.pads) {
    const offset = pad.motion ? motionOffsetPublic(pad.motion, time) : { x: 0, y: 0 };
    ctx.fillStyle = GOLF_SURFACE_COLORS[pad.surface];
    ctx.fillRect(pad.rect.x + offset.x, pad.rect.y + offset.y, pad.rect.w, pad.rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.rect.x + offset.x, pad.rect.y + offset.y, pad.rect.w, pad.rect.h);
  }

  for (const ramp of level.ramps) {
    const gradient = ctx.createLinearGradient(ramp.rect.x, 0, ramp.rect.x + ramp.rect.w, 0);
    gradient.addColorStop(0, 'rgba(168,85,247,0.15)');
    gradient.addColorStop(1, 'rgba(168,85,247,0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(ramp.rect.x, ramp.rect.y, ramp.rect.w, ramp.rect.h);
  }

  for (const checkpoint of level.checkpoints) {
    ctx.strokeStyle = 'rgba(74,222,128,0.5)';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(checkpoint.rect.x, checkpoint.rect.y, checkpoint.rect.w, checkpoint.rect.h);
    ctx.setLineDash([]);
  }

  // Hoyo
  ctx.beginPath();
  ctx.arc(level.hole.x, level.hole.y, GOLF.holeRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#05070d';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(level.hole.x, level.hole.y);
  ctx.lineTo(level.hole.x, level.hole.y - 34);
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(level.hole.x, level.hole.y - 34, 18, 10);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const wall of level.walls) {
    const offset = wall.motion ? motionOffsetPublic(wall.motion, time) : { x: 0, y: 0 };
    ctx.beginPath();
    ctx.moveTo(wall.a.x + offset.x, wall.a.y + offset.y);
    ctx.lineTo(wall.b.x + offset.x, wall.b.y + offset.y);
    ctx.stroke();
  }

  for (const circle of level.circles) {
    ctx.beginPath();
    ctx.arc(circle.pos.x, circle.pos.y, circle.radius, 0, Math.PI * 2);
    ctx.fillStyle = circle.kind === 'bumper' ? '#f472b6' : '#64748b';
    ctx.fill();
  }

  for (const blade of level.blades) {
    ctx.save();
    ctx.translate(blade.center.x, blade.center.y);
    ctx.rotate(blade.phase + blade.angularSpeed * time);
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < blade.arms; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / blade.arms);
      ctx.fillRect(0, -blade.armRadius, blade.armLength, blade.armRadius * 2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, blade.armRadius * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(226,232,240,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, level.size.w, level.size.h);
}

function drawBalls(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  balls: RenderBall[],
  camera: Camera,
  colorOf: Map<string, { color: string; icon: string; name: string }>,
  myId?: string,
): void {
  applyCamera(ctx, canvas, camera);
  for (const ball of balls) {
    if (ball.holed) continue;
    const info = colorOf.get(ball.playerId);
    const isMine = ball.playerId === myId;
    const radius = GOLF.ballRadius * (1 + ball.z / 90);

    if (ball.z > 0.5) {
      ctx.beginPath();
      ctx.arc(ball.rx, ball.ry + ball.z * 0.25, GOLF.ballRadius * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(ball.rx, ball.ry, radius, 0, Math.PI * 2);
    ctx.fillStyle = info?.color ?? '#e2e8f0';
    ctx.globalAlpha = isMine ? 1 : 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = isMine ? 2.5 : 1;
    ctx.strokeStyle = isMine ? '#f8fafc' : 'rgba(248,250,252,0.35)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ball.strokes), ball.rx, ball.ry);

    if (info) {
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.font = '10px sans-serif';
      ctx.fillText(info.name, ball.rx, ball.ry - radius - 8);
    }
  }
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  ball: RenderBall,
  drag: { x: number; y: number },
): void {
  applyCamera(ctx, canvas, camera);
  const dx = ball.rx - drag.x;
  const dy = ball.ry - drag.y;
  const distance = Math.min(MAX_DRAG, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);

  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(34,211,238,0.9)';
  ctx.beginPath();
  ctx.moveTo(ball.rx, ball.ry);
  ctx.lineTo(
    ball.rx + Math.cos(angle) * distance * 1.6,
    ball.ry + Math.sin(angle) * distance * 1.6,
  );
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(248,250,252,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ball.rx, ball.ry);
  ctx.lineTo(drag.x, drag.y);
  ctx.stroke();

  const ratio = distance / MAX_DRAG;
  ctx.beginPath();
  ctx.arc(ball.rx, ball.ry, GOLF.ballRadius + 6, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.strokeStyle = ratio > 0.8 ? '#f43f5e' : ratio > 0.5 ? '#fbbf24' : '#4ade80';
  ctx.lineWidth = 3;
  ctx.stroke();
}
