import {
  KART_TRACKS,
  QUIZ_CATEGORIES,
  TANK_MAPS,
  quizPoolSize,
  type GameId,
  type GameSettings,
} from '@arcade/shared';
import type { ComponentType } from 'react';
import { quizCategoryLabel } from '../../lib/format.js';
import { Field, FixedNote, Segmented } from './controls.js';

/**
 * Un panel de configuracion por juego, mas un registro que los indexa.
 *
 * Antes esto era una cadena de catorce `if` dentro de LobbyView, que por si
 * sola pasaba de las 500 lineas. Con el registro, anadir un juego consiste en
 * escribir su panel aqui y darlo de alta abajo: LobbyView no se entera.
 */

export interface SettingsPanelProps<K extends GameId> {
  settings: GameSettings[K];
  disabled: boolean;
  onChange: (value: GameSettings[K]) => void;
}

/* --------------------------------- Quiz --------------------------------- */

function QuizPanel({ settings, disabled, onChange }: SettingsPanelProps<'quiz'>) {
  // Cuantas preguntas hay realmente con las categorias marcadas. Antes el
  // servidor completaba en silencio con otras categorias; ahora se avisa aqui.
  const available = quizPoolSize(settings.categories);
  const short = settings.questionCount > available;

  return (
    <div className="space-y-4">
      <Field label="Número de preguntas">
        <Segmented
          disabled={disabled}
          value={settings.questionCount}
          options={[5, 10, 15, 20].map((n) => ({ label: String(n), value: n }))}
          onChange={(questionCount) => onChange({ ...settings, questionCount })}
        />
      </Field>
      <Field label="Segundos por pregunta">
        <Segmented
          disabled={disabled}
          value={settings.secondsPerQuestion}
          options={[10, 15, 20, 30].map((n) => ({ label: n + 's', value: n }))}
          onChange={(secondsPerQuestion) => onChange({ ...settings, secondsPerQuestion })}
        />
      </Field>
      <Field label="Categorías (vacío = todas)">
        <div className="flex flex-wrap gap-2">
          {QUIZ_CATEGORIES.map((category) => {
            const active = settings.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...settings,
                    categories: active
                      ? settings.categories.filter((c) => c !== category)
                      : [...settings.categories, category],
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
        <p className={'mt-2 text-xs ' + (short ? 'text-amber-300' : 'text-slate-400')}>
          {short
            ? 'Con esta selección solo hay ' +
              available +
              ' preguntas: la partida se acortará a ese número.'
            : available + ' preguntas disponibles con esta selección.'}
        </p>
      </Field>
    </div>
  );
}

/* -------------------------------- Dardos -------------------------------- */

function DartsPanel({ settings, disabled, onChange }: SettingsPanelProps<'darts'>) {
  return (
    <Field label="Precisión (desviación aplicada por el servidor)">
      <Segmented
        disabled={disabled}
        value={settings.aimAssist}
        options={[
          { label: 'Fácil', value: 'facil' as const },
          { label: 'Normal', value: 'normal' as const },
          { label: 'Difícil', value: 'dificil' as const },
        ]}
        onChange={(aimAssist) => onChange({ ...settings, aimAssist })}
      />
    </Field>
  );
}

/* -------------------------------- Billar -------------------------------- */

function PoolPanel({ settings, disabled, onChange }: SettingsPanelProps<'pool'>) {
  return (
    <div className="space-y-4">
      {settings.mode === 'bola8' ? (
        <FixedNote label="Bolas">
          La bola 8 usa siempre las quince bolas numeradas: lisas de la 1 a la 7, rayadas de la 9 a
          la 15 y la negra en el centro del triángulo.
        </FixedNote>
      ) : (
        <Field label="Bolas de color">
          <Segmented
            disabled={disabled}
            value={settings.colorBalls}
            options={[6, 9, 12].map((n) => ({ label: String(n), value: n }))}
            onChange={(colorBalls) => onChange({ ...settings, colorBalls })}
          />
        </Field>
      )}
      <Field label="Velocidad del paño">
        <Segmented
          disabled={disabled}
          value={settings.tableFriction}
          options={[
            { label: 'Lenta', value: 'lenta' as const },
            { label: 'Normal', value: 'normal' as const },
            { label: 'Rápida', value: 'rapida' as const },
          ]}
          onChange={(tableFriction) => onChange({ ...settings, tableFriction })}
        />
      </Field>
    </div>
  );
}

/* -------------------------------- Arena --------------------------------- */

function ArenaPanel({ settings, disabled, onChange }: SettingsPanelProps<'arena'>) {
  return (
    <div className="space-y-4">
      <Field label="Velocidad de cierre de la zona">
        <Segmented
          disabled={disabled}
          value={settings.zonePace}
          options={[
            { label: 'Lenta', value: 'lenta' as const },
            { label: 'Normal', value: 'normal' as const },
            { label: 'Rápida', value: 'rapida' as const },
          ]}
          onChange={(zonePace) => onChange({ ...settings, zonePace })}
        />
      </Field>
      <Field label="Objetos en la arena">
        <Segmented
          disabled={disabled}
          value={settings.pickups}
          options={[
            { label: 'Activados', value: true },
            { label: 'Desactivados', value: false },
          ]}
          onChange={(pickups) => onChange({ ...settings, pickups })}
        />
      </Field>
    </div>
  );
}

/* -------------------------------- Karts --------------------------------- */

function KartsPanel({ settings, disabled, onChange }: SettingsPanelProps<'karts'>) {
  const track = KART_TRACKS.find((entry) => entry.id === settings.track);
  return (
    <div className="space-y-4">
      <Field label="Circuito">
        <Segmented
          disabled={disabled}
          value={settings.track}
          options={KART_TRACKS.map((entry) => ({ label: entry.name, value: entry.id }))}
          onChange={(track_) => onChange({ ...settings, track: track_ })}
        />
        {track && <p className="mt-2 text-xs text-slate-400">{track.description}</p>}
      </Field>
      <Field label="Vueltas">
        <Segmented
          disabled={disabled}
          value={settings.laps}
          options={[2, 3, 5].map((n) => ({ label: String(n), value: n as 2 | 3 | 5 }))}
          onChange={(laps) => onChange({ ...settings, laps })}
        />
      </Field>
    </div>
  );
}

/* -------------------------------- Bolos --------------------------------- */

function BowlingPanel({ settings, disabled, onChange }: SettingsPanelProps<'bowling'>) {
  return (
    <Field label="Precisión (desviación que aplica el servidor)">
      <Segmented
        disabled={disabled}
        value={settings.precision}
        options={[
          { label: 'Fácil', value: 'facil' as const },
          { label: 'Normal', value: 'normal' as const },
          { label: 'Difícil', value: 'dificil' as const },
        ]}
        onChange={(precision) => onChange({ ...settings, precision })}
      />
    </Field>
  );
}

/* ------------------------------ Blackjack -------------------------------- */

function BlackjackPanel({ settings, disabled, onChange }: SettingsPanelProps<'blackjack'>) {
  if (settings.mode === 'rapido') {
    return <FixedNote label="Duración">El modo rápido juega siempre tres rondas.</FixedNote>;
  }
  return (
    <Field label="Rondas">
      <Segmented
        disabled={disabled}
        value={settings.rounds}
        options={[3, 5, 7].map((rounds) => ({ label: String(rounds), value: rounds as 3 | 5 | 7 }))}
        onChange={(rounds) => onChange({ ...settings, rounds })}
      />
    </Field>
  );
}

/* ------------------------------- Songless -------------------------------- */

function SonglessPanel({ settings, disabled, onChange }: SettingsPanelProps<'songless'>) {
  if (settings.mode === 'relampago') {
    return <FixedNote label="Duración">Relámpago juega siempre cinco melodías.</FixedNote>;
  }
  return (
    <Field label="Melodías por partida">
      <Segmented
        disabled={disabled}
        value={settings.rounds}
        options={[5, 7, 10].map((rounds) => ({
          label: String(rounds),
          value: rounds as 5 | 7 | 10,
        }))}
        onChange={(rounds) => onChange({ ...settings, rounds })}
      />
    </Field>
  );
}

/* ------------------------------ Air Hockey ------------------------------- */

function AirHockeyPanel({ settings, disabled, onChange }: SettingsPanelProps<'air-hockey'>) {
  if (settings.mode === 'gol-de-oro') {
    return <FixedNote label="Marcador">El primer gol decide la partida.</FixedNote>;
  }
  return (
    <Field label="Goles para ganar">
      <Segmented
        disabled={disabled}
        value={settings.goalLimit}
        options={[5, 7, 9].map((goalLimit) => ({
          label: String(goalLimit),
          value: goalLimit as 5 | 7 | 9,
        }))}
        onChange={(goalLimit) => onChange({ ...settings, goalLimit })}
      />
    </Field>
  );
}

/* ----------------------------- Tenis de mesa ----------------------------- */

function TableTennisPanel({ settings, disabled, onChange }: SettingsPanelProps<'table-tennis'>) {
  if (settings.mode === 'rapido') {
    return <FixedNote label="Marcador">El modo rápido se juega siempre a siete puntos.</FixedNote>;
  }
  return (
    <Field label="Puntos para ganar">
      <Segmented
        disabled={disabled}
        value={settings.pointsToWin}
        options={[7, 11, 15].map((pointsToWin) => ({
          label: String(pointsToWin),
          value: pointsToWin as 7 | 11 | 15,
        }))}
        onChange={(pointsToWin) => onChange({ ...settings, pointsToWin })}
      />
    </Field>
  );
}

/* ------------------------------ Head Soccer ------------------------------ */

function HeadSoccerPanel({ settings, disabled, onChange }: SettingsPanelProps<'head-soccer'>) {
  if (settings.mode === 'gol-de-oro') {
    return <FixedNote label="Marcador">El primer gol decide la partida.</FixedNote>;
  }
  return (
    <Field label="Goles para ganar">
      <Segmented
        disabled={disabled}
        value={settings.goalLimit}
        options={[3, 5, 7].map((goalLimit) => ({
          label: String(goalLimit),
          value: goalLimit as 3 | 5 | 7,
        }))}
        onChange={(goalLimit) => onChange({ ...settings, goalLimit })}
      />
    </Field>
  );
}

/* ---------------------------- Head Basketball ---------------------------- */

function HeadBasketballPanel({
  settings,
  disabled,
  onChange,
}: SettingsPanelProps<'head-basketball'>) {
  if (settings.mode === 'rapido') {
    return <FixedNote label="Marcador">El modo rápido se juega siempre a seis puntos.</FixedNote>;
  }
  return (
    <Field label="Puntos para ganar">
      <Segmented
        disabled={disabled}
        value={settings.pointsToWin}
        options={[6, 10, 14].map((pointsToWin) => ({
          label: String(pointsToWin),
          value: pointsToWin as 6 | 10 | 14,
        }))}
        onChange={(pointsToWin) => onChange({ ...settings, pointsToWin })}
      />
    </Field>
  );
}

/* ------------------------------- Tanques --------------------------------- */

function TanksPanel({ settings, disabled, onChange }: SettingsPanelProps<'tanks'>) {
  const map = TANK_MAPS.find((entry) => entry.id === settings.map);
  return (
    <Field label="Campo de batalla">
      <Segmented
        disabled={disabled}
        value={settings.map}
        options={TANK_MAPS.map((entry) => ({ label: entry.name, value: entry.id }))}
        onChange={(mapId) => onChange({ ...settings, map: mapId })}
      />
      {map && <p className="mt-2 text-xs text-slate-400">{map.description}</p>}
    </Field>
  );
}

/* -------------------------------- Minigolf ------------------------------- */

function GolfPanel({ settings, disabled, onChange }: SettingsPanelProps<'golf'>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Colisión entre bolas">
        <Segmented
          disabled={disabled}
          value={settings.ballCollisions}
          options={[
            { label: 'Activada', value: true },
            { label: 'Desactivada', value: false },
          ]}
          onChange={(ballCollisions) => onChange({ ...settings, ballCollisions })}
        />
      </Field>
      <Field label="Tiempo por hoyo">
        <Segmented
          disabled={disabled}
          value={settings.holeTimeLimitSeconds}
          options={[60, 90, 120].map((n) => ({ label: n + 's', value: n as 60 | 90 | 120 }))}
          onChange={(holeTimeLimitSeconds) => onChange({ ...settings, holeTimeLimitSeconds })}
        />
      </Field>
      <Field label="Límite de golpes">
        <Segmented
          disabled={disabled}
          value={settings.maxStrokes}
          options={[8, 10, 12].map((n) => ({ label: String(n), value: n as 8 | 10 | 12 }))}
          onChange={(maxStrokes) => onChange({ ...settings, maxStrokes })}
        />
      </Field>
      <Field label="Reinicio automático fuera del recorrido">
        <Segmented
          disabled={disabled}
          value={settings.autoResetOutOfBounds}
          options={[
            { label: 'Sí', value: true },
            { label: 'No', value: false },
          ]}
          onChange={(autoResetOutOfBounds) => onChange({ ...settings, autoResetOutOfBounds })}
        />
      </Field>
      <Field label="Penalización al salir">
        <Segmented
          disabled={disabled}
          value={settings.outOfBoundsPenalty}
          options={[
            { label: 'Activada', value: true },
            { label: 'Desactivada', value: false },
          ]}
          onChange={(outOfBoundsPenalty) => onChange({ ...settings, outOfBoundsPenalty })}
        />
      </Field>
    </div>
  );
}

/* -------------------------------- Registro ------------------------------- */

/**
 * Panel de ajustes de cada juego.
 *
 * El tipo obliga a que exista una entrada por cada `GameId`: si manana anades
 * un juego a `GAME_IDS` y olvidas su panel, el typecheck falla aqui en lugar de
 * dejar un hueco silencioso en el lobby.
 */
export const GAME_SETTINGS_PANELS: {
  [K in GameId]: ComponentType<SettingsPanelProps<K>>;
} = {
  quiz: QuizPanel,
  darts: DartsPanel,
  pool: PoolPanel,
  golf: GolfPanel,
  bowling: BowlingPanel,
  karts: KartsPanel,
  arena: ArenaPanel,
  blackjack: BlackjackPanel,
  songless: SonglessPanel,
  'air-hockey': AirHockeyPanel,
  'table-tennis': TableTennisPanel,
  'head-soccer': HeadSoccerPanel,
  'head-basketball': HeadBasketballPanel,
  tanks: TanksPanel,
};

/**
 * Puente entre el juego elegido (un `GameId` cualquiera en tiempo de ejecucion)
 * y su panel, que esta tipado para un juego concreto.
 *
 * La conversion se concentra aqui a proposito: es el unico punto donde
 * TypeScript no puede relacionar la clave con su valor, y a cambio cada panel
 * recibe su tipo exacto sin castings repartidos.
 */
export function GameSettingsPanel({
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
  const Panel = GAME_SETTINGS_PANELS[game] as ComponentType<{
    settings: GameSettings[GameId];
    disabled: boolean;
    onChange: (value: GameSettings[GameId]) => void;
  }>;
  return (
    <Panel
      settings={settings[game]}
      disabled={disabled}
      onChange={(value) => onChange(game, value as GameSettings[typeof game])}
    />
  );
}
