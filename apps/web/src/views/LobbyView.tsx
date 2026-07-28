import {
  GAME_IDS,
  GAME_META,
  MIN_PLAYERS,
  QUIZ_CATEGORIES,
  type GameId,
  type GolfSettings,
} from '@arcade/shared';
import { useState } from 'react';
import { useApp } from '../store.js';
import { ErrorBanner, PlayerIconGlyph, Panel } from '../components/ui.js';

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

  if (!room || !me) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const canStart = room.players.length >= MIN_PLAYERS;
  const inviteUrl =
    typeof window !== 'undefined' ? window.location.origin + '/?code=' + room.code : room.inviteUrl;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <ErrorBanner error={error} onDismiss={dismissError} />

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Sala privada</p>
          <h1 className="font-display text-3xl font-black tracking-[0.3em]">{room.code}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => copy(room.code, 'codigo')}>
            {copied === 'codigo' ? 'Codigo copiado' : 'Copiar codigo'}
          </button>
          <button className="btn-secondary" onClick={() => copy(inviteUrl, 'enlace')}>
            {copied === 'enlace' ? 'Enlace copiado' : 'Copiar invitacion'}
          </button>
          <button className="btn-danger" onClick={leaveRoom}>
            Salir
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel title="Jugadores" subtitle={room.players.length + ' / ' + room.maxPlayers}>
          <ul className="space-y-2">
            {room.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerIconGlyph icon={player.icon} color={player.color} />
                  <span className="truncate font-medium">{player.name}</span>
                  {player.isHost && <span className="chip px-2 py-0.5 text-[10px]">Anfitrion</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      'h-2 w-2 rounded-full ' +
                      (player.connection === 'connected' ? 'bg-neon-lime' : 'bg-amber-400')
                    }
                    title={player.connection === 'connected' ? 'Conectado' : 'Desconectado'}
                  />
                  <span
                    className={'text-xs ' + (player.ready ? 'text-neon-lime' : 'text-slate-500')}
                  >
                    {player.ready ? 'Listo' : 'Esperando'}
                  </span>
                  {isHost && player.id !== me.id && (
                    <>
                      <button
                        className="btn-secondary px-2 py-1 text-[10px]"
                        onClick={() => transferHost(player.id)}
                        title="Transferir anfitrion"
                      >
                        Host
                      </button>
                      <button
                        className="btn-danger px-2 py-1 text-[10px]"
                        onClick={() => kickPlayer(player.id)}
                      >
                        Expulsar
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2">
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
            {!canStart && (
              <p className="text-center text-xs text-amber-300">
                Se necesitan al menos {MIN_PLAYERS} jugadores.
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Elige el juego"
            subtitle={isHost ? 'Solo el anfitrion decide' : 'El anfitrion decide'}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {GAME_IDS.map((id) => {
                const active = room.selectedGame === id;
                return (
                  <button
                    key={id}
                    onClick={() => isHost && selectGame(id)}
                    disabled={!isHost}
                    className={
                      'rounded-xl border p-4 text-left transition ' +
                      (active
                        ? 'border-transparent bg-white/10 shadow-glow'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]') +
                      (isHost ? '' : ' cursor-not-allowed opacity-70')
                    }
                    style={active ? { borderColor: GAME_META[id].accent } : undefined}
                  >
                    <span
                      className="font-display text-base font-bold"
                      style={{ color: GAME_META[id].accent }}
                    >
                      {GAME_META[id].name}
                    </span>
                    <p className="mt-1 text-xs text-slate-400">{GAME_META[id].tagline}</p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={'Configuracion de ' + GAME_META[room.selectedGame].name}
            subtitle="Se bloquea al empezar la partida"
          >
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
        <Field label="Numero de preguntas">
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
        <Field label="Categorias (vacio = todas)">
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
                  {category}
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
      <Field label="Precision (desviacion aplicada por el servidor)">
        <Segmented
          disabled={disabled}
          value={darts.aimAssist}
          options={[
            { label: 'Facil', value: 'facil' as const },
            { label: 'Normal', value: 'normal' as const },
            { label: 'Dificil', value: 'dificil' as const },
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
        <Field label="Bolas de color">
          <Segmented
            disabled={disabled}
            value={pool.colorBalls}
            options={[6, 9, 12].map((n) => ({ label: String(n), value: n }))}
            onChange={(colorBalls) => onChange('pool', { ...pool, colorBalls })}
          />
        </Field>
        <Field label="Velocidad del pano">
          <Segmented
            disabled={disabled}
            value={pool.tableFriction}
            options={[
              { label: 'Lenta', value: 'lenta' as const },
              { label: 'Normal', value: 'normal' as const },
              { label: 'Rapida', value: 'rapida' as const },
            ]}
            onChange={(tableFriction) => onChange('pool', { ...pool, tableFriction })}
          />
        </Field>
      </div>
    );
  }

  const golf: GolfSettings = settings.golf;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Colision entre bolas">
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
      <Field label="Limite de golpes">
        <Segmented
          disabled={disabled}
          value={golf.maxStrokes}
          options={[8, 10, 12].map((n) => ({ label: String(n), value: n as 8 | 10 | 12 }))}
          onChange={(maxStrokes) => onChange('golf', { ...golf, maxStrokes })}
        />
      </Field>
      <Field label="Reinicio automatico fuera del recorrido">
        <Segmented
          disabled={disabled}
          value={golf.autoResetOutOfBounds}
          options={[
            { label: 'Si', value: true },
            { label: 'No', value: false },
          ]}
          onChange={(autoResetOutOfBounds) => onChange('golf', { ...golf, autoResetOutOfBounds })}
        />
      </Field>
      <Field label="Penalizacion al salir">
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
