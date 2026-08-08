import {
  GAME_IDS,
  GAME_META,
  TOURNAMENT_MAX_ROUNDS,
  TOURNAMENT_MIN_ROUNDS,
  TOURNAMENT_POINTS,
  TOURNAMENT_PRESETS,
  type GameId,
  type TournamentPublicState,
} from '@arcade/shared';
import { GameIcon } from '../ui.js';

/**
 * Montaje del torneo en el lobby.
 *
 * El anfitrion elige entre tres y cinco pruebas; el resto solo mira. Mientras
 * el torneo esta en marcha el panel se convierte en un resumen de por donde va.
 */
export function TournamentPanel({
  tournament,
  disabled,
  onToggle,
  onGamesChange,
}: {
  tournament: TournamentPublicState | null;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onGamesChange: (games: GameId[]) => void;
}) {
  const active = tournament !== null;
  const started = tournament !== null && tournament.rounds.length > 0;
  const selected = tournament?.games ?? [];

  const toggleGame = (game: GameId) => {
    if (selected.includes(game)) {
      if (selected.length <= TOURNAMENT_MIN_ROUNDS) return;
      onGamesChange(selected.filter((id) => id !== game));
      return;
    }
    if (selected.length >= TOURNAMENT_MAX_ROUNDS) return;
    onGamesChange([...selected, game]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Modo torneo</p>
          <p className="text-xs text-slate-400">
            De {TOURNAMENT_MIN_ROUNDS} a {TOURNAMENT_MAX_ROUNDS} pruebas seguidas con clasificación
            acumulada.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Modo torneo"
          disabled={disabled || started}
          onClick={() => onToggle(!active)}
          className={
            'rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ' +
            (active
              ? 'border-neon-amber bg-neon-amber/15 text-neon-amber'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')
          }
        >
          {active ? 'Activado' : 'Desactivado'}
        </button>
      </div>

      {active && !started && (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TOURNAMENT_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onGamesChange(preset.games)}
                title={preset.summary}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div>
            <span className="label">
              Pruebas ({selected.length}/{TOURNAMENT_MAX_ROUNDS})
            </span>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {GAME_IDS.map((id) => {
                const position = selected.indexOf(id);
                const picked = position >= 0;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={picked}
                    aria-label={GAME_META[id].name}
                    onClick={() => toggleGame(id)}
                    className={
                      'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-[10px] transition disabled:opacity-50 ' +
                      (picked
                        ? 'border-neon-amber bg-neon-amber/10 text-neon-amber'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]')
                    }
                  >
                    {picked && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon-amber text-[9px] font-bold text-night-900">
                        {position + 1}
                      </span>
                    )}
                    <GameIcon game={id} />
                    <span className="truncate px-1">{GAME_META[id].name}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Se juegan en el orden marcado. Reparto por prueba: {TOURNAMENT_POINTS.join(' · ')}{' '}
              puntos.
            </p>
          </div>
        </>
      )}

      {started && tournament && (
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
          <p className="text-xs text-slate-400">
            Prueba {Math.min(tournament.currentIndex + 1, tournament.games.length)} de{' '}
            {tournament.games.length}
            {tournament.finished ? ' · torneo terminado' : ''}
          </p>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {tournament.games.map((game, index) => {
              const played = index < tournament.currentIndex;
              const current = index === tournament.currentIndex && !tournament.finished;
              return (
                <li
                  key={game + index}
                  className={
                    'rounded-md border px-2 py-1 text-[11px] ' +
                    (current
                      ? 'border-neon-amber bg-neon-amber/15 text-neon-amber'
                      : played
                        ? 'border-white/10 bg-white/5 text-slate-500 line-through'
                        : 'border-white/10 bg-white/[0.03] text-slate-400')
                  }
                >
                  {GAME_META[game].name}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Clasificación general acumulada del torneo. */
export function TournamentStandings({ tournament }: { tournament: TournamentPublicState }) {
  if (tournament.standings.length === 0) return null;
  return (
    <ol className="space-y-1.5">
      {tournament.standings.map((standing) => (
        <li
          key={standing.playerId}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-500">
              {standing.tied ? '=' : standing.rank}
            </span>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: standing.color }}
            />
            <span className="truncate text-sm">{standing.name}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{standing.points} pts</span>
        </li>
      ))}
    </ol>
  );
}
