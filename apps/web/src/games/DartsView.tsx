import { DART_RADII, DART_SECTORS, type DartsPublicState } from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph } from '../components/ui.js';

const SIZE = 420;

export default function DartsView({ state }: { state: DartsPublicState }) {
  const { sendAction, session, room } = useApp();
  const boardRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const isMyTurn = state.activePlayerId === session?.playerId && state.phase === 'aiming';
  const activePlayer = room?.players.find((p) => p.id === state.activePlayerId);

  const toNormalized = (event: React.MouseEvent) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    return { x, y };
  };

  const throwDart = (event: React.MouseEvent) => {
    if (!isMyTurn) return;
    const point = toNormalized(event);
    if (!point) return;
    if (Math.hypot(point.x, point.y) > 1.15) return;
    sendAction({ type: 'darts:throw', x: point.x, y: point.y });
  };

  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title={'Turno de ' + (activePlayer?.name ?? '...')}
        subtitle={isMyTurn ? 'Haz clic en la diana para lanzar' : 'Espera tu turno'}
        actions={<span className="chip tabular-nums">{seconds}s</span>}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            ref={boardRef}
            onClick={throwDart}
            onMouseMove={(event) => setHover(toNormalized(event))}
            onMouseLeave={() => setHover(null)}
            role="button"
            tabIndex={0}
            aria-label="Diana de dardos"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isMyTurn) {
                sendAction({ type: 'darts:throw', x: 0, y: 0 });
              }
            }}
            className={
              'relative select-none rounded-full ' +
              (isMyTurn ? 'cursor-crosshair' : 'cursor-default opacity-80')
            }
            style={{ width: SIZE, height: SIZE, maxWidth: '100%' }}
          >
            <Dartboard />
            {state.currentThrows.map((dart, index) => (
              <span
                key={index}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                style={{
                  left: ((dart.x + 1) / 2) * 100 + '%',
                  top: ((dart.y + 1) / 2) * 100 + '%',
                }}
                title={dart.ring + ' ' + dart.points}
              />
            ))}
            {hover && isMyTurn && (
              <span
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon-cyan"
                style={{
                  left: ((hover.x + 1) / 2) * 100 + '%',
                  top: ((hover.y + 1) / 2) * 100 + '%',
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="chip">Lanzamientos restantes: {state.throwsLeft}</span>
            <span className="chip">
              Turno desde {state.turnStartScore}
              {state.lastBust && <span className="text-rose-300"> | BUST</span>}
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
        <Panel title="Puntuaciones (301)">
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

        <Panel title="Historial">
          <ul className="space-y-2 text-xs">
            {state.history.length === 0 && <li className="text-slate-500">Todavia sin turnos.</li>}
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
  const r = 50;
  return (
    <svg viewBox="-50 -50 100 100" className="h-full w-full">
      <circle r={r} fill="#0b1020" stroke="#1e293b" />
      {sectors.map((sector, index) => {
        const start = (index * 18 - 9 - 90) * (Math.PI / 180);
        const end = (index * 18 + 9 - 90) * (Math.PI / 180);
        const outer = rings.doubleOuter * r;
        const path = [
          'M',
          Math.cos(start) * outer,
          Math.sin(start) * outer,
          'A',
          outer,
          outer,
          0,
          0,
          1,
          Math.cos(end) * outer,
          Math.sin(end) * outer,
          'L',
          0,
          0,
          'Z',
        ].join(' ');
        return (
          <g key={sector}>
            <path d={path} fill={index % 2 === 0 ? '#111827' : '#1f2937'} />
          </g>
        );
      })}
      {[rings.doubleOuter, rings.doubleInner, rings.tripleOuter, rings.tripleInner].map(
        (radius, i) => (
          <circle
            key={i}
            r={radius * r}
            fill="none"
            stroke={i % 2 === 0 ? '#ef4444' : '#22c55e'}
            strokeWidth={i % 2 === 0 ? 1.6 : 1.2}
            opacity={0.85}
          />
        ),
      )}
      <circle r={rings.bull * r} fill="#166534" stroke="#052e16" strokeWidth="0.6" />
      <circle r={rings.bullseye * r} fill="#b91c1c" />
      {sectors.map((sector, index) => {
        const angle = (index * 18 - 90) * (Math.PI / 180);
        const radius = r * 1.06;
        return (
          <text
            key={'label-' + sector}
            x={Math.cos(angle) * radius}
            y={Math.sin(angle) * radius}
            fontSize="5"
            fill="#94a3b8"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {sector}
          </text>
        );
      })}
    </svg>
  );
}
