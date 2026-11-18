import {
  GAME_MODE_CATALOG,
  TANK_FIELD,
  TANK_MAPS,
  type PublicPlayer,
  type TankDecor,
  type TankObstacle,
  type TankState,
  type TanksPublicState,
} from '@arcade/shared';
import {
  TANK_VIEW,
  easeCamera,
  predictShot,
  tankCameraTarget,
  type PredictedShot,
  type TankCameraTarget,
} from './tanks-camera.js';
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PlayerIconGlyph } from '../components/ui.js';
import { syncCanvasResolution } from '../lib/canvas.js';
import { fallBackTo2D, useRenderMode } from '../lib/renderMode.js';
import { Board3D, RenderModeToggle } from '../components/RenderMode.js';

// Three.js solo se descarga si alguien abre la vista 3D.
const TanksBoard3D = lazy(() => import('../three/TanksBoard3D.js'));
import { acceptsGameKeys } from '../lib/game-input.js';
import { useApp } from '../store.js';
import { serverNow } from '../lib/clock.js';

export default function TanksView({ state }: { state: TanksPublicState }) {
  const { room, session, sendAction } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const render3d = useRenderMode();
  const [angleDeg, setAngleDeg] = useState(45);
  const [power, setPower] = useState(68);
  const [overview, setOverview] = useState(false);
  const cameraRef = useRef<TankCameraTarget>({ x: TANK_FIELD.width / 2, zoom: 1 });
  const [, setClock] = useState(0);
  const meId = session?.playerId ?? '';
  const myTank = state.tanks.find((tank) => tank.playerId === meId);
  const activePlayer = room?.players.find((player) => player.id === state.activePlayerId);
  const isMyTurn =
    state.phase === 'aiming' && state.activePlayerId === meId && Boolean(myTank?.alive);
  const modeInfo = GAME_MODE_CATALOG.tanks.find((mode) => mode.id === state.mode);
  const mapInfo = TANK_MAPS.find((map) => map.id === state.map);
  const secondsLeft = state.deadline
    ? Math.max(0, Math.ceil((state.deadline - serverNow()) / 1000))
    : 0;

  useEffect(() => {
    if (!myTank || state.activePlayerId !== meId) return;
    setAngleDeg(Math.round((-myTank.angle * 180) / Math.PI));
    setPower(Math.round(myTank.power * 100));
  }, [meId, myTank?.angle, myTank?.power, state.activePlayerId]);

  useEffect(() => {
    const timer = setInterval(() => setClock((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const fire = useCallback(() => {
    if (!isMyTurn) return;
    sendAction({
      type: 'tanks:fire',
      angle: (-angleDeg * Math.PI) / 180,
      power: power / 100,
    });
  }, [angleDeg, isMyTurn, power, sendAction]);

  const move = useCallback(
    (direction: -1 | 1) => {
      if (!isMyTurn || !myTank?.fuel) return;
      sendAction({ type: 'tanks:move', direction });
    },
    [isMyTurn, myTank?.fuel, sendAction],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isMyTurn || event.repeat || !acceptsGameKeys(event)) return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        move(-1);
      } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault();
        move(1);
      } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setAngleDeg((value) => Math.min(173, value + 2));
      } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setAngleDeg((value) => Math.max(7, value - 2));
      } else if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        fire();
      }
    };
    const onOverviewKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyV' || event.repeat || !acceptsGameKeys(event)) return;
      event.preventDefault();
      setOverview((value) => !value);
    };
    window.addEventListener('keydown', onOverviewKey);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onOverviewKey);
    };
  }, [fire, isMyTurn, move]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const preview = isMyTurn && myTank ? { tank: myTank, angleDeg, power } : null;
        const aim = preview ? predictShot(preview, state.wind, state.obstacles) : null;
        cameraRef.current = easeCamera(
          cameraRef.current,
          tankCameraTarget(state, { overview, meId, aim }),
          dt,
        );
        // El buffer se ajusta a la densidad de pantalla en cada fotograma: es
        // idempotente y cubre el caso de arrastrar la ventana a otro monitor.
        syncCanvasResolution(canvas, ctx, TANK_VIEW.width, TANK_VIEW.height);
        drawBattlefield(
          ctx,
          state,
          room?.players ?? [],
          meId,
          preview,
          aim,
          cameraRef.current,
          now / 1000,
        );
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [angleDeg, isMyTurn, meId, myTank, overview, power, room?.players, state]);

  const sortedTanks = useMemo(
    () =>
      state.tanks.slice().sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health),
    [state.tanks],
  );

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-3">
        <div className="game-hud justify-center">
          <span className="hud-stat">
            <span className="hud-stat-label">Turno</span>
            <strong>{state.turnNumber || '—'}</strong>
          </span>
          <span className="hud-stat min-w-40">
            <span className="hud-stat-label">Artillero</span>
            <strong style={{ color: activePlayer?.color }}>
              {activePlayer?.name ?? 'Preparando'}
            </strong>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Viento</span>
            <strong>{windLabel(state.wind)}</strong>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Tiempo</span>
            <strong>{state.phase === 'aiming' ? secondsLeft + 's' : '—'}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <RenderModeToggle />
          <button
            type="button"
            className="btn-ghost min-h-11 px-3 text-xs"
            aria-pressed={overview}
            onClick={() => setOverview((value) => !value)}
          >
            {overview ? 'Seguir la acción (V)' : 'Ver todo el campo (V)'}
          </button>
        </div>

        <div className="game-board-frame relative overflow-hidden">
          {render3d.mode === '3d' ? (
            <Board3D loading={<div className="aspect-[5/3] w-full bg-black" />}>
              <TanksBoard3D
                state={state}
                players={room?.players ?? []}
                meId={meId}
                preview={isMyTurn && myTank ? { tank: myTank, angleDeg, power } : null}
                overview={overview}
                onGiveUp={fallBackTo2D}
              />
            </Board3D>
          ) : (
            <canvas
              ref={canvasRef}
              width={TANK_VIEW.width}
              height={TANK_VIEW.height}
              className="w-full touch-none bg-black"
              aria-label="Campo de batalla de Tanques"
            />
          )}
          {state.phase === 'countdown' && (
            <div className="absolute inset-1.5 z-4 flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-xs">
              <div className="game-countdown">
                <span className="game-countdown-label">Sistemas armados</span>
                <span className="game-countdown-value">
                  {Math.max(1, Math.ceil(state.countdownMs / 1000))}
                </span>
              </div>
            </div>
          )}
          {state.phase === 'resolving' && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              Analizando impacto
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/2.5 p-3 sm:p-4">
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(150px,1fr)_minmax(150px,1fr)_auto] lg:items-end">
            <div>
              <span className="label">Movimiento · {myTank?.fuel ?? 0} cargas</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-secondary min-w-14"
                  aria-label="Mover tanque a la izquierda"
                  onClick={() => move(-1)}
                  disabled={!isMyTurn || !myTank?.fuel}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn-secondary min-w-14"
                  aria-label="Mover tanque a la derecha"
                  onClick={() => move(1)}
                  disabled={!isMyTurn || !myTank?.fuel}
                >
                  →
                </button>
              </div>
            </div>
            <RangeControl
              label="Ángulo"
              value={angleDeg}
              min={7}
              max={173}
              suffix="°"
              disabled={!isMyTurn}
              onChange={setAngleDeg}
            />
            <RangeControl
              label="Potencia"
              value={power}
              min={20}
              max={100}
              suffix="%"
              disabled={!isMyTurn}
              onChange={setPower}
            />
            <button
              type="button"
              className="btn-primary min-h-12 px-7"
              onClick={fire}
              disabled={!isMyTurn}
            >
              {isMyTurn
                ? 'Disparar'
                : state.phase === 'projectile'
                  ? 'Proyectil en vuelo'
                  : 'Espera'}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            A/D mueve · W/S ajusta el ángulo · Espacio dispara · V enseña todo el campo. Los puntos
            marcan el tiro previsto y el radar de arriba, el campo entero.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Panel
          title="Blindajes"
          subtitle={state.tanks.filter((tank) => tank.alive).length + ' en combate'}
        >
          <ul className="space-y-3">
            {sortedTanks.map((tank) => (
              <TankRow
                key={tank.playerId}
                tank={tank}
                player={room?.players.find((player) => player.id === tank.playerId)}
                active={tank.playerId === state.activePlayerId && state.phase === 'aiming'}
                me={tank.playerId === meId}
                maxHealth={state.mode === 'blitz' ? 70 : 100}
              />
            ))}
          </ul>
        </Panel>
        <Panel title={mapInfo?.name ?? 'Campo de batalla'}>
          <p className="text-sm leading-6 text-slate-300">{mapInfo?.description}</p>
        </Panel>
        <Panel title={modeInfo?.name ?? state.mode}>
          <p className="text-sm leading-6 text-slate-300">{modeInfo?.rule}</p>
          <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-5 text-slate-500">
            El daño disminuye con la distancia al centro de la explosión. Un impacto directo concede
            la mayor bonificación.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="label flex items-center justify-between">
        <span>{label}</span>
        <strong className="text-white">
          {value}
          {suffix}
        </strong>
      </span>
      <input
        className="w-full accent-red-500"
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TankRow({
  tank,
  player,
  active,
  me,
  maxHealth,
}: {
  tank: TankState;
  player: PublicPlayer | undefined;
  active: boolean;
  me: boolean;
  maxHealth: number;
}) {
  const color = player?.color ?? '#94a3b8';
  return (
    <li
      className={
        'rounded-xl border px-3 py-2.5 ' +
        (active ? 'border-white/25 bg-white/8' : 'border-white/6 bg-white/2.5') +
        (!tank.alive ? ' opacity-45' : '')
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <PlayerIconGlyph icon={player?.icon ?? 'circle'} color={color} size={15} />
        <span className="font-semibold text-white">{player?.name ?? 'Jugador'}</span>
        {me && <span className="text-[10px] text-slate-500">Tú</span>}
        <span className="ml-auto text-xs font-bold" style={{ color }}>
          {tank.alive ? tank.health + ' PV' : 'Destruido'}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/50">
        <span
          className="block h-full rounded-full transition-all"
          style={{ width: (tank.health / maxHealth) * 100 + '%', background: color }}
        />
      </div>
      <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-600">
        {tank.kills} bajas · {tank.fuel} combustible
      </p>
    </li>
  );
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.08) return 'Calma';
  const arrows = Math.abs(wind) > 0.66 ? '⇶' : Math.abs(wind) > 0.32 ? '→→' : '→';
  return wind < 0 ? arrows.replaceAll('→', '←').replace('⇶', '⇷') : arrows;
}

interface BattlePalette {
  sky: [string, string, string];
  ridgeFar: string;
  ridgeNear: string;
  soil: string;
  topsoil: string;
  stone: string;
  accent: string;
  stars: boolean;
}

const PALETTES: Record<string, BattlePalette> = {
  'canon-carmesi': {
    sky: ['#1c0b10', '#5a2119', '#c2622e'],
    ridgeFar: '#6b2a1b',
    ridgeNear: '#46190f',
    soil: '#8a4526',
    topsoil: '#c97a43',
    stone: '#7c4a35',
    accent: '#f97316',
    stars: false,
  },
  'fortaleza-neon': {
    sky: ['#07060f', '#1a1030', '#3c1c4c'],
    ridgeFar: '#20163a',
    ridgeNear: '#150f26',
    soil: '#2f2836',
    topsoil: '#5b5163',
    stone: '#6b6577',
    accent: '#22d3ee',
    stars: true,
  },
  'crater-lunar': {
    sky: ['#04060d', '#0e1326', '#1d2442'],
    ridgeFar: '#1d2238',
    ridgeNear: '#141829',
    soil: '#43475a',
    topsoil: '#868b9e',
    stone: '#9097a8',
    accent: '#a5b4fc',
    stars: true,
  },
};

function paletteOf(map: string): BattlePalette {
  return PALETTES[map] ?? PALETTES['canon-carmesi']!;
}

function drawBattlefield(
  ctx: CanvasRenderingContext2D,
  state: TanksPublicState,
  players: PublicPlayer[],
  meId: string,
  preview: { tank: TankState; angleDeg: number; power: number } | null,
  aim: PredictedShot | null,
  camera: TankCameraTarget,
  time: number,
) {
  const { width: viewW, height: viewH } = TANK_VIEW;
  const { groundY } = TANK_FIELD;
  const palette = paletteOf(state.map);
  ctx.clearRect(0, 0, viewW, viewH);

  // Cielo y horizonte en pantalla, con un poco de paralaje.
  const sky = ctx.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(0.62, palette.sky[1]);
  sky.addColorStop(1, palette.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewW, viewH);
  if (palette.stars) drawStars(ctx, camera);
  drawRidges(ctx, camera, palette);
  drawWind(ctx, state.wind, time);

  // Mundo: el suelo se queda a la misma altura de pantalla con cualquier zoom.
  ctx.save();
  ctx.translate(viewW / 2 - camera.x * camera.zoom, groundY - groundY * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);
  const left = camera.x - viewW / 2 / camera.zoom;
  const right = camera.x + viewW / 2 / camera.zoom;
  const bottom = groundY + (viewH - groundY) / camera.zoom + 4;

  drawGround(ctx, state.map, palette, left, right, bottom);
  const map = TANK_MAPS.find((entry) => entry.id === state.map);
  for (const item of map?.decor ?? []) {
    if (item.kind !== 'crater') drawDecor(ctx, item, palette, time);
  }
  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, palette);
  if (aim) drawTrajectory(ctx, aim);
  for (const tank of state.tanks) {
    const player = players.find((entry) => entry.id === tank.playerId);
    const angle =
      preview?.tank.playerId === tank.playerId ? (-preview.angleDeg * Math.PI) / 180 : tank.angle;
    drawTank(
      ctx,
      tank,
      player,
      tank.playerId === meId,
      tank.playerId === state.activePlayerId,
      angle,
      state.mode === 'blitz' ? 70 : 100,
      camera.zoom,
    );
  }
  if (state.projectile) {
    ctx.strokeStyle = 'rgba(255,190,120,.45)';
    ctx.lineWidth = 4 / Math.max(0.6, camera.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    state.projectile.trail.forEach((point, index) =>
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
    );
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#ff6b35';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff5d6';
    ctx.beginPath();
    ctx.arc(
      state.projectile.x,
      state.projectile.y,
      state.projectile.radius / Math.min(1, Math.max(0.6, camera.zoom)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  for (const explosion of state.explosions) {
    const progress = 1 - explosion.ttlMs / 720;
    const radius = explosion.radius * Math.min(1, progress * 2.4);
    const gradient = ctx.createRadialGradient(
      explosion.x,
      explosion.y,
      0,
      explosion.x,
      explosion.y,
      radius,
    );
    gradient.addColorStop(0, `rgba(255,255,220,${1 - progress})`);
    gradient.addColorStop(0.35, `rgba(255,91,35,${0.9 - progress * 0.7})`);
    gradient.addColorStop(1, 'rgba(120,10,10,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Proyectil por encima de la pantalla: flecha con la altura.
  if (state.projectile) {
    const screenY = groundY + (state.projectile.y - groundY) * camera.zoom;
    if (screenY < 46) {
      const screenX = viewW / 2 + (state.projectile.x - camera.x) * camera.zoom;
      ctx.save();
      ctx.fillStyle = '#fff5d6';
      ctx.beginPath();
      ctx.moveTo(screenX, 48);
      ctx.lineTo(screenX - 8, 62);
      ctx.lineTo(screenX + 8, 62);
      ctx.closePath();
      ctx.fill();
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(groundY - state.projectile.y) + ' m', screenX, 76);
      ctx.restore();
    }
  }
  drawRadar(ctx, state, players, camera);
}

/** Radar: el campo entero en una tira, con tanques, proyectil y lo que se ve. */
function drawRadar(
  ctx: CanvasRenderingContext2D,
  state: TanksPublicState,
  players: PublicPlayer[],
  camera: TankCameraTarget,
) {
  const width = 360;
  const height = 30;
  const x0 = (TANK_VIEW.width - width) / 2;
  const y0 = 10;
  const scale = width / TANK_FIELD.width;
  const ground = y0 + height - 7;
  ctx.save();
  ctx.fillStyle = 'rgba(5,7,12,.72)';
  roundRect(ctx, x0 - 6, y0 - 4, width + 12, height + 8, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(x0, ground, width, 1);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  for (const obstacle of state.obstacles) {
    const h = Math.max(2, obstacle.height * 0.07);
    ctx.fillRect(x0 + obstacle.x * scale, ground - h, Math.max(1.5, obstacle.width * scale), h);
  }
  // Tramo visible.
  const half = TANK_VIEW.width / 2 / camera.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.strokeRect(
    x0 + Math.max(0, camera.x - half) * scale,
    y0,
    Math.min(TANK_FIELD.width, half * 2) * scale,
    height - 2,
  );
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const color = players.find((player) => player.id === tank.playerId)?.color ?? '#94a3b8';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + tank.x * scale, ground - 3, tank.playerId === state.activePlayerId ? 4 : 3, 0, 7);
    ctx.fill();
  }
  if (state.projectile) {
    const py = clampNumber(
      ground - (TANK_FIELD.groundY - state.projectile.y) * 0.015,
      y0 + 2,
      ground,
    );
    ctx.fillStyle = '#fff5d6';
    ctx.beginPath();
    ctx.arc(x0 + state.projectile.x * scale, py, 2.2, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, camera: TankCameraTarget) {
  ctx.fillStyle = 'rgba(210,225,255,.5)';
  const shift = camera.x * 0.05;
  for (let index = 0; index < 70; index += 1) {
    const x = (((index * 137 + 29 - shift) % TANK_VIEW.width) + TANK_VIEW.width) % TANK_VIEW.width;
    const y = (index * 47 + 21) % 330;
    ctx.fillRect(x, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
  }
}

/** Dos cordilleras al fondo que se mueven más despacio que el campo. */
function drawRidges(
  ctx: CanvasRenderingContext2D,
  camera: TankCameraTarget,
  palette: BattlePalette,
) {
  const layers = [
    { color: palette.ridgeFar, factor: 0.15, base: 430, amp: 70, seed: 1.3 },
    { color: palette.ridgeNear, factor: 0.35, base: 470, amp: 46, seed: 4.1 },
  ];
  for (const layer of layers) {
    const offset = camera.x * layer.factor;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(0, TANK_VIEW.height);
    for (let x = 0; x <= TANK_VIEW.width; x += 20) {
      const wx = (x + offset) / 90;
      const y =
        layer.base -
        layer.amp * (0.55 + 0.45 * Math.sin(wx + layer.seed)) -
        layer.amp * 0.3 * Math.sin(wx * 2.7 + layer.seed * 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(TANK_VIEW.width, TANK_VIEW.height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWind(ctx: CanvasRenderingContext2D, wind: number, time: number) {
  if (Math.abs(wind) < 0.08) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 2;
  const drift = (time * 120 * wind) % TANK_VIEW.width;
  for (let row = 0; row < 5; row += 1) {
    const y = 110 + row * 60;
    const start = (((row * 213 + drift) % TANK_VIEW.width) + TANK_VIEW.width) % TANK_VIEW.width;
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(start + wind * 90, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  map: string,
  palette: BattlePalette,
  left: number,
  right: number,
  bottom: number,
) {
  const { groundY, width } = TANK_FIELD;
  // Fuera del campo: barranco oscuro a cada lado.
  ctx.fillStyle = '#05060a';
  ctx.fillRect(left - 20, groundY, right - left + 40, bottom - groundY);
  const soil = ctx.createLinearGradient(0, groundY, 0, bottom);
  soil.addColorStop(0, palette.soil);
  soil.addColorStop(1, '#0b0a0e');
  ctx.fillStyle = soil;
  ctx.fillRect(0, groundY, width, bottom - groundY);
  ctx.fillStyle = palette.topsoil;
  ctx.fillRect(0, groundY, width, 6);
  // Cráteres: hundimientos del terreno (no cambian la física).
  const mapInfo = TANK_MAPS.find((entry) => entry.id === map);
  for (const item of mapInfo?.decor ?? []) {
    if (item.kind !== 'crater') continue;
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath();
    ctx.ellipse(item.x, groundY + 3, item.size / 2, 9, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = palette.topsoil;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(item.x - item.size / 2 - 4, groundY + 1, 10, 4, 0, Math.PI, 0);
    ctx.ellipse(item.x + item.size / 2 + 4, groundY + 1, 10, 4, 0, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Grava y marcas de cadenas.
  for (let x = 12; x < width; x += 38) {
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(x, groundY + 16 + ((x / 38) % 3) * 9, 18, 3);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(x + 9, groundY + 34 + ((x / 19) % 2) * 11, 6, 2);
  }
  // Bordes del campo.
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(0, groundY - 40, 3, 40);
  ctx.fillRect(width - 3, groundY - 40, 3, 40);
}

function drawDecor(
  ctx: CanvasRenderingContext2D,
  item: TankDecor,
  palette: BattlePalette,
  time: number,
) {
  const g = TANK_FIELD.groundY;
  ctx.save();
  if (item.kind === 'wire') {
    ctx.strokeStyle = 'rgba(30,30,34,.95)';
    ctx.lineWidth = 3;
    const posts = Math.max(2, Math.round(item.size / 36));
    const step = item.size / posts;
    for (let index = 0; index <= posts; index += 1) {
      const x = item.x - item.size / 2 + index * step;
      ctx.beginPath();
      ctx.moveTo(x, g);
      ctx.lineTo(x, g - 26);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(160,160,170,.6)';
    ctx.lineWidth = 1.2;
    for (const height of [10, 18, 25]) {
      ctx.beginPath();
      for (let x = item.x - item.size / 2; x <= item.x + item.size / 2; x += 6) {
        ctx.lineTo(x, g - height + (Math.round(x / 6) % 2 ? 2 : -2));
      }
      ctx.stroke();
    }
  } else if (item.kind === 'tree') {
    ctx.strokeStyle = '#2b1a12';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(item.x, g);
    ctx.lineTo(item.x + 3, g - item.size * 1.4);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (const [dx, dy, ex, ey] of [
      [2, 0.9, -18, 1.25],
      [3, 1.1, 20, 1.45],
      [1, 0.6, 16, 0.85],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(item.x + dx, g - item.size * dy);
      ctx.lineTo(item.x + ex, g - item.size * ey);
      ctx.stroke();
    }
  } else if (item.kind === 'wreck') {
    // Tanque calcinado: casco, torreta y cañón partido.
    ctx.fillStyle = '#1b1715';
    roundRect(ctx, item.x - item.size / 2, g - 20, item.size, 20, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(item.x - 4, g - 20, item.size * 0.2, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b1715';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(item.x + 4, g - 26);
    ctx.lineTo(item.x + item.size * 0.45, g - 8);
    ctx.stroke();
    // Humo.
    for (let index = 0; index < 3; index += 1) {
      const rise = (time * 18 + index * 22) % 66;
      ctx.fillStyle = `rgba(90,90,96,${0.28 * (1 - rise / 66)})`;
      ctx.beginPath();
      ctx.arc(item.x - 4 + Math.sin(time + index) * 4, g - 30 - rise, 7 + rise * 0.15, 0, 7);
      ctx.fill();
    }
  } else if (item.kind === 'flag') {
    ctx.fillStyle = '#d6d3d1';
    ctx.fillRect(item.x - 1.5, g - 90, 3, 90);
    ctx.fillStyle = palette.accent;
    const wave = Math.sin(time * 3) * 3;
    ctx.beginPath();
    ctx.moveTo(item.x + 1.5, g - 90);
    ctx.lineTo(item.x + item.size + wave, g - 82);
    ctx.lineTo(item.x + 1.5, g - 72);
    ctx.closePath();
    ctx.fill();
  } else if (item.kind === 'post') {
    // Foco de vigilancia con su haz.
    ctx.fillStyle = '#2a2a33';
    ctx.fillRect(item.x - 2, g - 70, 4, 70);
    ctx.fillRect(item.x - 8, g - 76, 16, 8);
    const sweep = Math.sin(time * 0.6 + item.x) * 0.5;
    ctx.fillStyle = 'rgba(165,243,252,.08)';
    ctx.beginPath();
    ctx.moveTo(item.x, g - 72);
    ctx.lineTo(item.x + Math.cos(-1.1 + sweep) * 520 - 40, g - 72 + Math.sin(-1.1 + sweep) * 520);
    ctx.lineTo(item.x + Math.cos(-1.1 + sweep) * 520 + 40, g - 72 + Math.sin(-1.1 + sweep) * 520);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: TankObstacle,
  palette: BattlePalette,
) {
  const { x, y, width: w, height: h } = obstacle;
  ctx.save();
  switch (obstacle.kind) {
    case 'sandbags': {
      // Filas de sacos al tresbolillo que llenan el rectángulo de colisión.
      const rows = Math.max(2, Math.round(h / 12));
      const rowH = h / rows;
      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 ? 0 : 9;
        for (let bx = x - offset; bx < x + w; bx += 18) {
          const left = Math.max(x, bx);
          const right = Math.min(x + w, bx + 18);
          if (right - left < 4) continue;
          ctx.fillStyle = row % 2 ? '#a88a5a' : '#bf9f6a';
          roundRect(ctx, left, y + row * rowH, right - left - 1, rowH - 1, 4);
          ctx.fill();
        }
      }
      break;
    }
    case 'bunker': {
      const gradient = ctx.createLinearGradient(x, y, x, y + h);
      gradient.addColorStop(0, '#6f6f76');
      gradient.addColorStop(1, '#2e2f35');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + 12);
      ctx.quadraticCurveTo(x + w / 2, y - 6, x + w, y + 12);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b0b0e';
      ctx.fillRect(x + w * 0.18, y + h * 0.32, w * 0.64, 7);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      for (let line = y + 26; line < y + h; line += 16) ctx.fillRect(x + 3, line, w - 6, 2);
      break;
    }
    case 'wall': {
      ctx.fillStyle = '#5d5c66';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      for (let line = y + 14; line < y + h; line += 18) ctx.fillRect(x, line, w, 2);
      ctx.strokeStyle = '#3a2a22';
      ctx.lineWidth = 2;
      for (const rx of [x + 7, x + w - 7]) {
        ctx.beginPath();
        ctx.moveTo(rx, y);
        ctx.lineTo(rx - 2, y - 8);
        ctx.stroke();
      }
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y + 6, w, 3);
      break;
    }
    case 'tower': {
      // Torre de vigilancia: patas con travesaños y caseta arriba.
      ctx.strokeStyle = '#3f3a33';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + h);
      ctx.lineTo(x + 8, y + 30);
      ctx.moveTo(x + w - 3, y + h);
      ctx.lineTo(x + w - 8, y + 30);
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let line = y + 50; line < y + h; line += 36) {
        ctx.beginPath();
        ctx.moveTo(x + 5, line);
        ctx.lineTo(x + w - 5, line + 30);
        ctx.moveTo(x + w - 5, line);
        ctx.lineTo(x + 5, line + 30);
        ctx.stroke();
      }
      ctx.fillStyle = '#4a4339';
      ctx.fillRect(x - 6, y + 4, w + 12, 28);
      ctx.fillStyle = '#2d2924';
      ctx.fillRect(x - 10, y, w + 20, 6);
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 4, y + 12, w - 8, 6);
      break;
    }
    case 'ruin': {
      ctx.fillStyle = '#5b5e6c';
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x + w * 0.3, y);
      ctx.lineTo(x + w * 0.5, y + 14);
      ctx.lineTo(x + w * 0.75, y + 4);
      ctx.lineTo(x + w, y + 18);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x + w * 0.3, y + h * 0.35, w * 0.4, h * 0.22);
      break;
    }
    default: {
      // Roca o aguja: piedra con vetas que ocupa todo el rectángulo.
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, palette.stone);
      gradient.addColorStop(1, '#17131a');
      ctx.fillStyle = gradient;
      const r = obstacle.kind === 'rock' ? Math.min(18, w / 3) : 10;
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 2;
      for (let line = y + 18; line < y + h - 6; line += 22) {
        ctx.beginPath();
        ctx.moveTo(x + 6, line);
        ctx.lineTo(x + w * 0.6, line + 6);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  tank: TankState,
  player: PublicPlayer | undefined,
  me: boolean,
  active: boolean,
  angle: number,
  maxHealth: number,
  zoom: number,
) {
  const color = player?.color ?? '#94a3b8';
  ctx.save();
  ctx.globalAlpha = tank.alive ? 1 : 0.32;
  if (me || active) {
    ctx.strokeStyle = me ? '#fff' : color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(tank.x, TANK_FIELD.groundY + 4, 43, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tank.x + Math.cos(angle) * 7, tank.y - 11 + Math.sin(angle) * 7);
  ctx.lineTo(tank.x + Math.cos(angle) * 43, tank.y - 11 + Math.sin(angle) * 43);
  ctx.stroke();
  ctx.fillStyle = '#11131b';
  roundRect(ctx, tank.x - 31, tank.y - 5, 62, 25, 8);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tank.x, tank.y - 9, 15, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#07080d';
  for (let offset = -20; offset <= 20; offset += 20) {
    ctx.beginPath();
    ctx.arc(tank.x + offset, tank.y + 16, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nombre y vida se leen igual con el campo alejado.
  const ui = 1 / Math.max(0.5, zoom);
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.fillRect(tank.x - 32 * ui, tank.y - 50 - 6 * ui, 64 * ui, 7 * ui);
  ctx.fillStyle = tank.health > 35 ? color : '#ef4444';
  ctx.fillRect(tank.x - 32 * ui, tank.y - 50 - 6 * ui, 64 * ui * (tank.health / maxHealth), 7 * ui);
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(12 * ui)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(player?.name ?? 'Jugador', tank.x, tank.y - 58 - 8 * ui);
  ctx.restore();
}

function drawTrajectory(ctx: CanvasRenderingContext2D, aim: PredictedShot) {
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  aim.points.forEach((point, index) => {
    if (index % 4 !== 0) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Punto de caída previsto.
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(aim.end.x, aim.end.y, 9, 0, Math.PI * 2);
  ctx.moveTo(aim.end.x - 14, aim.end.y);
  ctx.lineTo(aim.end.x + 14, aim.end.y);
  ctx.stroke();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
