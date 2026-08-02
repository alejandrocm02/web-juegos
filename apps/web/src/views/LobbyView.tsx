import {
  GAME_IDS,
  GAME_META,
  GAME_MODE_CATALOG,
  MIN_PLAYERS,
  QUIZ_CATEGORIES,
  type GameId,
  KART_TRACKS,
  type ArenaSettings,
  type BowlingSettings,
  type KartsSettings,
  type GolfSettings,
  type BlackjackSettings,
  type SonglessSettings,
} from '@arcade/shared';
import { useState } from 'react';
import { useApp } from '../store.js';
import { ErrorBanner, GameIcon, PlayerIconGlyph, Panel } from '../components/ui.js';
import { BackButton } from '../components/navigation.js';
import { quizCategoryLabel } from '../lib/format.js';
import { EmptyState } from './StatusViews.js';

export default function LobbyView() {
  const {
    room,
    me,
    isHost,
    selectGame,
    updateSettings,
    setReady,
    startGame,
    kickPlayer,
    transferHost,
    leaveRoom,
    error,
    dismissError,
  } = useApp();
  const [copied, setCopied] = useState<string | null>(null);

  if (!room || !me) {
    return (
      <EmptyState
        title="Recuperando tu sesión…"
        description="Estamos volviendo a enlazar tu jugador con la sala."
      />
    );
  }

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const connectedPlayers = room.players.filter((player) => player.connection === 'connected');
  const allReady = connectedPlayers.every((player) => player.ready);
  const canStart = connectedPlayers.length >= MIN_PLAYERS && allReady;
  const currentMode = room.settings[room.selectedGame].mode;

  /** Cambia el modo conservando el resto de opciones del juego. */
  const applyMode = (game: GameId, mode: string) => {
    const current = room.settings[game];
    updateSettings(game, { ...current, mode } as never);
  };
  const inviteUrl =
    typeof window !== 'undefined' ? window.location.origin + '/?code=' + room.code : room.inviteUrl;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ErrorBanner error={error} onDismiss={dismissError} />

      <header className="relative mb-6 overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] px-5 py-5 sm:px-7">
        <div
          className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full opacity-20 blur-3xl"
          style={{ background: GAME_META[room.selectedGame].accent }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span
              className="game-icon-shell hidden sm:flex"
              style={
                {
                  '--game-accent': GAME_META[room.selectedGame].accent,
                } as React.CSSProperties
              }
            >
              <GameIcon game={room.selectedGame} />
            </span>
            <div>
              <p className="eyebrow">Sala privada · {GAME_META[room.selectedGame].name}</p>
              <h1 className="mt-1 font-display text-3xl font-black tracking-[0.24em] sm:text-4xl">
                {room.code}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => copy(room.code, 'codigo')}>
              {copied === 'codigo' ? '✓ Código copiado' : 'Copiar código'}
            </button>
            <button className="btn-secondary" onClick={() => copy(inviteUrl, 'enlace')}>
              {copied === 'enlace' ? '✓ Enlace copiado' : 'Invitar amigos'}
            </button>
            <BackButton
              className="btn-danger"
              action={{
                label: 'Salir de la sala',
                confirm: {
                  title: 'Salir de la sala',
                  description:
                    room.players.length > 1
                      ? 'Los demás jugadores seguirán en la sala. Si eres el anfitrión, el rol pasará a otro jugador.'
                      : 'La sala quedará vacía y se eliminará en unos minutos.',
                  confirmLabel: 'Salir',
                },
                run: leaveRoom,
              }}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel
          title="Tu equipo"
          subtitle={
            connectedPlayers.length + ' conectados · ' + room.players.length + '/' + room.maxPlayers
          }
          className="h-fit lg:sticky lg:top-6"
        >
          <ul className="space-y-2.5">
            {room.players.map((player) => (
              <li
                key={player.id}
                className={
                  'rounded-2xl border px-3.5 py-3 transition ' +
                  (player.id === me.id
                    ? 'border-neon-cyan/20 bg-neon-cyan/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.035]')
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-black/20"
                      style={{ borderColor: player.color + '35' }}
                    >
                      <PlayerIconGlyph icon={player.icon} color={player.color} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{player.name}</span>
                        {player.id === me.id && (
                          <span className="text-[10px] text-slate-500">Tú</span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span
                          className={
                            'h-1.5 w-1.5 rounded-full ' +
                            (player.connection === 'connected' ? 'bg-neon-lime' : 'bg-amber-400')
                          }
                        />
                        {player.isHost ? 'Anfitrión' : player.ready ? 'Preparado' : 'En espera'}
                      </span>
                    </span>
                  </span>
                  <span
                    className={
                      'rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ' +
                      (player.ready
                        ? 'bg-neon-lime/10 text-neon-lime'
                        : 'bg-white/5 text-slate-600')
                    }
                  >
                    {player.ready ? 'Listo' : 'Espera'}
                  </span>
                </div>
                {isHost && player.id !== me.id && (
                  <div className="mt-2.5 flex gap-2 border-t border-white/[0.05] pt-2.5">
                    <button
                      className="btn-secondary min-h-8 flex-1 px-2 py-1 text-[10px]"
                      onClick={() => transferHost(player.id)}
                      disabled={player.connection !== 'connected'}
                      title="Transferir anfitrión"
                    >
                      Hacer host
                    </button>
                    <button
                      className="btn-danger min-h-8 px-2 py-1 text-[10px]"
                      onClick={() => kickPlayer(player.id)}
                    >
                      Expulsar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-5">
            <button
              className={me.ready ? 'btn-secondary w-full' : 'btn-primary w-full'}
              onClick={() => setReady(!me.ready)}
            >
              {me.ready ? 'Cancelar preparado' : 'Estoy listo'}
            </button>
            {isHost && (
              <button className="btn-primary w-full" onClick={startGame} disabled={!canStart}>
                Iniciar {GAME_META[room.selectedGame].name}
              </button>
            )}
            {connectedPlayers.length < MIN_PLAYERS ? (
              <p className="text-center text-xs leading-5 text-amber-300">
                Faltan {MIN_PLAYERS - connectedPlayers.length}{' '}
                {MIN_PLAYERS - connectedPlayers.length === 1
                  ? 'jugador conectado'
                  : 'jugadores conectados'}
                .
              </p>
            ) : !allReady ? (
              <p className="text-center text-xs leading-5 text-slate-500">
                Todos deben marcar “Estoy listo” para comenzar.
              </p>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Elige el juego"
            subtitle={isHost ? 'Solo el anfitrión decide' : 'El anfitrión decide'}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {GAME_IDS.map((id) => {
                const active = room.selectedGame === id;
                return (
                  <button
                    key={id}
                    onClick={() => isHost && selectGame(id)}
                    disabled={!isHost}
                    // El nombre accesible seria "Quiz 10 preguntas a contrarreloj" y
                    // chocaria con el boton "Iniciar Quiz". Con aria-label la tarjeta
                    // se anuncia por su juego y queda identificable sin ambiguedad.
                    aria-label={GAME_META[id].name}
                    aria-pressed={active}
                    className={
                      'group rounded-2xl border p-4 text-left transition duration-200 ' +
                      (active
                        ? 'bg-white/[0.08] shadow-glow'
                        : 'border-white/[0.08] bg-white/[0.025] hover:-translate-y-0.5 hover:bg-white/[0.055]') +
                      (isHost ? '' : ' cursor-not-allowed opacity-70')
                    }
                    style={active ? { borderColor: GAME_META[id].accent } : undefined}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/20"
                        style={{ color: GAME_META[id].accent }}
                      >
                        <GameIcon game={id} size={22} />
                      </span>
                      <span>
                        <span
                          className="block font-display text-base font-bold"
                          style={{ color: active ? GAME_META[id].accent : undefined }}
                        >
                          {GAME_META[id].name}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {GAME_META[id].tagline}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={'Modo y configuración de ' + GAME_META[room.selectedGame].name}
            subtitle="Se bloquea al empezar la partida"
          >
            <ModeSelector
              game={room.selectedGame}
              value={currentMode}
              disabled={!isHost}
              onChange={(mode) => applyMode(room.selectedGame, mode)}
            />

            <GameSettingsForm
              game={room.selectedGame}
              settings={room.settings}
              disabled={!isHost}
              onChange={updateSettings}
            />
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={
            'rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ' +
            (option.value === value
              ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModeSelector({
  game,
  value,
  disabled,
  onChange,
}: {
  game: GameId;
  value: string;
  disabled: boolean;
  onChange: (mode: string) => void;
}) {
  const modes = GAME_MODE_CATALOG[game];
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

function GameSettingsForm({
  game,
  settings,
  disabled,
  onChange,
}: {
  game: GameId;
  settings: import('@arcade/shared').GameSettings;
  disabled: boolean;
  onChange: <K extends GameId>(game: K, value: import('@arcade/shared').GameSettings[K]) => void;
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
    </div>
  );
}
