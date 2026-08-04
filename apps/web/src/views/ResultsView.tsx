import { GAME_META, SOLO_RECORD_META, formatSoloRecord } from '@arcade/shared';
import { useApp } from '../store.js';
import { GameIcon, Panel, Scoreboard } from '../components/ui.js';
import { EmptyState } from './StatusViews.js';

export default function ResultsView() {
  const { result, isHost, backToLobby, room, isSolo, soloOutcome } = useApp();
  if (!result || !room) {
    return (
      <EmptyState
        title="Preparando los resultados…"
        description="Estamos sincronizando la clasificación final de todos los jugadores."
      />
    );
  }

  const winners = result.rows.filter((row) => row.rank === 1);
  const unit = result.game === 'golf' ? 'golpes' : result.game === 'darts' ? 'restantes' : 'pts';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-10">
      <Panel className="w-full overflow-hidden p-0 sm:p-0">
        <div
          className="relative overflow-hidden border-b border-white/[0.08] px-6 py-10 text-center sm:px-10"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, ' +
              GAME_META[result.game].accent +
              '30, transparent 58%)',
          }}
        >
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border bg-black/20"
            style={{
              color: GAME_META[result.game].accent,
              borderColor: GAME_META[result.game].accent + '45',
            }}
          >
            <GameIcon game={result.game} size={34} />
          </div>
          <p className="eyebrow mt-5">Partida completada · {GAME_META[result.game].name}</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">
            {winners.length > 1 ? 'Empate en la cima' : winners[0]?.name + ' gana'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {winners.length > 1
              ? 'La primera posición se comparte. Habrá que resolverlo con otra partida.'
              : 'Una victoria para recordar. La revancha está a un clic.'}
          </p>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {isSolo && soloOutcome && (
            <div
              className={
                'mb-5 rounded-2xl border px-4 py-4 ' +
                (soloOutcome.improved
                  ? 'border-neon-lime/30 bg-neon-lime/[0.07]'
                  : 'border-white/[0.08] bg-white/[0.03]')
              }
            >
              <p className="font-display text-sm font-black uppercase tracking-[0.14em]">
                {soloOutcome.improved
                  ? soloOutcome.previousValue === null
                    ? 'Primera marca registrada'
                    : '¡Nuevo récord personal!'
                  : 'Marca de esta partida'}
              </p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-300">
                <span className="text-slate-500">{SOLO_RECORD_META[soloOutcome.game].label}:</span>
                <span
                  className="font-display text-xl font-black"
                  style={{ color: GAME_META[soloOutcome.game].accent }}
                >
                  {formatSoloRecord(soloOutcome.game, soloOutcome.value)}
                </span>
                <span className="text-slate-500">{soloOutcome.detail}</span>
              </p>
              {!soloOutcome.improved && (
                <p className="mt-1 text-xs text-slate-500">
                  Tu mejor marca sigue siendo{' '}
                  {formatSoloRecord(soloOutcome.game, soloOutcome.record.value)}.{' '}
                  {SOLO_RECORD_META[soloOutcome.game].goal}
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-600">
                {soloOutcome.record.plays}{' '}
                {soloOutcome.record.plays === 1 ? 'partida jugada' : 'partidas jugadas'} ·{' '}
                {soloOutcome.record.wins} {soloOutcome.record.wins === 1 ? 'victoria' : 'victorias'}
              </p>
            </div>
          )}

          <Scoreboard rows={result.rows} unit={unit} />

          {result.game === 'golf' && result.extra ? (
            <p className="mt-4 text-sm text-slate-400">
              Hoyos en uno:{' '}
              {result.rows
                .map((row) => {
                  const aces = (result.extra?.aces as Record<string, number>)?.[row.playerId] ?? 0;
                  return row.name + ' ' + aces;
                })
                .join(' | ')}
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 border-t border-white/[0.07] pt-6">
            {isHost ? (
              <button className="btn-primary min-w-48" onClick={backToLobby}>
                {isSolo ? 'Volver a intentarlo' : 'Preparar revancha'}
              </button>
            ) : (
              <p className="text-sm text-slate-400">
                Esperando a que el anfitrión vuelva al lobby...
              </p>
            )}
          </div>
        </div>
      </Panel>
    </main>
  );
}
