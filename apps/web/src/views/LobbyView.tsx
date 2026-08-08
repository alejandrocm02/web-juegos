import {
  GAME_IDS,
  GAME_META,
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_META,
  TOURNAMENT_PRESETS,
  botRangeFor,
  soloUsesBots,
  type GameId,
} from '@arcade/shared';
import { useState } from 'react';
import { useNotices, useRoom } from '../store.js';
import { ErrorBanner, GameIcon, PlayerIconGlyph, Panel } from '../components/ui.js';
import { BackButton } from '../components/navigation.js';
import { ModeSelector } from '../components/settings/ModeSelector.js';
import { GameSettingsPanel } from '../components/settings/panels.js';
import { TournamentPanel, TournamentStandings } from '../components/settings/TournamentPanel.js';
import { ChatPanel } from '../components/Chat.js';
import { EmptyState } from './StatusViews.js';
import { RecordsPanel } from './RecordsPanel.js';

export default function LobbyView() {
  const {
    room,
    me,
    isHost,
    isSolo,
    records,
    selectGame,
    updateSettings,
    updateSoloConfig,
    setReady,
    startGame,
    kickPlayer,
    transferHost,
    leaveRoom,
    setTournament,
  } = useRoom();
  const { error, dismissError } = useNotices();
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

  // Los bots no cuentan como jugadores conectados: nunca bloquean el inicio.
  const humanPlayers = room.players.filter((player) => !player.isBot);
  const connectedPlayers = humanPlayers.filter((player) => player.connection === 'connected');
  const botPlayers = room.players.filter((player) => player.isBot);
  const allReady = connectedPlayers.every((player) => player.ready);
  const canStart = connectedPlayers.length >= room.minPlayers && allReady;
  const currentMode = room.settings[room.selectedGame].mode;
  const botRange = botRangeFor(room.selectedGame);
  // Durante un torneo el orden de las pruebas manda: nadie cambia de juego a
  // mitad, ni siquiera el anfitrion.
  const tournamentRunning = Boolean(room.tournament && !room.tournament.finished);
  const canPickGame = isHost && !tournamentRunning;
  // Con rivales del servidor la sala cuenta como partida normal a efectos de modos.
  const participants = isSolo ? 1 + botPlayers.length : room.players.length;

  /** Cambia el modo conservando el resto de opciones del juego. */
  const applyMode = (game: GameId, mode: string) => {
    const current = room.settings[game];
    updateSettings(game, { ...current, mode } as never);
  };
  // El servidor envia la ruta relativa; el origen lo pone el navegador, que es
  // el unico que sabe con que dominio ha llegado el jugador.
  const inviteUrl =
    typeof window !== 'undefined' ? window.location.origin + room.inviteUrl : room.inviteUrl;

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
              <p className="eyebrow">
                {isSolo ? 'Práctica en solitario' : 'Sala privada'} ·{' '}
                {GAME_META[room.selectedGame].name}
              </p>
              <h1 className="mt-1 font-display text-3xl font-black tracking-[0.24em] sm:text-4xl">
                {isSolo ? 'ENTRENAMIENTO' : room.code}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isSolo && (
              <>
                <button className="btn-secondary" onClick={() => copy(room.code, 'codigo')}>
                  {copied === 'codigo' ? '✓ Código copiado' : 'Copiar código'}
                </button>
                <button className="btn-secondary" onClick={() => copy(inviteUrl, 'enlace')}>
                  {copied === 'enlace' ? '✓ Enlace copiado' : 'Invitar amigos'}
                </button>
              </>
            )}
            <BackButton
              className="btn-danger"
              action={{
                label: isSolo ? 'Salir del entrenamiento' : 'Salir de la sala',
                confirm: {
                  title: isSolo ? 'Salir del entrenamiento' : 'Salir de la sala',
                  description: isSolo
                    ? 'Se cerrará la práctica. Tus marcas personales se conservan.'
                    : humanPlayers.length > 1
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
          title={isSolo ? 'Tu partida' : 'Tu equipo'}
          subtitle={
            isSolo
              ? botPlayers.length === 0
                ? 'Sin rivales · solo tu marca'
                : botPlayers.length +
                  (botPlayers.length === 1 ? ' rival' : ' rivales') +
                  ' del servidor'
              : connectedPlayers.length +
                ' conectados · ' +
                room.players.length +
                '/' +
                room.maxPlayers
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
                        {player.isBot
                          ? 'Rival del servidor'
                          : player.isHost
                            ? 'Anfitrión'
                            : player.ready
                              ? 'Preparado'
                              : 'En espera'}
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
                    {player.isBot ? 'Bot' : player.ready ? 'Listo' : 'Espera'}
                  </span>
                </div>
                {isHost && !isSolo && player.id !== me.id && (
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

          {isSolo && soloUsesBots(room.selectedGame) && (
            <div className="mt-5 space-y-3 border-t border-white/[0.07] pt-5">
              <div>
                <span className="label mb-2 block">Dificultad</span>
                <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                  {BOT_DIFFICULTIES.map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      aria-pressed={room.soloConfig.botDifficulty === difficulty}
                      onClick={() =>
                        updateSoloConfig({ ...room.soloConfig, botDifficulty: difficulty })
                      }
                      className={
                        'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ' +
                        (room.soloConfig.botDifficulty === difficulty
                          ? 'bg-white/[0.1] text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-300')
                      }
                    >
                      {BOT_DIFFICULTY_META[difficulty].name}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                  {BOT_DIFFICULTY_META[room.soloConfig.botDifficulty].description}
                </p>
              </div>
              <div>
                <label className="label mb-2 block" htmlFor="lobby-bot-count">
                  Rivales: {room.soloConfig.botCount}
                </label>
                <input
                  id="lobby-bot-count"
                  type="range"
                  min={botRange.min}
                  max={botRange.max}
                  step={1}
                  value={room.soloConfig.botCount}
                  onChange={(event) =>
                    updateSoloConfig({
                      ...room.soloConfig,
                      botCount: Number(event.target.value),
                    })
                  }
                  className="w-full accent-neon-cyan"
                />
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-5">
            {!isSolo && (
              <button
                className={me.ready ? 'btn-secondary w-full' : 'btn-primary w-full'}
                onClick={() => setReady(!me.ready)}
              >
                {me.ready ? 'Cancelar preparado' : 'Estoy listo'}
              </button>
            )}
            {isHost && (
              <button className="btn-primary w-full" onClick={startGame} disabled={!canStart}>
                {isSolo ? 'Empezar' : 'Iniciar'} {GAME_META[room.selectedGame].name}
              </button>
            )}
            {connectedPlayers.length < room.minPlayers ? (
              <p className="text-center text-xs leading-5 text-amber-300">
                Faltan {room.minPlayers - connectedPlayers.length}{' '}
                {room.minPlayers - connectedPlayers.length === 1
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

          {isSolo && records.length > 0 && (
            <div className="mt-5 border-t border-white/[0.07] pt-5">
              <p className="label mb-2">Tus marcas</p>
              <RecordsPanel records={records} highlight={room.selectedGame} />
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          {!isSolo && (
            <Panel title="Chat de la sala" subtitle="Últimos mensajes y reacciones">
              <ChatPanel />
            </Panel>
          )}

          {!isSolo && (
            <Panel
              title="Torneo"
              subtitle={
                room.tournament
                  ? 'Las pruebas se juegan en orden'
                  : 'Encadena varias pruebas en una sola velada'
              }
            >
              <TournamentPanel
                tournament={room.tournament}
                disabled={!isHost}
                onToggle={(enabled) =>
                  setTournament(enabled ? TOURNAMENT_PRESETS.relampago.games : null)
                }
                onGamesChange={(games) => setTournament(games)}
              />
              {room.tournament && room.tournament.rounds.length > 0 && (
                <div className="mt-4">
                  <span className="label">Clasificación general</span>
                  <TournamentStandings tournament={room.tournament} />
                </div>
              )}
            </Panel>
          )}

          <Panel
            title={room.tournament ? 'Prueba en juego' : 'Elige el juego'}
            subtitle={
              room.tournament
                ? 'Lo decide el orden del torneo'
                : isHost
                  ? 'Solo el anfitrión decide'
                  : 'El anfitrión decide'
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {GAME_IDS.map((id) => {
                const active = room.selectedGame === id;
                return (
                  <button
                    key={id}
                    onClick={() => canPickGame && selectGame(id)}
                    disabled={!canPickGame}
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
                      (canPickGame ? '' : ' cursor-not-allowed opacity-70')
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
              participants={participants}
              onChange={(mode) => applyMode(room.selectedGame, mode)}
            />

            <GameSettingsPanel
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
