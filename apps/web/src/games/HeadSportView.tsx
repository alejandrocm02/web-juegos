import {
  GAME_MODE_CATALOG,
  HEAD_SPORT_FIELD,
  TEAM_META,
  type HeadSportPlayer,
  type HeadSportPublicState,
  type HeadSportSnapshot,
  type PublicPlayer,
  type TeamId,
} from '@arcade/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PlayerIconGlyph } from '../components/ui.js';
import { useMatch, useRoom } from '../store.js';

interface RenderState {
  ball: { x: number; y: number; spin: number };
  players: Map<string, { x: number; y: number }>;
}

interface Controls {
  moveX: number;
  jump: boolean;
  kick: boolean;
}

export default function HeadSportView({ state }: { state: HeadSportPublicState }) {
  const { room, session } = useRoom();
  const { sendAction, snapshotRef } = useMatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const controlsRef = useRef<Controls>({ moveX: 0, jump: false, kick: false });
  const renderRef = useRef<RenderState>({
    ball: { x: state.ball.x, y: state.ball.y, spin: state.ball.spin },
    players: new Map(),
  });
  const [, uiTick] = useState(0);
  const meId = session?.playerId ?? '';
  const myPlayer = state.players.find((player) => player.playerId === meId);
  const modeInfo = GAME_MODE_CATALOG[state.game].find((mode) => mode.id === state.mode);

  const publish = useCallback(
    (next: Controls) => {
      controlsRef.current = next;
      if (state.phase !== 'playing') return;
      sendAction({ type: 'head-sport:input', game: state.game, ...next });
    },
    [sendAction, state.game, state.phase],
  );

  const syncKeyboard = useCallback(() => {
    const keys = keysRef.current;
    publish({
      moveX: (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0),
      jump: keys.has('jump'),
      kick: keys.has('kick'),
    });
  }, [publish]);

  useEffect(() => {
    if (state.phase === 'playing') publish(controlsRef.current);
  }, [publish, state.phase]);

  useEffect(() => {
    const map: Record<string, 'left' | 'right' | 'jump' | 'kick'> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'jump',
      KeyW: 'jump',
      Space: 'kick',
      Enter: 'kick',
      KeyK: 'kick',
    };
    const onDown = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      event.preventDefault();
      if (event.repeat || keysRef.current.has(action)) return;
      keysRef.current.add(action);
      syncKeyboard();
    };
    const onUp = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (!action) return;
      event.preventDefault();
      keysRef.current.delete(action);
      syncKeyboard();
    };
    const onBlur = () => {
      keysRef.current.clear();
      publish({ moveX: 0, jump: false, kick: false });
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [publish, syncKeyboard]);

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
        const possible = snapshotRef.current;
        const live = possible && 'players' in possible ? (possible as HeadSportSnapshot) : null;
        const snapshot = live?.teams ? live : state;
        smooth(renderRef.current, snapshot);
        drawArena(ctx, state.game, snapshot, renderRef.current, room?.players ?? [], meId);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [meId, room?.players, snapshotRef, state]);

  const setTouch = (patch: Partial<Controls>) => {
    publish({ ...controlsRef.current, ...patch });
  };
  const redPlayers = teamPlayers(room?.players ?? [], state.teams, 'rojo');
  const bluePlayers = teamPlayers(room?.players ?? [], state.teams, 'azul');
  const resetting = state.phase === 'playing' && state.resetMs > 0;

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
            width={HEAD_SPORT_FIELD.width}
            height={HEAD_SPORT_FIELD.height}
            className="w-full touch-none bg-black"
            aria-label={
              state.game === 'head-soccer' ? 'Campo de Head Soccer' : 'Cancha de Head Basketball'
            }
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
          {resetting && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
              {state.lastScoringTeam ? 'Punto ' + state.lastScoringTeam : 'Saque inicial'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:hidden">
          <div className="grid grid-cols-2 gap-2">
            <ControlButton
              label="Mover izquierda"
              text="←"
              onChange={(active) => setTouch({ moveX: active ? -1 : 0 })}
            />
            <ControlButton
              label="Mover derecha"
              text="→"
              onChange={(active) => setTouch({ moveX: active ? 1 : 0 })}
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
            Controles
          </span>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton
              label="Saltar"
              text="↑"
              onChange={(active) => setTouch({ jump: active })}
            />
            <ControlButton
              label="Rematar"
              text="K"
              onChange={(active) => setTouch({ kick: active })}
            />
          </div>
        </div>

        <p className="text-center text-xs leading-5 text-slate-400">
          Muévete con A/D o flechas, salta con W/↑ y remata con Espacio o K. El servidor valida cada
          contacto y cada punto.
        </p>
      </div>

      <div className="space-y-4">
        <PlayerStatus player={myPlayer} />
        <TeamPanel team="rojo" players={redPlayers} meId={meId} />
        <TeamPanel team="azul" players={bluePlayers} meId={meId} />
        <Panel title="Regla activa">
          <p className="text-sm leading-6 text-slate-300">{modeInfo?.rule}</p>
          <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs text-slate-500">
            {state.game === 'head-soccer'
              ? 'El balón debe cruzar por debajo del larguero. Usa el salto para despejar o rematar de cabeza.'
              : 'La pelota solo cuenta al atravesar el aro de arriba abajo. Cada canasta vale dos puntos.'}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  text,
  onChange,
}: {
  label: string;
  text: string;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="min-h-12 touch-none rounded-xl border border-white/15 bg-white/[0.07] font-display text-lg font-black text-white active:border-neon-cyan active:bg-neon-cyan/20"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
    >
      {text}
    </button>
  );
}

function PlayerStatus({ player }: { player: HeadSportPlayer | undefined }) {
  return (
    <Panel title="Tu jugador">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Remate</span>
        <span
          className={player && player.kickMs <= 0 ? 'font-bold text-neon-lime' : 'text-slate-300'}
        >
          {player && player.kickMs <= 0 ? 'Listo' : 'Recargando'}
        </span>
      </div>
    </Panel>
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

function smooth(render: RenderState, snapshot: HeadSportSnapshot) {
  render.ball.x += (snapshot.ball.x - render.ball.x) * 0.4;
  render.ball.y += (snapshot.ball.y - render.ball.y) * 0.4;
  render.ball.spin += (snapshot.ball.spin - render.ball.spin) * 0.2;
  const activeIds = new Set(snapshot.players.map((player) => player.playerId));
  for (const id of render.players.keys()) if (!activeIds.has(id)) render.players.delete(id);
  for (const player of snapshot.players) {
    const current = render.players.get(player.playerId) ?? { x: player.x, y: player.y };
    current.x += (player.x - current.x) * 0.42;
    current.y += (player.y - current.y) * 0.42;
    render.players.set(player.playerId, current);
  }
}

function drawArena(
  ctx: CanvasRenderingContext2D,
  game: HeadSportPublicState['game'],
  snapshot: HeadSportSnapshot,
  render: RenderState,
  players: PublicPlayer[],
  meId: string,
) {
  const { width, height, groundY } = HEAD_SPORT_FIELD;
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  if (game === 'head-soccer') {
    sky.addColorStop(0, '#061523');
    sky.addColorStop(0.72, '#0c2d31');
    sky.addColorStop(1, '#07180f');
  } else {
    sky.addColorStop(0, '#190b16');
    sky.addColorStop(0.7, '#321420');
    sky.addColorStop(1, '#1b0d0a');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  drawCrowd(ctx);
  if (game === 'head-soccer') drawSoccerField(ctx);
  else drawBasketballCourt(ctx);

  for (const player of snapshot.players) {
    const position = render.players.get(player.playerId) ?? player;
    const profile = players.find((entry) => entry.id === player.playerId);
    drawHeadPlayer(ctx, position, player, profile, player.playerId === meId);
  }
  drawBall(ctx, game, render.ball, snapshot.ball.radius);

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '700 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(game === 'head-soccer' ? 'PARQUE ARENA' : 'NEON COURT', width / 2, groundY + 52);
}

function drawCrowd(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let row = 0; row < 4; row += 1) {
    for (let x = 22 + (row % 2) * 11; x < HEAD_SPORT_FIELD.width; x += 34) {
      ctx.beginPath();
      ctx.arc(x, 82 + row * 32, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSoccerField(ctx: CanvasRenderingContext2D) {
  const { width, groundY, goalTop, goalDepth } = HEAD_SPORT_FIELD;
  ctx.fillStyle = '#0d3d24';
  ctx.fillRect(0, groundY, width, 600 - groundY);
  ctx.strokeStyle = 'rgba(110,255,160,.42)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.moveTo(width / 2, groundY);
  ctx.lineTo(width / 2, 300);
  ctx.arc(width / 2, groundY, 92, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, width] as const) {
    const inward = side === 0 ? goalDepth : -goalDepth;
    ctx.save();
    ctx.strokeStyle = side === 0 ? TEAM_META.rojo.color : TEAM_META.azul.color;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(side, groundY);
    ctx.lineTo(side, goalTop);
    ctx.lineTo(side + inward, goalTop);
    ctx.lineTo(side + inward, groundY);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBasketballCourt(ctx: CanvasRenderingContext2D) {
  const { width, groundY, hoopX, hoopY, rimHalfWidth } = HEAD_SPORT_FIELD;
  ctx.fillStyle = '#5b2415';
  ctx.fillRect(0, groundY, width, 600 - groundY);
  ctx.strokeStyle = 'rgba(255,190,120,.48)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.moveTo(width / 2, groundY);
  ctx.lineTo(width / 2, 300);
  ctx.arc(width / 2, groundY, 92, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (const [x, team] of [
    [hoopX, 'rojo'],
    [width - hoopX, 'azul'],
  ] as const) {
    const outward = x < width / 2 ? -1 : 1;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + outward * (rimHalfWidth + 18), hoopY - 76);
    ctx.lineTo(x + outward * (rimHalfWidth + 18), hoopY + 52);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = TEAM_META[team].color;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - rimHalfWidth, hoopY);
    ctx.lineTo(x + rimHalfWidth, hoopY);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHeadPlayer(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  player: HeadSportPlayer,
  profile: PublicPlayer | undefined,
  mine: boolean,
) {
  const teamColor = TEAM_META[player.team].color;
  const skin = profile?.color ?? '#f5c98b';
  const { headRadius, groundY } = HEAD_SPORT_FIELD;
  ctx.save();
  ctx.shadowColor = mine ? '#ffffff' : teamColor;
  ctx.shadowBlur = mine ? 24 : 10;
  ctx.fillStyle = teamColor;
  ctx.fillRect(position.x - 24, position.y + 25, 48, Math.max(18, groundY - position.y - 25));
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(position.x, position.y, headRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mine ? '#ffffff' : teamColor;
  ctx.lineWidth = mine ? 6 : 4;
  ctx.stroke();
  const eyeX = position.x + player.facing * 12;
  ctx.fillStyle = '#081018';
  ctx.beginPath();
  ctx.arc(eyeX, position.y - 8, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(position.x + player.facing * 6, position.y + 12);
  ctx.lineTo(position.x + player.facing * 20, position.y + 10);
  ctx.stroke();
  if (player.kickMs > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(position.x + player.facing * 18, position.y + 44);
    ctx.lineTo(position.x + player.facing * 45, position.y + 29);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  game: HeadSportPublicState['game'],
  ball: { x: number; y: number; spin: number },
  radius: number,
) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin * 0.02);
  ctx.shadowColor = game === 'head-soccer' ? '#ffffff' : '#fb923c';
  ctx.shadowBlur = 18;
  ctx.fillStyle = game === 'head-soccer' ? '#f8fafc' : '#f97316';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = game === 'head-soccer' ? '#0f172a' : '#431407';
  ctx.lineWidth = 3;
  if (game === 'head-soccer') {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.32, Math.sin(angle) * radius * 0.32);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, -1.1, 1.1);
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.quadraticCurveTo(-10, 0, 0, radius);
    ctx.stroke();
  }
  ctx.restore();
}
