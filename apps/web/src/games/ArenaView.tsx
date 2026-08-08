import {
  ARENA,
  ARENA_OBSTACLES,
  ARENA_PICKUP_META,
  GAME_MODE_CATALOG,
  type ArenaFighterState,
  type ArenaPublicState,
  type ArenaSnapshot,
} from '@arcade/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useRoom } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const VIEW = 720;

interface Intent {
  moveX: number;
  moveY: number;
  facing: number;
  attack: boolean;
}

export default function ArenaView({ state }: { state: ArenaPublicState }) {
  const { session, room } = useRoom();
  const { sendAction, snapshotRef } = useMatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const touchRef = useRef({ moveX: 0, moveY: 0, attack: false });
  const facingRef = useRef(0);
  const lastSentRef = useRef<Intent>({ moveX: 0, moveY: 0, facing: 0, attack: false });
  const renderRef = useRef(new Map<string, { x: number; y: number; facing: number }>());
  const [, uiTick] = useState(0);

  const me = state.fighters.find((fighter) => fighter.playerId === session?.playerId);
  const spectating = Boolean(me && !me.alive);
  const modeInfo = GAME_MODE_CATALOG.arena.find((mode) => mode.id === state.mode);

  /** La intencion se envia solo cuando cambia, igual que en karts. */
  const publish = useCallback(() => {
    const keys = keysRef.current;
    const touch = touchRef.current;
    const moveX = clamp(
      (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) + touch.moveX,
      -1,
      1,
    );
    const moveY = clamp((keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0) + touch.moveY, -1, 1);
    const attack = keys.has('attack') || touch.attack;
    const facing = facingRef.current;

    const last = lastSentRef.current;
    const facingChanged = Math.abs(last.facing - facing) > 0.08;
    if (
      last.moveX === moveX &&
      last.moveY === moveY &&
      last.attack === attack &&
      !facingChanged &&
      !attack
    ) {
      return;
    }
    lastSentRef.current = { moveX, moveY, facing, attack };
    sendAction({ type: 'arena:input', moveX, moveY, facing, attack });
  }, [sendAction]);

  useEffect(() => {
    if (spectating) return;
    const map: Record<string, string> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      Space: 'attack',
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
  }, [publish, spectating]);

  useEffect(() => {
    const id = setInterval(() => uiTick((value) => value + 1), 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const snapshot = snapshotRef.current as ArenaSnapshot | null;
        const live = snapshot && 'fighters' in snapshot && 'zone' in snapshot ? snapshot : null;
        const fighters = live?.fighters ?? state.fighters;
        interpolate(renderRef.current, fighters, dt);
        draw(
          ctx,
          canvas,
          fighters,
          renderRef.current,
          live?.zone ?? state.zone,
          state.pickups.length > 0 ? (live?.pickups ?? state.pickups) : [],
          room?.players ?? [],
          session?.playerId,
        );
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state, snapshotRef, room, session?.playerId]);

  /** El puntero define la direccion del ataque. */
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (spectating) return;
    const canvas = canvasRef.current;
    const mine = session?.playerId ? renderRef.current.get(session.playerId) : undefined;
    if (!canvas || !mine) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ARENA.width;
    const y = ((event.clientY - rect.top) / rect.height) * ARENA.height;
    facingRef.current = Math.atan2(y - mine.y, x - mine.x);
    publish();
  };

  const setTouch = (patch: Partial<typeof touchRef.current>) => {
    touchRef.current = { ...touchRef.current, ...patch };
    publish();
  };

  const secondsLeft = Math.max(0, Math.ceil((ARENA.maxMatchMs - state.matchMs) / 1000));

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-2 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div className="game-hud text-sm">
          <span className="hud-stat">
            <span className="hud-stat-label">Modo</span>
            <span className="hud-stat-value">{modeInfo?.name ?? state.mode}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">En pie</span>
            <span className="hud-stat-value">{state.aliveCount}</span>
          </span>
          <span className="hud-stat">
            <span className="hud-stat-label">Cierre total</span>
            <span className="hud-stat-value tabular-nums">{secondsLeft} s</span>
          </span>
          {me && (
            <span className="hud-stat">
              <span className="hud-stat-label">Protección</span>
              <span className="hud-stat-value">
                {me.health} HP {me.shield > 0 && ' · ' + me.shield + ' escudo'}
              </span>
            </span>
          )}
          {me?.inStorm && (
            <span className="hud-stat ml-auto border-rose-500/40 bg-rose-500/10">
              <span className="hud-stat-label text-rose-300">Alerta</span>
              <span className="hud-stat-value text-rose-200">Fuera de la zona</span>
            </span>
          )}
          {me && me.kills > 0 && (
            <span className="hud-stat">
              <span className="hud-stat-label">Eliminaciones</span>
              <span className="hud-stat-value">{me.kills}</span>
            </span>
          )}
        </div>

        <div className="game-board-frame relative">
          <canvas
            ref={canvasRef}
            width={VIEW}
            height={VIEW}
            onPointerMove={onPointerMove}
            onPointerDown={(event) => {
              onPointerMove(event);
              if (!spectating) setTouch({ attack: true });
            }}
            onPointerUp={() => setTouch({ attack: false })}
            onPointerLeave={() => setTouch({ attack: false })}
            className="w-full touch-none bg-black"
            aria-label="Arena de Battle Royale"
          />

          {state.phase === 'countdown' && (
            <div className="absolute inset-1.5 z-[4] flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-sm">
              <div className="game-countdown">
                <span className="game-countdown-label">Despliegue</span>
                <span className="game-countdown-value">
                  {Math.max(1, Math.ceil(state.countdownMs / 1000))}
                </span>
              </div>
            </div>
          )}

          {spectating && (
            <div className="game-overlay absolute left-1/2 top-4 z-[4] -translate-x-1/2 px-4 py-2 text-sm text-white">
              Eliminado. Sigues la partida como espectador.
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Muévete con WASD o las flechas, apunta con el ratón y ataca con espacio o pulsando la
          arena. La zona se cierra: fuera de ella pierdes vida.
        </p>

        {!spectating && (
          <div className="grid grid-cols-5 gap-2 sm:hidden">
            <TouchPad
              label="Arriba"
              onPress={() => setTouch({ moveY: -1 })}
              onRelease={() => setTouch({ moveY: 0 })}
            >
              &#8593;
            </TouchPad>
            <TouchPad
              label="Abajo"
              onPress={() => setTouch({ moveY: 1 })}
              onRelease={() => setTouch({ moveY: 0 })}
            >
              &#8595;
            </TouchPad>
            <TouchPad
              label="Izquierda"
              onPress={() => setTouch({ moveX: -1 })}
              onRelease={() => setTouch({ moveX: 0 })}
            >
              &#8592;
            </TouchPad>
            <TouchPad
              label="Derecha"
              onPress={() => setTouch({ moveX: 1 })}
              onRelease={() => setTouch({ moveX: 0 })}
            >
              &#8594;
            </TouchPad>
            <TouchPad
              label="Atacar"
              onPress={() => setTouch({ attack: true })}
              onRelease={() => setTouch({ attack: false })}
            >
              Golpe
            </TouchPad>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Combatientes">
          <ul className="space-y-1.5 text-sm">
            {state.fighters.map((fighter) => {
              const player = room?.players.find((entry) => entry.id === fighter.playerId);
              if (!player) return null;
              return (
                <li
                  key={fighter.playerId}
                  className={
                    'rounded-xl border px-3 py-2 ' +
                    (fighter.alive
                      ? 'border-white/10 bg-white/[0.03]'
                      : 'border-white/5 bg-black/40 opacity-60')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <PlayerIconGlyph icon={player.icon} color={player.color} size={14} />
                      <span
                        className={fighter.alive ? 'text-white' : 'text-slate-500 line-through'}
                      >
                        {player.name}
                      </span>
                      {fighter.team && (
                        <span className="chip px-2 py-0 text-[10px] uppercase">{fighter.team}</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">
                      {fighter.kills} elim.
                    </span>
                  </div>
                  {fighter.alive && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: (fighter.health / ARENA.maxHealth) * 100 + '%',
                          background:
                            fighter.health > 50
                              ? 'var(--state-success)'
                              : fighter.health > 25
                                ? 'var(--state-warning)'
                                : 'var(--accent-red)',
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Objetos">
          <ul className="space-y-1 text-xs text-slate-300">
            {Object.entries(ARENA_PICKUP_META).map(([kind, meta]) => (
              <li key={kind} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: meta.color }}
                  aria-hidden="true"
                />
                <span className="text-white">{meta.name}</span>
                <span>{meta.description}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {state.feed.length > 0 && (
          <Panel title="Eliminaciones">
            <ul className="space-y-1 text-xs text-slate-300">
              {state.feed.map((event, index) => {
                const killer = room?.players.find((entry) => entry.id === event.playerId);
                const victim = room?.players.find((entry) => entry.id === event.targetId);
                return (
                  <li key={index}>
                    <span className="text-white">{killer?.name ?? 'Alguien'}</span> elimino a{' '}
                    <span className="text-white">{victim?.name ?? 'alguien'}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function TouchPad({
  label,
  onPress,
  onRelease,
  children,
}: {
  label: string;
  onPress: () => void;
  onRelease: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="min-h-14 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-slate-100"
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

function interpolate(
  store: Map<string, { x: number; y: number; facing: number }>,
  fighters: ArenaFighterState[],
  dt: number,
): void {
  const alpha = 1 - Math.pow(0.002, dt);
  for (const fighter of fighters) {
    const current = store.get(fighter.playerId);
    if (!current) {
      store.set(fighter.playerId, { x: fighter.x, y: fighter.y, facing: fighter.facing });
      continue;
    }
    current.x += (fighter.x - current.x) * alpha;
    current.y += (fighter.y - current.y) * alpha;
    current.facing = fighter.facing;
  }
  for (const id of [...store.keys()]) {
    if (!fighters.some((fighter) => fighter.playerId === id)) store.delete(id);
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fighters: ArenaFighterState[],
  render: Map<string, { x: number; y: number; facing: number }>,
  zone: ArenaPublicState['zone'],
  pickups: ArenaPublicState['pickups'],
  players: { id: string; name: string; color: string }[],
  myId?: string,
): void {
  const scale = canvas.width / ARENA.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  // Tormenta y terreno táctico.
  const storm = ctx.createRadialGradient(
    zone.x,
    zone.y,
    zone.radius * 0.45,
    zone.x,
    zone.y,
    ARENA.width * 0.72,
  );
  storm.addColorStop(0, 'rgba(29, 78, 216, 0.12)');
  storm.addColorStop(0.55, 'rgba(88, 28, 135, 0.35)');
  storm.addColorStop(1, 'rgba(190, 18, 60, 0.5)');
  ctx.fillStyle = storm;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.clip();
  const safeGround = ctx.createRadialGradient(
    zone.x,
    zone.y,
    0,
    zone.x,
    zone.y,
    Math.max(1, zone.radius),
  );
  safeGround.addColorStop(0, '#10242a');
  safeGround.addColorStop(0.7, '#0b171d');
  safeGround.addColorStop(1, '#10151c');
  ctx.fillStyle = safeGround;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  // Retícula del campo, recortada dentro de la zona segura.
  ctx.strokeStyle = 'rgba(103,232,249,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= ARENA.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.shadowColor = 'rgba(96, 165, 250, 0.9)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const obstacle of ARENA_OBSTACLES) {
    ctx.beginPath();
    ctx.ellipse(
      obstacle.x + 5,
      obstacle.y + obstacle.radius * 0.55,
      obstacle.radius,
      obstacle.radius * 0.58,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    const rock = ctx.createRadialGradient(
      obstacle.x - obstacle.radius * 0.35,
      obstacle.y - obstacle.radius * 0.35,
      obstacle.radius * 0.1,
      obstacle.x,
      obstacle.y,
      obstacle.radius,
    );
    rock.addColorStop(0, '#394653');
    rock.addColorStop(0.58, '#1d2833');
    rock.addColorStop(1, '#0b1118');
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      obstacle.x - obstacle.radius * 0.12,
      obstacle.y - obstacle.radius * 0.1,
      obstacle.radius * 0.58,
      0.3,
      Math.PI * 1.45,
    );
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const pickup of pickups) {
    if (!pickup.active) continue;
    const meta = ARENA_PICKUP_META[pickup.kind];
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, ARENA.pickupRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,10,16,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, ARENA.pickupRadius, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      pickup.kind === 'botiquin'
        ? '+'
        : pickup.kind === 'escudo'
          ? 'S'
          : pickup.kind === 'velocidad'
            ? '»'
            : '×',
      pickup.x,
      pickup.y + 0.5,
    );
  }

  for (const fighter of fighters) {
    const view = render.get(fighter.playerId) ?? fighter;
    const player = players.find((entry) => entry.id === fighter.playerId);
    if (!fighter.alive) continue;

    // Cono de ataque del propio jugador, para entender el alcance.
    if (fighter.playerId === myId) {
      const attackReady = fighter.attackCooldownMs <= 0;
      ctx.beginPath();
      ctx.moveTo(view.x, view.y);
      ctx.arc(
        view.x,
        view.y,
        ARENA.attackRange,
        view.facing - ARENA.attackArc,
        view.facing + ARENA.attackArc,
      );
      ctx.closePath();
      ctx.fillStyle = attackReady ? 'rgba(103,232,249,0.13)' : 'rgba(255,255,255,0.045)';
      ctx.fill();
      ctx.strokeStyle = attackReady ? 'rgba(103,232,249,0.3)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(
      view.x + 2,
      view.y + ARENA.playerRadius * 0.7,
      ARENA.playerRadius * 0.95,
      ARENA.playerRadius * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    const fighterFill = ctx.createRadialGradient(
      view.x - ARENA.playerRadius * 0.35,
      view.y - ARENA.playerRadius * 0.45,
      1,
      view.x,
      view.y,
      ARENA.playerRadius * 1.1,
    );
    fighterFill.addColorStop(0, '#ffffff');
    fighterFill.addColorStop(0.25, player?.color ?? '#ffffff');
    fighterFill.addColorStop(1, '#111827');
    ctx.shadowColor = player?.color ?? '#ffffff';
    ctx.shadowBlur = fighter.playerId === myId ? 14 : 6;
    ctx.beginPath();
    ctx.arc(view.x, view.y, ARENA.playerRadius, 0, Math.PI * 2);
    ctx.fillStyle = fighterFill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = fighter.playerId === myId ? 3 : 1.5;
    ctx.strokeStyle = fighter.playerId === myId ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.stroke();

    // Morro que indica hacia donde mira.
    ctx.beginPath();
    ctx.moveTo(view.x, view.y);
    ctx.lineTo(
      view.x + Math.cos(view.facing) * (ARENA.playerRadius + 8),
      view.y + Math.sin(view.facing) * (ARENA.playerRadius + 8),
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (fighter.shield > 0) {
      ctx.shadowColor = 'rgba(96,165,250,0.8)';
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(view.x, view.y, ARENA.playerRadius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(143,182,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Barra de vida sobre el personaje.
    const barWidth = 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(view.x - barWidth / 2, view.y - ARENA.playerRadius - 13, barWidth, 4.5);
    ctx.fillStyle = fighter.health > 40 ? '#34d399' : '#e11d2e';
    ctx.fillRect(
      view.x - barWidth / 2,
      view.y - ARENA.playerRadius - 13,
      (barWidth * fighter.health) / ARENA.maxHealth,
      4.5,
    );
  }

  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
