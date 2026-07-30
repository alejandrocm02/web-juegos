import type { GameId, PlayerIcon, PublicPlayer } from '@arcade/shared';
import React from 'react';

export function Panel({
  title,
  subtitle,
  children,
  className = '',
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={'card ' + className}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function GameIcon({
  game,
  size = 28,
  className = '',
}: {
  game: GameId;
  size?: number;
  className?: string;
}) {
  const paths: Record<GameId, React.ReactNode> = {
    pool: (
      <>
        <circle cx="9" cy="15" r="4.5" />
        <circle cx="16.5" cy="8.5" r="3.5" />
        <path d="m4 5 16 16" />
      </>
    ),
    quiz: (
      <>
        <path d="M9.1 8.2a3.2 3.2 0 1 1 5.8 1.9c-1 1.3-2.9 1.7-2.9 3.4" />
        <path d="M12 17.5v.2" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    darts: (
      <>
        <circle cx="10" cy="14" r="7" />
        <circle cx="10" cy="14" r="3" />
        <path d="m12 12 8-8m-4 0h4v4" />
      </>
    ),
    golf: (
      <>
        <path d="M7 21V4m0 1 10 3-10 3" />
        <path d="M3 21h10" />
        <circle cx="17.5" cy="18.5" r="2.5" />
      </>
    ),
    arena: (
      <>
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="8.5" />
      </>
    ),
    karts: (
      <>
        <path d="M4 16.5h16" />
        <path d="M6.5 16.5 8 11h8l1.5 5.5" />
        <circle cx="7.5" cy="18.5" r="1.8" />
        <circle cx="16.5" cy="18.5" r="1.8" />
        <path d="M9.5 11V8.5h5V11" />
      </>
    ),
    bowling: (
      <>
        <circle cx="8" cy="15" r="5.5" />
        <circle cx="6.6" cy="13.4" r="0.9" />
        <circle cx="9.4" cy="13" r="0.9" />
        <circle cx="8" cy="16.4" r="0.9" />
        <path d="M17 21c-1.4 0-2.2-1-2.2-2.4 0-1.6 1-2.3 1-3.9 0-1.5-.9-2-.9-3.4 0-1.6 1-2.3 2.1-2.3s2.1.7 2.1 2.3c0 1.4-.9 1.9-.9 3.4 0 1.6 1 2.3 1 3.9C19.2 20 18.4 21 17 21Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[game]}
    </svg>
  );
}

const ICON_PATHS: Record<PlayerIcon, string> = {
  circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z',
  triangle: 'M12 4l8 15H4z',
  square: 'M5 5h14v14H5z',
  diamond: 'M12 3l8 9-8 9-8-9z',
  star: 'M12 3l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 17.1 6.2 20.6l1.6-6.5-5.1-4.4 6.7-.5z',
};

export function PlayerIconGlyph({
  icon,
  color,
  size = 18,
}: {
  icon: PlayerIcon;
  color: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[icon]} fill={color} />
    </svg>
  );
}

export function PlayerChip({
  player,
  extra,
}: {
  player: Pick<PublicPlayer, 'name' | 'color' | 'icon' | 'connection'>;
  extra?: React.ReactNode;
}) {
  return (
    <span className="chip" style={{ borderColor: player.color + '55' }}>
      <PlayerIconGlyph icon={player.icon} color={player.color} size={14} />
      <span className={player.connection === 'disconnected' ? 'text-slate-500 line-through' : ''}>
        {player.name}
      </span>
      {extra}
    </span>
  );
}

export function Toasts({ toasts }: { toasts: { id: number; message: string }[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="animate-slideUp rounded-2xl border border-white/15 bg-night-700/95 px-5 py-3 text-sm shadow-2xl backdrop-blur-xl"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: { code: string; message: string } | null;
  onDismiss: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
    >
      <span>{error.message}</span>
      <button className="btn-secondary px-2 py-1 text-xs" onClick={onDismiss}>
        Cerrar
      </button>
    </div>
  );
}

export function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className="tabular-nums">{seconds}s</span>;
}

export function ProgressBar({ value, color = '#22d3ee' }: { value: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/5 bg-black/25 p-[2px]">
      <div
        className="h-full rounded-full transition-[width] duration-150"
        style={{
          width: Math.max(0, Math.min(100, value * 100)) + '%',
          background: color,
          boxShadow: '0 0 14px ' + color,
        }}
      />
    </div>
  );
}

export function Scoreboard({
  rows,
  unit = 'pts',
}: {
  rows: {
    playerId: string;
    name: string;
    color: string;
    icon: PlayerIcon;
    score: number;
    rank: number;
    tied: boolean;
    detail?: string;
  }[];
  unit?: string;
}) {
  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.playerId}
          className={
            'score-row flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 ' +
            (row.rank === 1
              ? 'border-neon-amber/25 bg-neon-amber/[0.07]'
              : 'border-white/[0.06] bg-white/[0.035]')
          }
        >
          <span className="flex items-center gap-2.5">
            <span className="w-6 text-center text-sm font-bold text-slate-400">
              {row.rank}
              {row.tied ? '=' : ''}
            </span>
            <PlayerIconGlyph icon={row.icon} color={row.color} size={16} />
            <span className="font-medium">{row.name}</span>
          </span>
          <span className="flex items-center gap-2 text-sm">
            {row.detail && <span className="text-xs text-slate-400">{row.detail}</span>}
            <span className="font-display font-bold tabular-nums">
              {row.score} {unit}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
