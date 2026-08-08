import {
  GAME_MODE_CATALOG,
  TANK_FIELD,
  TANK_MAPS,
  type PublicPlayer,
  type TankObstacle,
  type TankState,
  type TanksPublicState,
} from '@arcade/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PlayerIconGlyph } from '../components/ui.js';
import { useMatch, useRoom } from '../store.js';

export default function TanksView({ state }: { state: TanksPublicState }) {
  const { room, session } = useRoom();
  const { sendAction } = useMatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [angleDeg, setAngleDeg] = useState(45);
  const [power, setPower] = useState(68);
  const [, setClock] = useState(0);
  const meId = session?.playerId ?? '';
  const myTank = state.tanks.find((tank) => tank.playerId === meId);
  const activePlayer = room?.players.find((player) => player.id === state.activePlayerId);
  const isMyTurn =
    state.phase === 'aiming' && state.activePlayerId === meId && Boolean(myTank?.alive);
  const modeInfo = GAME_MODE_CATALOG.tanks.find((mode) => mode.id === state.mode);
  const mapInfo = TANK_MAPS.find((map) => map.id === state.map);
  const secondsLeft = state.deadline
    ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000))
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
      if (!isMyTurn || event.repeat) return;
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fire, isMyTurn, move]);

  useEffect(() => {
    let frame = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        drawBattlefield(
          ctx,
          state,
          room?.players ?? [],
          meId,
          isMyTurn && myTank ? { tank: myTank, angleDeg, power } : null,
        );
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [angleDeg, isMyTurn, meId, myTank, power, room?.players, state]);

  const sortedTanks = useMemo(
    () =>
      state.tanks.slice().sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health),
    [state.tanks],
  );

  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_310px]">
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

        <div className="game-board-frame relative overflow-hidden">
          <canvas
            ref={canvasRef}
            width={TANK_FIELD.width}
            height={TANK_FIELD.height}
            className="w-full touch-none bg-black"
            aria-label="Campo de batalla de Tanques"
          />
          {state.phase === 'countdown' && (
            <div className="absolute inset-1.5 z-[4] flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-sm">
              <div className="game-countdown">
                <span className="game-countdown-label">Sistemas armados</span>
                <span className="game-countdown-value">
                  {Math.max(1, Math.ceil(state.countdownMs / 1000))}
                </span>
              </div>
            </div>
          )}
          {state.phase === 'resolving' && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
              Analizando impacto
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
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
            A/D mueve · W/S ajusta el ángulo · Espacio dispara. La línea discontinua es una
            estimación: el viento puede desviarla.
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
        (active ? 'border-white/25 bg-white/[0.08]' : 'border-white/[0.06] bg-white/[0.025]') +
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

function drawBattlefield(
  ctx: CanvasRenderingContext2D,
  state: TanksPublicState,
  players: PublicPlayer[],
  meId: string,
  preview: { tank: TankState; angleDeg: number; power: number } | null,
) {
  const { width, height, groundY } = TANK_FIELD;
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  if (state.map === 'crater-lunar') {
    sky.addColorStop(0, '#060814');
    sky.addColorStop(0.7, '#11162a');
    sky.addColorStop(1, '#171727');
  } else if (state.map === 'fortaleza-neon') {
    sky.addColorStop(0, '#090713');
    sky.addColorStop(0.7, '#161126');
    sky.addColorStop(1, '#251324');
  } else {
    sky.addColorStop(0, '#10070a');
    sky.addColorStop(0.7, '#281014');
    sky.addColorStop(1, '#32170f');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  drawStars(ctx, state.map);
  drawWind(ctx, state.wind);

  ctx.fillStyle =
    state.map === 'crater-lunar'
      ? '#292b3b'
      : state.map === 'fortaleza-neon'
        ? '#25192b'
        : '#351a16';
  ctx.fillRect(0, groundY, width, height - groundY);
  ctx.strokeStyle = state.map === 'fortaleza-neon' ? 'rgba(244,63,94,.36)' : 'rgba(248,113,113,.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.stroke();
  for (let x = 0; x < width; x += 44) {
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    ctx.fillRect(x, groundY + 18 + ((x / 44) % 2) * 13, 28, 3);
  }

  for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.map);
  if (preview) drawTrajectory(ctx, preview, state.wind, state.obstacles);
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
    );
  }
  if (state.projectile) {
    ctx.strokeStyle = 'rgba(255,190,120,.4)';
    ctx.lineWidth = 4;
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
    ctx.arc(state.projectile.x, state.projectile.y, state.projectile.radius, 0, Math.PI * 2);
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
}

function drawStars(ctx: CanvasRenderingContext2D, map: string) {
  ctx.fillStyle = map === 'crater-lunar' ? 'rgba(210,225,255,.5)' : 'rgba(255,170,150,.18)';
  for (let index = 0; index < 40; index += 1) {
    const x = (index * 83 + 29) % TANK_FIELD.width;
    const y = (index * 47 + 21) % 320;
    ctx.fillRect(x, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
  }
}

function drawWind(ctx: CanvasRenderingContext2D, wind: number) {
  if (Math.abs(wind) < 0.08) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 4; row += 1) {
    const y = 110 + row * 68;
    const start = wind > 0 ? 80 : 920;
    const end = start + wind * 110;
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(end, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: TankObstacle, map: string) {
  const gradient = ctx.createLinearGradient(
    obstacle.x,
    obstacle.y,
    obstacle.x + obstacle.width,
    obstacle.y + obstacle.height,
  );
  gradient.addColorStop(
    0,
    map === 'crater-lunar' ? '#43465a' : map === 'fortaleza-neon' ? '#34213f' : '#54251d',
  );
  gradient.addColorStop(1, '#15101a');
  ctx.fillStyle = gradient;
  ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 3;
  ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  ctx.fillStyle = 'rgba(239,68,68,.22)';
  ctx.fillRect(obstacle.x + 8, obstacle.y + 12, obstacle.width - 16, 5);
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  tank: TankState,
  player: PublicPlayer | undefined,
  me: boolean,
  active: boolean,
  angle: number,
  maxHealth: number,
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
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.fillRect(tank.x - 32, tank.y - 50, 64, 7);
  ctx.fillStyle = tank.health > 35 ? color : '#ef4444';
  ctx.fillRect(tank.x - 32, tank.y - 50, 64 * (tank.health / maxHealth), 7);
  ctx.fillStyle = '#fff';
  ctx.font = '700 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(player?.name ?? 'Jugador', tank.x, tank.y - 58);
  ctx.restore();
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  preview: { tank: TankState; angleDeg: number; power: number },
  wind: number,
  obstacles: TankObstacle[],
) {
  const angle = (-preview.angleDeg * Math.PI) / 180;
  const speed = 370 + (preview.power / 100) * 420;
  let x = preview.tank.x + Math.cos(angle) * 42;
  let y = preview.tank.y - 9 + Math.sin(angle) * 42;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  ctx.fillStyle = 'rgba(255,255,255,.34)';
  for (let step = 0; step < 115; step += 1) {
    vx += wind * 58 * 0.035;
    vy += 350 * 0.035;
    x += vx * 0.035;
    y += vy * 0.035;
    if (x < 0 || x > TANK_FIELD.width || y >= TANK_FIELD.groundY) break;
    if (
      obstacles.some(
        (obstacle) =>
          x >= obstacle.x &&
          x <= obstacle.x + obstacle.width &&
          y >= obstacle.y &&
          y <= obstacle.y + obstacle.height,
      )
    )
      break;
    if (step % 4 === 0) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
