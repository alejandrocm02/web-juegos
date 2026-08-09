import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_META,
  GAME_IDS,
  GAME_META,
  SOLO_RECORD_META,
  botRangeFor,
  clampBotCount,
  formatSoloRecord,
  soloUsesBots,
  type BotDifficulty,
  type GameId,
  type SoloConfig,
  type SoloRecord,
} from '@arcade/shared';
import { useMemo, useState } from 'react';
import { GameIcon } from '../components/ui.js';

export interface SoloSetupValue {
  game: GameId;
  config: SoloConfig;
}

/**
 * Selector de juego y rivales para la práctica en solitario.
 *
 * Los juegos de duelo en tiempo real muestran el control de bots; los de turnos
 * muestran en su lugar la marca que hay que superar, que es lo que da sentido a
 * jugar solo.
 */
export function SoloSetup({
  value,
  records,
  onChange,
}: {
  value: SoloSetupValue;
  records: SoloRecord[];
  onChange: (next: SoloSetupValue) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const range = botRangeFor(value.game);
  const usesBots = soloUsesBots(value.game);
  const recordMeta = SOLO_RECORD_META[value.game];
  const record = useMemo(
    () => records.find((entry) => entry.game === value.game) ?? null,
    [records, value.game],
  );

  const pickGame = (game: GameId) => {
    onChange({
      game,
      config: {
        botCount: soloUsesBots(game) ? clampBotCount(game, botRangeFor(game).preferred) : 0,
        botDifficulty: value.config.botDifficulty,
      },
    });
    setExpanded(false);
  };

  const setDifficulty = (botDifficulty: BotDifficulty) =>
    onChange({ ...value, config: { ...value.config, botDifficulty } });

  const setBotCount = (botCount: number) =>
    onChange({
      ...value,
      config: { ...value.config, botCount: clampBotCount(value.game, botCount) },
    });

  const visibleGames = expanded ? GAME_IDS : GAME_IDS.slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="label mb-2 block">Elige el juego</span>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Juego a practicar">
          {visibleGames.map((id) => {
            const active = id === value.game;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={GAME_META[id].name}
                title={GAME_META[id].name}
                onClick={() => pickGame(id)}
                className={
                  'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 ' +
                  (active
                    ? 'border-transparent bg-white/9 text-white shadow-xs'
                    : 'border-white/[0.07] bg-black/20 text-slate-500 hover:border-white/20 hover:text-slate-200')
                }
                style={
                  active
                    ? {
                        borderColor: GAME_META[id].accent + '80',
                        color: GAME_META[id].accent,
                        outlineColor: GAME_META[id].accent,
                      }
                    : undefined
                }
              >
                <GameIcon game={id} size={20} />
                <span className="w-full truncate px-1 text-[9px] font-semibold leading-none text-current">
                  {GAME_META[id].name}
                </span>
              </button>
            );
          })}
        </div>
        {GAME_IDS.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-2 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            {expanded ? 'Ver menos juegos' : 'Ver los ' + GAME_IDS.length + ' juegos'}
          </button>
        )}
      </div>

      <div
        className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
        style={{ borderLeftColor: GAME_META[value.game].accent + '80', borderLeftWidth: 3 }}
      >
        <p className="font-display text-sm font-bold">{GAME_META[value.game].name}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{recordMeta.goal}</p>
        <p className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-slate-500">{recordMeta.label}:</span>
          {record ? (
            <span
              className="font-display font-bold"
              style={{ color: GAME_META[value.game].accent }}
            >
              {formatSoloRecord(value.game, record.value)}
            </span>
          ) : (
            <span className="text-slate-600">sin marca todavía</span>
          )}
        </p>
      </div>

      {usesBots ? (
        <>
          <div>
            <span className="label mb-2 block">Dificultad de los rivales</span>
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
              {BOT_DIFFICULTIES.map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => setDifficulty(difficulty)}
                  aria-pressed={value.config.botDifficulty === difficulty}
                  className={
                    'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ' +
                    (value.config.botDifficulty === difficulty
                      ? 'bg-white/10 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-300')
                  }
                >
                  {BOT_DIFFICULTY_META[difficulty].name}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
              {BOT_DIFFICULTY_META[value.config.botDifficulty].description}
            </p>
          </div>

          <div>
            <label className="label mb-2 block" htmlFor="bot-count">
              Rivales: {value.config.botCount}
            </label>
            <input
              id="bot-count"
              type="range"
              min={range.min}
              max={range.max}
              step={1}
              value={value.config.botCount}
              onChange={(event) => setBotCount(Number(event.target.value))}
              className="w-full accent-neon-cyan"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Entre {range.min} y {range.max} en {GAME_META[value.game].name}.
            </p>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
          Este juego se practica en solitario: no hay rivales, solo tu marca personal. Podrás elegir
          el modo y la configuración en la siguiente pantalla.
        </p>
      )}
    </div>
  );
}
