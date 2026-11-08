import {
  KART_TRACKS,
  QUIZ_CATEGORIES,
  TANK_MAPS,
  type AirHockeySettings,
  type ArenaSettings,
  type BlackjackSettings,
  type BowlingSettings,
  type GameId,
  type GameSettings,
  type GolfSettings,
  type HeadBasketballSettings,
  type HeadSoccerSettings,
  type KartsSettings,
  type SonglessSettings,
  type TableTennisSettings,
  type TanksSettings,
} from '@arcade/shared';
import { quizCategoryLabel } from '../../lib/format.js';
import { Field, Segmented } from './controls.js';

/**
 * Ajustes especificos de cada juego.
 *
 * Es deliberadamente una cadena de `if` por juego en vez de un mapa: cada
 * bloque tiene sus propios controles y sus propios tipos, y el estrechamiento
 * por comparacion es lo que hace que `settings.quiz` o `settings.tanks` sean
 * del tipo correcto sin afirmar nada.
 */

export function GameSettingsForm({
  game,
  settings,
  disabled,
  onChange,
}: {
  game: GameId;
  settings: GameSettings;
  disabled: boolean;
  onChange: <K extends GameId>(game: K, value: GameSettings[K]) => void;
}) {
  if (game === 'quiz') {
    const quiz = settings.quiz;
    return (
      <div className="space-y-4">
        <Field label="Número de preguntas">
          <Segmented
            disabled={disabled}
            value={quiz.questionCount}
            options={[5, 10, 15, 20].map((n) => ({ label: String(n), value: n }))}
            onChange={(questionCount) => onChange('quiz', { ...quiz, questionCount })}
          />
        </Field>
        <Field label="Segundos por pregunta">
          <Segmented
            disabled={disabled}
            value={quiz.secondsPerQuestion}
            options={[10, 15, 20, 30].map((n) => ({ label: n + 's', value: n }))}
            onChange={(secondsPerQuestion) => onChange('quiz', { ...quiz, secondsPerQuestion })}
          />
        </Field>
        <Field label="Categorías (vacío = todas)">
          <div className="flex flex-wrap gap-2">
            {QUIZ_CATEGORIES.map((category) => {
              const active = quiz.categories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange('quiz', {
                      ...quiz,
                      categories: active
                        ? quiz.categories.filter((c) => c !== category)
                        : [...quiz.categories, category],
                    })
                  }
                  className={
                    'rounded-lg border px-3 py-1.5 text-xs capitalize transition disabled:opacity-50 ' +
                    (active
                      ? 'border-neon-pink bg-neon-pink/15 text-neon-pink'
                      : 'border-white/10 bg-white/5 text-slate-300')
                  }
                >
                  {quizCategoryLabel(category)}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    );
  }

  if (game === 'darts') {
    const darts = settings.darts;
    return (
      <Field label="Precisión (desviación aplicada por el servidor)">
        <Segmented
          disabled={disabled}
          value={darts.aimAssist}
          options={[
            { label: 'Fácil', value: 'facil' as const },
            { label: 'Normal', value: 'normal' as const },
            { label: 'Difícil', value: 'dificil' as const },
          ]}
          onChange={(aimAssist) => onChange('darts', { ...darts, aimAssist })}
        />
      </Field>
    );
  }

  if (game === 'pool') {
    const pool = settings.pool;
    return (
      <div className="space-y-4">
        {pool.mode === 'bola8' ? (
          <Field label="Bolas">
            <p className="text-sm text-slate-400">
              La bola 8 usa siempre las quince bolas numeradas: lisas de la 1 a la 7, rayadas de la
              9 a la 15 y la negra en el centro del triángulo.
            </p>
          </Field>
        ) : (
          <Field label="Bolas de color">
            <Segmented
              disabled={disabled}
              value={pool.colorBalls}
              options={[6, 9, 12].map((n) => ({ label: String(n), value: n }))}
              onChange={(colorBalls) => onChange('pool', { ...pool, colorBalls })}
            />
          </Field>
        )}
        <Field label="Velocidad del paño">
          <Segmented
            disabled={disabled}
            value={pool.tableFriction}
            options={[
              { label: 'Lenta', value: 'lenta' as const },
              { label: 'Normal', value: 'normal' as const },
              { label: 'Rápida', value: 'rapida' as const },
            ]}
            onChange={(tableFriction) => onChange('pool', { ...pool, tableFriction })}
          />
        </Field>
      </div>
    );
  }

  if (game === 'arena') {
    const arena: ArenaSettings = settings.arena;
    return (
      <div className="space-y-4">
        <Field label="Velocidad de cierre de la zona">
          <Segmented
            disabled={disabled}
            value={arena.zonePace}
            options={[
              { label: 'Lenta', value: 'lenta' as const },
              { label: 'Normal', value: 'normal' as const },
              { label: 'Rápida', value: 'rapida' as const },
            ]}
            onChange={(zonePace) => onChange('arena', { ...arena, zonePace })}
          />
        </Field>
        <Field label="Objetos en la arena">
          <Segmented
            disabled={disabled}
            value={arena.pickups}
            options={[
              { label: 'Activados', value: true },
              { label: 'Desactivados', value: false },
            ]}
            onChange={(pickups) => onChange('arena', { ...arena, pickups })}
          />
        </Field>
      </div>
    );
  }

  if (game === 'karts') {
    const karts: KartsSettings = settings.karts;
    const track = KART_TRACKS.find((entry) => entry.id === karts.track);
    return (
      <div className="space-y-4">
        <Field label="Circuito">
          <Segmented
            disabled={disabled}
            value={karts.track}
            options={KART_TRACKS.map((entry) => ({ label: entry.name, value: entry.id }))}
            onChange={(value) => onChange('karts', { ...karts, track: value })}
          />
          {track && <p className="mt-2 text-xs text-slate-400">{track.description}</p>}
        </Field>
        <Field label="Vueltas">
          <Segmented
            disabled={disabled}
            value={karts.laps}
            options={[2, 3, 5].map((n) => ({ label: String(n), value: n as 2 | 3 | 5 }))}
            onChange={(laps) => onChange('karts', { ...karts, laps })}
          />
        </Field>
      </div>
    );
  }

  if (game === 'bowling') {
    const bowling: BowlingSettings = settings.bowling;
    return (
      <Field label="Precisión (desviación que aplica el servidor)">
        <Segmented
          disabled={disabled}
          value={bowling.precision}
          options={[
            { label: 'Fácil', value: 'facil' as const },
            { label: 'Normal', value: 'normal' as const },
            { label: 'Difícil', value: 'dificil' as const },
          ]}
          onChange={(precision) => onChange('bowling', { ...bowling, precision })}
        />
      </Field>
    );
  }

  if (game === 'blackjack') {
    const blackjack: BlackjackSettings = settings.blackjack;
    if (blackjack.mode === 'rapido') {
      return (
        <Field label="Duración">
          <p className="text-sm text-slate-400">El modo rápido juega siempre tres rondas.</p>
        </Field>
      );
    }
    return (
      <Field label="Rondas">
        <Segmented
          disabled={disabled}
          value={blackjack.rounds}
          options={[3, 5, 7].map((rounds) => ({
            label: String(rounds),
            value: rounds as 3 | 5 | 7,
          }))}
          onChange={(rounds) => onChange('blackjack', { ...blackjack, rounds })}
        />
      </Field>
    );
  }

  if (game === 'songless') {
    const songless: SonglessSettings = settings.songless;
    if (songless.mode === 'relampago') {
      return (
        <Field label="Duración">
          <p className="text-sm text-slate-400">Relámpago juega siempre cinco melodías.</p>
        </Field>
      );
    }
    return (
      <Field label="Melodías por partida">
        <Segmented
          disabled={disabled}
          value={songless.rounds}
          options={[5, 7, 10].map((rounds) => ({
            label: String(rounds),
            value: rounds as 5 | 7 | 10,
          }))}
          onChange={(rounds) => onChange('songless', { ...songless, rounds })}
        />
      </Field>
    );
  }

  if (game === 'air-hockey') {
    const hockey: AirHockeySettings = settings['air-hockey'];
    if (hockey.mode === 'gol-de-oro') {
      return (
        <Field label="Marcador">
          <p className="text-sm text-slate-400">El primer gol decide la partida.</p>
        </Field>
      );
    }
    return (
      <Field label="Goles para ganar">
        <Segmented
          disabled={disabled}
          value={hockey.goalLimit}
          options={[5, 7, 9].map((goalLimit) => ({
            label: String(goalLimit),
            value: goalLimit as 5 | 7 | 9,
          }))}
          onChange={(goalLimit) => onChange('air-hockey', { ...hockey, goalLimit })}
        />
      </Field>
    );
  }

  if (game === 'table-tennis') {
    const tennis: TableTennisSettings = settings['table-tennis'];
    if (tennis.mode === 'rapido') {
      return (
        <Field label="Marcador">
          <p className="text-sm text-slate-400">El modo rápido se juega siempre a siete puntos.</p>
        </Field>
      );
    }
    return (
      <Field label="Puntos para ganar">
        <Segmented
          disabled={disabled}
          value={tennis.pointsToWin}
          options={[7, 11, 15].map((pointsToWin) => ({
            label: String(pointsToWin),
            value: pointsToWin as 7 | 11 | 15,
          }))}
          onChange={(pointsToWin) => onChange('table-tennis', { ...tennis, pointsToWin })}
        />
      </Field>
    );
  }

  if (game === 'head-soccer') {
    const soccer: HeadSoccerSettings = settings['head-soccer'];
    if (soccer.mode === 'gol-de-oro') {
      return (
        <Field label="Marcador">
          <p className="text-sm text-slate-400">El primer gol decide la partida.</p>
        </Field>
      );
    }
    return (
      <Field label="Goles para ganar">
        <Segmented
          disabled={disabled}
          value={soccer.goalLimit}
          options={[3, 5, 7].map((goalLimit) => ({
            label: String(goalLimit),
            value: goalLimit as 3 | 5 | 7,
          }))}
          onChange={(goalLimit) => onChange('head-soccer', { ...soccer, goalLimit })}
        />
      </Field>
    );
  }

  if (game === 'head-basketball') {
    const basketball: HeadBasketballSettings = settings['head-basketball'];
    if (basketball.mode === 'rapido') {
      return (
        <Field label="Marcador">
          <p className="text-sm text-slate-400">El modo rápido se juega siempre a seis puntos.</p>
        </Field>
      );
    }
    return (
      <Field label="Puntos para ganar">
        <Segmented
          disabled={disabled}
          value={basketball.pointsToWin}
          options={[6, 10, 14].map((pointsToWin) => ({
            label: String(pointsToWin),
            value: pointsToWin as 6 | 10 | 14,
          }))}
          onChange={(pointsToWin) => onChange('head-basketball', { ...basketball, pointsToWin })}
        />
      </Field>
    );
  }

  if (game === 'tanks') {
    const tanks: TanksSettings = settings.tanks;
    const map = TANK_MAPS.find((entry) => entry.id === tanks.map);
    return (
      <Field label="Campo de batalla">
        <Segmented
          disabled={disabled}
          value={tanks.map}
          options={TANK_MAPS.map((entry) => ({ label: entry.name, value: entry.id }))}
          onChange={(mapId) => onChange('tanks', { ...tanks, map: mapId })}
        />
        {map && <p className="mt-2 text-xs text-slate-400">{map.description}</p>}
      </Field>
    );
  }

  const golf: GolfSettings = settings.golf;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Colisión entre bolas">
        <Segmented
          disabled={disabled}
          value={golf.ballCollisions}
          options={[
            { label: 'Activada', value: true },
            { label: 'Desactivada', value: false },
          ]}
          onChange={(ballCollisions) => onChange('golf', { ...golf, ballCollisions })}
        />
      </Field>
      <Field label="Tiempo por hoyo">
        <Segmented
          disabled={disabled}
          value={golf.holeTimeLimitSeconds}
          options={[60, 90, 120].map((n) => ({ label: n + 's', value: n as 60 | 90 | 120 }))}
          onChange={(holeTimeLimitSeconds) => onChange('golf', { ...golf, holeTimeLimitSeconds })}
        />
      </Field>
      <Field label="Límite de golpes">
        <Segmented
          disabled={disabled}
          value={golf.maxStrokes}
          options={[8, 10, 12].map((n) => ({ label: String(n), value: n as 8 | 10 | 12 }))}
          onChange={(maxStrokes) => onChange('golf', { ...golf, maxStrokes })}
        />
      </Field>
      <Field label="Reinicio automático fuera del recorrido">
        <Segmented
          disabled={disabled}
          value={golf.autoResetOutOfBounds}
          options={[
            { label: 'Sí', value: true },
            { label: 'No', value: false },
          ]}
          onChange={(autoResetOutOfBounds) => onChange('golf', { ...golf, autoResetOutOfBounds })}
        />
      </Field>
      <Field label="Penalización al salir">
        <Segmented
          disabled={disabled}
          value={golf.outOfBoundsPenalty}
          options={[
            { label: 'Activada', value: true },
            { label: 'Desactivada', value: false },
          ]}
          onChange={(outOfBoundsPenalty) => onChange('golf', { ...golf, outOfBoundsPenalty })}
        />
      </Field>
      <Field label="Viento">
        <Segmented
          disabled={disabled}
          value={golf.windStrength}
          options={[
            { label: 'Sin viento', value: 0 },
            { label: 'Normal', value: 1 },
            { label: 'Fuerte', value: 2 },
          ]}
          onChange={(windStrength) => onChange('golf', { ...golf, windStrength })}
        />
      </Field>
    </div>
  );
}
