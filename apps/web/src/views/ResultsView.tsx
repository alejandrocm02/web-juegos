import { GAME_META } from '@arcade/shared';
import { useApp } from '../store.js';
import { Panel, Scoreboard } from '../components/ui.js';

export default function ResultsView() {
  const { result, isHost, backToLobby, room } = useApp();
  if (!result || !room) return null;

  const winners = result.rows.filter((row) => row.rank === 1);
  const unit = result.game === 'golf' ? 'golpes' : result.game === 'darts' ? 'restantes' : 'pts';

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Panel
        title={'Resultado | ' + GAME_META[result.game].name}
        subtitle={winners.length > 1 ? 'Empate compartido' : 'Enhorabuena ' + winners[0]?.name}
      >
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

        <div className="mt-6 flex flex-wrap gap-3">
          {isHost ? (
            <button className="btn-primary" onClick={backToLobby}>
              Volver al lobby
            </button>
          ) : (
            <p className="text-sm text-slate-400">
              Esperando a que el anfitrion vuelva al lobby...
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}
