import {
  ARENA,
  ARENA_PICKUP_META,
  GAME_MODE_CATALOG,
  clamp,
  type ArenaPublicState,
  type ArenaSnapshot,
} from '@arcade/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { syncCanvasResolution } from '../lib/canvas.js';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';
import { draw, interpolate } from './arena-render.js';

const VIEW = 720;

interface Intent {
  moveX: number;
  moveY: number;
  facing: number;
  attack: boolean;
}

export default function ArenaView({ state }: { state: ArenaPublicState }) {
  const { sendAction, session, room, snapshotRef } = useApp();
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
      window.removeEventListener('blur-sm', onBlur);
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
        // El buffer se ajusta a la densidad de pantalla en cada fotograma: es
        // idempotente y cubre el caso de arrastrar la ventana a otro monitor.
        const view = syncCanvasResolution(canvas, ctx, VIEW, VIEW);
        const snapshot = snapshotRef.current as ArenaSnapshot | null;
        const live = snapshot && 'fighters' in snapshot && 'zone' in snapshot ? snapshot : null;
        const fighters = live?.fighters ?? state.fighters;
        interpolate(renderRef.current, fighters, dt);
        draw(
          ctx,
          view,
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
            <div className="absolute inset-1.5 z-4 flex items-center justify-center rounded-[0.95rem] bg-black/70 backdrop-blur-xs">
              <div className="game-countdown">
                <span className="game-countdown-label">Despliegue</span>
                <span className="game-countdown-value">
                  {Math.max(1, Math.ceil(state.countdownMs / 1000))}
                </span>
              </div>
            </div>
          )}

          {spectating && (
            <div className="game-overlay absolute left-1/2 top-4 z-4 -translate-x-1/2 px-4 py-2 text-sm text-white">
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
                      ? 'border-white/10 bg-white/3'
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
