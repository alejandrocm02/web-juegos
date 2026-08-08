import { GAME_MODE_CATALOG, soloSupportsMode, type GameId } from '@arcade/shared';

/** Eleccion del modo de juego, con la regla del modo activo debajo. */

export function ModeSelector({
  game,
  value,
  disabled,
  participants,
  onChange,
}: {
  game: GameId;
  value: string;
  disabled: boolean;
  /** Participantes reales de la partida, humanos y bots incluidos. */
  participants: number;
  onChange: (mode: string) => void;
}) {
  // Con un solo participante se ocultan los modos que necesitan rival: no
  // tendrian sentido y el servidor los rechazaria de todas formas.
  const modes = GAME_MODE_CATALOG[game].filter((mode) =>
    soloSupportsMode(game, mode.id, participants),
  );
  const active = modes.find((mode) => mode.id === value) ?? modes[0];

  return (
    <div className="mb-5">
      <span className="label">Modo de juego</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {modes.map((mode) => {
          const selected = mode.id === value;
          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              aria-label={mode.name}
              aria-pressed={selected}
              onClick={() => onChange(mode.id)}
              className={
                'min-h-11 rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ' +
                (selected
                  ? 'border-[color:var(--accent-blue)] bg-[color:var(--accent-blue)]/15'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]')
              }
            >
              <span
                className={
                  'block text-sm font-semibold ' +
                  (selected ? 'text-[color:var(--accent-blue-ink)]' : 'text-white')
                }
              >
                {mode.name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">{mode.summary}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="mt-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-slate-300">
          {active.rule}
        </p>
      )}
    </div>
  );
}
