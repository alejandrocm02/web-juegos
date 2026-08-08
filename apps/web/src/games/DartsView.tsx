import {
  CRICKET_MARKS_TO_CLOSE,
  CRICKET_NUMBERS,
  DART_RADII,
  DART_SECTORS,
  type DartsPublicState,
} from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useMatch, useRoom } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const SIZE = 420;

export default function DartsView({ state }: { state: DartsPublicState }) {
  const { session, room } = useRoom();
  const { sendAction } = useMatch();
  const boardRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const isMyTurn = state.activePlayerId === session?.playerId && state.phase === 'aiming';
  const activePlayer = room?.players.find((p) => p.id === state.activePlayerId);

  const toNormalized = (event: React.PointerEvent) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    return { x, y };
  };

  const throwDart = (event: React.PointerEvent) => {
    if (!isMyTurn) return;
    const point = toNormalized(event);
    if (!point) return;
    if (Math.hypot(point.x, point.y) > 1.15) return;
    sendAction({ type: 'darts:throw', x: point.x, y: point.y });
  };

  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title={'Turno de ' + (activePlayer?.name ?? '...')}
        subtitle={isMyTurn ? 'Haz clic en la diana para lanzar' : 'Espera tu turno'}
        actions={
          <span className={'chip tabular-nums ' + (seconds <= 5 ? 'text-rose-300' : '')}>
            {seconds}s
          </span>
        }
        className="overflow-hidden"
      >
        <div className="pointer-events-none absolute -left-28 top-1/3 h-64 w-64 rounded-full bg-neon-amber/[0.09] blur-3xl" />
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-[500px] py-3">
            <div className="pointer-events-none absolute inset-[12%] rounded-full bg-neon-amber/10 blur-3xl" />
            <div className="darts-cabinet">
              <div
                ref={boardRef}
                onPointerUp={throwDart}
                onPointerMove={(event) => setHover(toNormalized(event))}
                onPointerLeave={() => setHover(null)}
                role="button"
                tabIndex={0}
                aria-label="Diana de dardos"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && isMyTurn) {
                    sendAction({ type: 'darts:throw', x: 0, y: 0 });
                  }
                }}
                className={
                  'darts-board relative mx-auto touch-none select-none rounded-full ' +
                  (isMyTurn ? 'cursor-crosshair' : 'cursor-default opacity-80')
                }
                style={{ width: SIZE, maxWidth: '100%', aspectRatio: '1' }}
              >
                <Dartboard />
                {state.currentThrows.map((dart, index) => (
                  <span
                    key={index}
                    className="dart-impact absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: ((dart.x + 1) / 2) * 100 + '%',
                      top: ((dart.y + 1) / 2) * 100 + '%',
                      transform: `translate(-50%, -50%) rotate(${index * 38 - 22}deg)`,
                    }}
                    title={dart.ring + ' ' + dart.points}
                  >
                    <span />
                  </span>
                ))}
                {hover && isMyTurn && (
                  <span
                    className="darts-reticle pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: ((hover.x + 1) / 2) * 100 + '%',
                      top: ((hover.y + 1) / 2) * 100 + '%',
                    }}
                  />
                )}
              </div>
              <div className="darts-throw-lights" aria-label={state.throwsLeft + ' lanzamientos'}>
                {[0, 1, 2].map((index) => (
                  <span key={index} className={index < state.throwsLeft ? 'is-ready' : ''} />
                ))}
              </div>
            </div>
          </div>

          <div className="game-hud justify-center text-sm">
            <span className="hud-stat">
              <span className="hud-stat-label">Dardos</span>
              <span className="hud-stat-value">{state.throwsLeft} disponibles</span>
            </span>
            <span className="hud-stat">
              <span className="hud-stat-label">Inicio de turno</span>
              <span className="hud-stat-value">
                {state.turnStartScore}
                {state.lastBust && <span className="text-rose-300"> | BUST</span>}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-400">
            {state.currentThrows.map((dart, index) => (
              <span key={index} className="chip">
                {dart.ring === 'miss' ? 'Fallo' : dart.ring + ' ' + dart.sector} = {dart.points}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title={'Puntuaciones · ' + state.mode}>
          <ul className="space-y-2">
            {state.order.map((playerId) => {
              const player = room?.players.find((p) => p.id === playerId);
              if (!player) return null;
              const active = playerId === state.activePlayerId;
              return (
                <li
                  key={playerId}
                  className={
                    'flex items-center justify-between rounded-xl border px-3 py-2 ' +
                    (active ? 'border-neon-amber bg-neon-amber/10' : 'border-white/5 bg-white/5')
                  }
                >
                  <span className="flex items-center gap-2">
                    <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                    {player.name}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums">
                    {state.scores[playerId] ?? 301}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        {state.cricket && (
          <Panel title="Cricket: marcas y puntos">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">
                  Marcas por número y puntos de cada jugador en el modo cricket
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pb-1 text-left font-semibold text-slate-400">
                      Jugador
                    </th>
                    {CRICKET_NUMBERS.map((number) => (
                      <th
                        key={number}
                        scope="col"
                        className="pb-1 text-center font-semibold text-slate-400"
                      >
                        {number === 25 ? 'B' : number}
                      </th>
                    ))}
                    <th scope="col" className="pb-1 text-right font-semibold text-slate-400">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.order.map((playerId) => {
                    const player = room?.players.find((entry) => entry.id === playerId);
                    const entry = state.cricket?.[playerId];
                    if (!player || !entry) return null;
                    return (
                      <tr key={playerId} className="border-t border-white/5">
                        <th scope="row" className="py-1 text-left font-medium text-white">
                          {player.name}
                        </th>
                        {CRICKET_NUMBERS.map((number) => {
                          const marks = entry.marks[number] ?? 0;
                          const closed = marks >= CRICKET_MARKS_TO_CLOSE;
                          return (
                            <td
                              key={number}
                              className={
                                'py-1 text-center tabular-nums ' +
                                (closed
                                  ? 'font-bold text-[color:var(--state-success)]'
                                  : 'text-slate-300')
                              }
                            >
                              {/* Notacion clasica: barra, cruz y circulo. */}
                              {closed ? 'X' : marks === 2 ? '//' : marks === 1 ? '/' : '·'}
                            </td>
                          );
                        })}
                        <td className="py-1 text-right font-semibold tabular-nums text-white">
                          {entry.score}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Tres marcas cierran un número. Con el número cerrado y algún rival sin cerrarlo, los
              impactos suman puntos.
            </p>
          </Panel>
        )}

        <Panel title="Historial">
          <ul className="space-y-2 text-xs">
            {state.history.length === 0 && <li className="text-slate-500">Todavía sin turnos.</li>}
            {state.history.map((entry, index) => {
              const player = room?.players.find((p) => p.id === entry.playerId);
              return (
                <li key={index} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <span className="font-semibold">{player?.name ?? 'Jugador'}</span>{' '}
                  {entry.throws.map((t) => t.points).join(' + ')} = {entry.scoreBefore} to{' '}
                  {entry.scoreAfter}
                  {entry.bust && <span className="ml-1 text-rose-300">BUST</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Dartboard() {
  const rings = DART_RADII;
  const sectors = DART_SECTORS;
  const r = 48;
  return (
    <svg viewBox="-54 -54 108 108" className="h-full w-full">
      <defs>
        <radialGradient id="board-core" cx="42%" cy="35%">
          <stop offset="0" stopColor="#28313d" />
          <stop offset="0.72" stopColor="#111720" />
          <stop offset="1" stopColor="#070a0f" />
        </radialGradient>
        <filter id="board-shadow">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodOpacity="0.65" />
        </filter>
      </defs>
      <circle r="53" fill="#080b10" stroke="#394150" strokeWidth="1" />
      <circle r="50.8" fill="url(#board-core)" stroke="#0a0c10" strokeWidth="2" />
      {sectors.map((sector, index) => {
        const start = (index * 18 - 9 - 90) * (Math.PI / 180);
        const end = (index * 18 + 9 - 90) * (Math.PI / 180);
        const dark = index % 2 === 0;
        const single = dark ? '#191d21' : '#d9d2bd';
        const band = dark ? '#d73d4d' : '#27a66c';
        return (
          <g key={sector} filter="url(#board-shadow)">
            <path
              d={ringSectorPath(rings.bull * r, rings.tripleInner * r, start, end)}
              fill={single}
            />
            <path
              d={ringSectorPath(rings.tripleInner * r, rings.tripleOuter * r, start, end)}
              fill={band}
            />
            <path
              d={ringSectorPath(rings.tripleOuter * r, rings.doubleInner * r, start, end)}
              fill={single}
            />
            <path
              d={ringSectorPath(rings.doubleInner * r, rings.doubleOuter * r, start, end)}
              fill={band}
            />
          </g>
        );
      })}
      {[rings.doubleOuter, rings.doubleInner, rings.tripleOuter, rings.tripleInner].map(
        (radius) => (
          <circle
            key={radius}
            r={radius * r}
            fill="none"
            stroke="rgba(9,12,16,.88)"
            strokeWidth="0.65"
          />
        ),
      )}
      {sectors.map((sector, index) => {
        const angle = (index * 18 - 9 - 90) * (Math.PI / 180);
        return (
          <line
            key={'wire-' + sector}
            x1={Math.cos(angle) * rings.bull * r}
            y1={Math.sin(angle) * rings.bull * r}
            x2={Math.cos(angle) * r}
            y2={Math.sin(angle) * r}
            stroke="rgba(8,10,13,.75)"
            strokeWidth="0.55"
          />
        );
      })}
      <circle r={rings.bull * r} fill="#289b66" stroke="#080b0e" strokeWidth="0.8" />
      <circle r={rings.bullseye * r} fill="#d63c4b" stroke="#080b0e" strokeWidth="0.55" />
      {sectors.map((sector, index) => {
        const angle = (index * 18 - 90) * (Math.PI / 180);
        const radius = r * 1.075;
        return (
          <text
            key={'label-' + sector}
            x={Math.cos(angle) * radius}
            y={Math.sin(angle) * radius}
            fontSize="4.7"
            fontWeight="700"
            fill="#e6e8ed"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {sector}
          </text>
        );
      })}
      <circle r="50.3" fill="none" stroke="rgba(255,255,255,.17)" strokeWidth="0.7" />
    </svg>
  );
}

function ringSectorPath(inner: number, outer: number, start: number, end: number): string {
  const x1 = Math.cos(start) * outer;
  const y1 = Math.sin(start) * outer;
  const x2 = Math.cos(end) * outer;
  const y2 = Math.sin(end) * outer;
  const x3 = Math.cos(end) * inner;
  const y3 = Math.sin(end) * inner;
  const x4 = Math.cos(start) * inner;
  const y4 = Math.sin(start) * inner;
  return [
    'M',
    x1,
    y1,
    'A',
    outer,
    outer,
    0,
    0,
    1,
    x2,
    y2,
    'L',
    x3,
    y3,
    'A',
    inner,
    inner,
    0,
    0,
    0,
    x4,
    y4,
    'Z',
  ].join(' ');
}
