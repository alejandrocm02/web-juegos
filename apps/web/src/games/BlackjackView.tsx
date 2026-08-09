import type { BlackjackCard, BlackjackPublicState, BlackjackRoundResult } from '@arcade/shared';
import { Countdown, Panel, PlayerIconGlyph } from '../components/ui.js';
import { useApp } from '../store.js';

const SUIT_GLYPH: Record<BlackjackCard['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RESULT_LABEL: Record<BlackjackRoundResult, string> = {
  win: 'Victoria +2',
  loss: 'Pierdes',
  push: 'Empate +1',
  blackjack: 'Blackjack',
};

function PlayingCard({ card }: { card: BlackjackCard | null }) {
  if (!card) {
    return (
      <span
        className="flex h-24 w-[4.3rem] items-center justify-center rounded-xl border-2 border-white/70 shadow-xl sm:h-28 sm:w-20"
        style={{
          background:
            'repeating-linear-gradient(135deg, #10294c 0 7px, #df3347 7px 10px, #10294c 10px 17px)',
        }}
        aria-label="Carta oculta"
      >
        <span className="rounded-md border border-white/50 bg-black/30 px-2 py-1 text-lg">◆</span>
      </span>
    );
  }
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <span
      className={
        'relative flex h-24 w-[4.3rem] shrink-0 flex-col rounded-xl border border-white/80 bg-slate-50 p-2 shadow-xl sm:h-28 sm:w-20 ' +
        (red ? 'text-red-600' : 'text-slate-950')
      }
      aria-label={card.rank + ' de ' + card.suit}
    >
      <strong className="font-display text-xl leading-none">{card.rank}</strong>
      <span className="text-xl leading-none">{SUIT_GLYPH[card.suit]}</span>
      <span className="absolute bottom-2 right-2 text-3xl">{SUIT_GLYPH[card.suit]}</span>
    </span>
  );
}

export default function BlackjackView({ state }: { state: BlackjackPublicState }) {
  const { room, session, sendAction } = useApp();
  const myId = session?.playerId ?? '';
  const myHand = state.hands[myId];
  const isMyTurn = state.phase === 'playing' && state.activePlayerId === myId;
  const dealerMessage =
    state.phase === 'playing'
      ? 'Una carta permanece oculta'
      : state.dealerTotal && state.dealerTotal > 21
        ? 'El crupier se pasa'
        : 'Mano revelada';

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section
        className="relative overflow-hidden rounded-[1.6rem] border border-emerald-300/15 p-4 shadow-2xl sm:p-6"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(16,115,79,.92), rgba(5,48,38,.98) 55%, #071c1b 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-3 rounded-[6rem] border border-amber-200/20" />
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="eyebrow text-amber-200">Mesa del crupier</p>
            <h2 className="mt-1 font-display text-2xl font-black">
              {state.dealerTotal === null ? 'Total oculto' : state.dealerTotal + ' puntos'}
            </h2>
            <p className="mt-1 text-xs text-emerald-100/65">{dealerMessage}</p>
          </div>
          <span className="chip border-amber-200/25 bg-black/20 text-amber-100">
            Ronda {state.round}/{state.totalRounds}
          </span>
        </header>

        <div className="relative z-10 flex min-h-40 items-center justify-center gap-2 py-6 sm:gap-3">
          {state.dealerCards.map((card, index) => (
            <PlayingCard key={index} card={card} />
          ))}
        </div>

        <div className="relative z-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.order.map((playerId) => {
            const player = room?.players.find((entry) => entry.id === playerId);
            const hand = state.hands[playerId];
            if (!player || !hand) return null;
            const active = playerId === state.activePlayerId && state.phase === 'playing';
            const result = state.roundResults[playerId];
            return (
              <article
                key={playerId}
                className={
                  'rounded-2xl border bg-black/25 p-3 backdrop-blur-xs transition ' +
                  (active
                    ? 'border-amber-300/80 shadow-[0_0_28px_rgba(245,196,81,.22)]'
                    : 'border-white/10')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <PlayerIconGlyph icon={player.icon} color={player.color} size={15} />
                    {player.name}
                    {playerId === myId && <small className="text-emerald-200/60">Tú</small>}
                  </span>
                  <strong className="font-display text-lg text-amber-100">{hand.total}</strong>
                </div>
                <div className="mt-3 flex min-h-20 gap-1.5 overflow-x-auto pb-1">
                  {hand.cards.map((card, index) => (
                    <span
                      key={index}
                      className="origin-bottom scale-75 first:ml-[-.55rem] sm:scale-[.82]"
                    >
                      <PlayingCard card={card} />
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-emerald-100/60">
                    {hand.blackjack
                      ? 'Blackjack natural'
                      : hand.bust
                        ? 'Te has pasado'
                        : hand.soft
                          ? 'Mano suave'
                          : hand.status === 'stood'
                            ? 'Plantado'
                            : active
                              ? 'Decidiendo…'
                              : 'En espera'}
                  </span>
                  {result && (
                    <span
                      className={
                        'font-bold ' + (result === 'loss' ? 'text-rose-300' : 'text-amber-200')
                      }
                    >
                      {RESULT_LABEL[result]}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="relative z-10 mt-5 flex min-h-16 flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
          {isMyTurn ? (
            <>
              <button
                className="btn-primary min-w-36"
                onClick={() => sendAction({ type: 'blackjack:hit' })}
              >
                Pedir carta
              </button>
              <button
                className="btn-secondary min-w-36 border-amber-200/30"
                onClick={() => sendAction({ type: 'blackjack:stand' })}
              >
                Plantarse
              </button>
              <span className="chip text-amber-100">
                <Countdown deadline={state.deadline} />
              </span>
            </>
          ) : (
            <p className="text-center text-sm text-emerald-50/70">
              {state.phase === 'dealer'
                ? 'El crupier revela y completa su mano…'
                : state.phase === 'round-over'
                  ? 'Ronda resuelta. La siguiente mano está a punto de empezar.'
                  : myHand?.bust
                    ? 'Te has pasado. Espera al resto de la mesa.'
                    : state.phase === 'playing'
                      ? 'Espera a que llegue tu turno.'
                      : 'Partida completada.'}
            </p>
          )}
        </div>
      </section>

      <Panel title="Marcador de la mesa" subtitle="Puntos acumulados">
        <ol className="space-y-2">
          {state.order
            .slice()
            .sort((a, b) => (state.points[b] ?? 0) - (state.points[a] ?? 0))
            .map((playerId, index) => {
              const player = room?.players.find((entry) => entry.id === playerId);
              if (!player) return null;
              return (
                <li key={playerId} className="score-row">
                  <span className="score-row-player">
                    <span className="score-rank">{index + 1}</span>
                    <PlayerIconGlyph icon={player.icon} color={player.color} size={16} />
                    <span className="font-semibold">{player.name}</span>
                  </span>
                  <span className="score-value">
                    <strong>{state.points[playerId] ?? 0}</strong>
                    <small>pts</small>
                  </span>
                </li>
              );
            })}
        </ol>
        <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
          <p>Blackjack: {state.mode === 'alto-riesgo' ? 4 : 3} pts</p>
          <p>Victoria: 2 pts · Empate: 1 pt</p>
        </div>
      </Panel>
    </div>
  );
}
