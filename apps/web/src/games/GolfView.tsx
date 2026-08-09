import type { GolfBallState, GolfPublicState, GolfSnapshot } from '@arcade/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { syncCanvasResolution } from '../lib/canvas.js';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph, Scoreboard } from '../components/ui.js';
import { playAceSound, playHoledSound, playOutSound } from '../lib/sound.js';
import { relativeToPar } from '../lib/format.js';
import { canShootBall, pickLiveBall, shotFromGesture } from './golf-input.js';
import {
  MAX_DRAG,
  drawGolfFrame,
  type Camera,
  type PlayerLook,
  type RenderBall,
} from './golf-render.js';

const VIEW_W = 960;
const VIEW_H = 560;

export default function GolfView({ state }: { state: GolfPublicState }) {
  const { sendAction, session, room, snapshotRef, golfEvents } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderBalls = useRef<Map<string, RenderBall>>(new Map());
  const cameraRef = useRef({ x: state.level.start.x, y: state.level.start.y, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const gestureBallRef = useRef<GolfBallState | null>(null);
  const gestureCameraRef = useRef<Camera | null>(null);
  const seqRef = useRef(0);
  const lastSyncedLevelRef = useRef<number | null>(null);
  const clockRef = useRef({ levelClockMs: 0, receivedAt: performance.now() });
  const [overview, setOverview] = useState(false);
  const [aceBanner, setAceBanner] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const lastEventRef = useRef<string>('');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const liveBallRef = useRef<GolfBallState | null>(null);
  const [, uiTick] = useState(0);
  const myBall = liveBallRef.current ?? pickLiveBall(null, state.balls, session?.playerId) ?? null;
  const myPlayer = room?.players.find((p) => p.id === session?.playerId) ?? null;

  useEffect(() => {
    if (!session?.playerId) return;
    seqRef.current = Math.max(seqRef.current, state.lastSequences[session.playerId] ?? -1);
  }, [session?.playerId, state.lastSequences]);

  // Refresco ligero para que el boton y el cursor reaccionen en decimas, no en
  // segundos: el estado publico del servidor solo llega una vez por segundo.
  useEffect(() => {
    const id = setInterval(() => uiTick((value) => value + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    renderBalls.current = new Map();
    cameraRef.current = { x: state.level.start.x, y: state.level.start.y, zoom: 1 };
    dragRef.current = null;
    gestureBallRef.current = null;
    gestureCameraRef.current = null;
    setDrag(null);
    setHint(null);
    setPendingSeq(null);
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
    if (lastSyncedLevelRef.current === state.levelIndex) return;
    lastSyncedLevelRef.current = state.levelIndex;
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
    const map = new Map<string, PlayerLook>();
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
        liveBallRef.current = pickLiveBall(
          snapshot && 'levelClockMs' in snapshot ? snapshot : null,
          state.balls,
          session?.playerId,
        );

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

        // El buffer se ajusta a la densidad de pantalla en cada fotograma: es
        // idempotente y cubre el caso de arrastrar la ventana a otro monitor.
        const view = syncCanvasResolution(canvas, ctx, VIEW_W, VIEW_H);

        drawGolfFrame(ctx, view, {
          level: state.level,
          balls: [...renderBalls.current.values()],
          camera,
          time: levelTime,
          colorOf,
          myId: session?.playerId,
          aim: dragRef.current && mine ? { ball: mine, drag: dragRef.current } : null,
        });
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

  const pointerToWorld = (event: React.PointerEvent, frozenCamera?: Camera | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = frozenCamera ?? cameraRef.current;
    const px = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    return {
      x: camera.x + (px - VIEW_W / 2) / camera.zoom,
      y: camera.y + (py - VIEW_H / 2) / camera.zoom,
    };
  };

  const canShoot = state.phase === 'playing' && pendingSeq === null && canShootBall(myBall);

  const onPointerDown = (event: React.PointerEvent) => {
    if (
      event.button !== 0 ||
      pendingSeq !== null ||
      !canShootBall(liveBallRef.current) ||
      state.phase !== 'playing'
    )
      return;
    const ball = liveBallRef.current;
    if (!ball) return;
    const camera = { ...cameraRef.current };
    const point = pointerToWorld(event, camera);
    if (!point) return;
    gestureBallRef.current = { ...ball };
    gestureCameraRef.current = camera;
    dragRef.current = point;
    setDrag(point);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const point = pointerToWorld(event, gestureCameraRef.current);
    if (!point) return;
    dragRef.current = point;
    setDrag(point);
  };

  const onPointerUp = () => {
    const point = dragRef.current;
    const ball = gestureBallRef.current;
    dragRef.current = null;
    gestureBallRef.current = null;
    gestureCameraRef.current = null;
    setDrag(null);
    if (!point || !ball || state.phase !== 'playing') return;
    const shot = shotFromGesture(ball, point, MAX_DRAG);
    if (!shot) {
      setHint('Arrastra un poco más para dar potencia al golpe.');
      return;
    }
    setHint('Golpe enviado…');
    const shotSeq = seqRef.current + 1;
    seqRef.current = shotSeq;
    setPendingSeq(shotSeq);
    sendAction({
      type: 'golf:shoot',
      angle: shot.angle,
      power: shot.power,
      seq: shotSeq,
    });
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    gestureBallRef.current = null;
    gestureCameraRef.current = null;
    setDrag(null);
    setHint('El gesto se canceló. Vuelve a arrastrar para lanzar.');
  };

  useEffect(() => {
    if (!session?.playerId || pendingSeq === null) return;
    if ((state.lastSequences[session.playerId] ?? -1) < pendingSeq) return;
    setPendingSeq(null);
    setHint(null);
  }, [pendingSeq, session?.playerId, state.lastSequences]);

  useEffect(() => {
    if (pendingSeq === null) return;
    const timer = setTimeout(() => {
      setPendingSeq(null);
      setHint('El servidor no confirmó el golpe. Inténtalo de nuevo.');
      sendAction({ type: 'golf:sync' });
    }, 4000);
    return () => clearTimeout(timer);
  }, [pendingSeq, sendAction]);

  const power =
    drag && myBall ? Math.min(1, Math.hypot(myBall.x - drag.x, myBall.y - drag.y) / MAX_DRAG) : 0;
  const timeLeft = Math.max(0, Math.ceil(state.timeLeftMs / 1000));
  const level = state.level;

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-3">
        <div className="game-hud text-sm">
          <span className="hud-stat">
            <span className="hud-stat-label">Recorrido</span>
            <span className="hud-stat-value text-neon-lime">
              {level.id}/{state.totalLevels} · {level.name}
            </span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Par</span>
            <span className="hud-stat-value">{level.par}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Golpes</span>
            <span className="hud-stat-value">{myBall?.strokes ?? 0}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Tiempo</span>
            <span
              className={'hud-stat-value tabular-nums ' + (timeLeft <= 10 ? 'text-rose-300' : '')}
            >
              {timeLeft}s
            </span>
          </span>
          <span className="hud-stat ml-auto">
            <span className="hud-stat-label">Dificultad</span>
            <span className="hud-stat-value">{level.difficulty}</span>
          </span>
        </div>

        <div className="game-board-frame relative">
          <div className="golf-course-badge" aria-hidden="true">
            <span>Hoyo {level.id}</span>
            <strong>{level.theme}</strong>
          </div>
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className={'block w-full touch-none ' + (canShoot ? 'cursor-crosshair' : '')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            aria-label={'Nivel de minigolf: ' + level.name}
          />

          {state.phase === 'scoreboard' && (
            <div className="absolute inset-1.5 z-4 flex items-center justify-center rounded-[0.95rem] bg-night-900/85 p-6 backdrop-blur-sm">
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
            <div className="pointer-events-none absolute inset-0 z-4 flex items-center justify-center">
              <div className="game-overlay animate-pop border-neon-amber/60 px-8 py-5 text-center shadow-glow">
                <p className="font-display text-3xl font-black text-neon-amber">HOYO EN UNO</p>
                <p className="mt-1 text-sm text-slate-200">
                  {aceBanner} lo ha clavado al primer golpe
                </p>
              </div>
            </div>
          )}

          {hint && (
            <div className="game-overlay absolute bottom-4 left-1/2 z-4 -translate-x-1/2 px-4 py-2 text-sm text-white">
              {hint}
            </div>
          )}

          {myBall?.outOfBounds && (
            <div className="game-overlay absolute left-1/2 top-6 z-4 -translate-x-1/2 border-rose-500/50 px-4 py-2 text-sm font-semibold text-rose-200">
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
                className="h-full rounded-full bg-linear-to-r from-neon-lime via-neon-amber to-rose-500"
                style={{ width: power * 100 + '%' }}
              />
            </div>
          </div>
          <span className="basis-full rounded-xl border border-white/6 bg-white/2.5 px-3 py-2 text-xs text-slate-500 sm:basis-auto">
            Consejo: {level.hint}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Clasificación provisional">
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
                        ? 'Límite alcanzado'
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
      return 'recibe una penalización.';
    case 'reset':
      return 'ha reiniciado su bola.';
    case 'maxStrokes':
      return 'ha alcanzado el límite de golpes.';
    case 'timeUp':
      return 'se ha quedado sin tiempo.';
    default:
      return kind;
  }
}
