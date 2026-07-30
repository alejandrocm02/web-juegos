import { GAME_META } from '@arcade/shared';
import { useApp } from '../store.js';
import { BackButton, type ExitAction } from './navigation.js';

/**
 * Barra fija durante una partida con la salida hacia el lobby.
 *
 * El anfitrion devuelve a todo el mundo al lobby; el resto abandona la sala.
 * En ambos casos se confirma antes, porque la accion afecta a los demas.
 */
export function GameExitBar() {
  const { room, isHost, backToLobby, leaveRoom, gameState } = useApp();
  if (!room) return null;

  const others = room.players.length - 1;
  const action: ExitAction = isHost
    ? {
        label: 'Volver al lobby',
        confirm: {
          title: 'Terminar la partida',
          description:
            others > 0
              ? 'Eres el anfitrion: la partida terminara para los ' +
                others +
                ' jugadores restantes y todos volvereis al lobby.'
              : 'La partida terminara y volveras al lobby.',
          confirmLabel: 'Terminar y volver',
        },
        run: backToLobby,
      }
    : {
        label: 'Abandonar',
        confirm: {
          title: 'Abandonar la partida',
          description:
            'Saldras de la sala y tu puesto se liberara. Los demas seguiran jugando sin ti.',
          confirmLabel: 'Abandonar',
        },
        run: leaveRoom,
      };

  return (
    <div className="game-exit-bar sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-2">
        <BackButton action={action} />
        <span className="truncate text-sm text-slate-300">
          <span className="font-semibold text-white">
            {gameState ? GAME_META[gameState.game].name : 'Partida'}
          </span>
          <span className="hidden sm:inline"> · Sala {room.code}</span>
        </span>
      </div>
    </div>
  );
}
