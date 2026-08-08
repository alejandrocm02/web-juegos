import { useEffect, useMemo, useState } from 'react';
import { GAME_META, GAME_MODE_CATALOG, type GameId, type GamePublicState } from '@arcade/shared';
import { useMatch, useRoom } from '../store.js';
import { GameIcon, PlayerIconGlyph } from './ui.js';
import { describeGameEvent, type Highlight } from './highlights.js';

/**
 * Marco comun de todos los juegos. Aporta la identidad visual por juego (a
 * traves de variables CSS), la cabecera con turno y modo, la ayuda en pantalla
 * y los estados de espera o reconexion. Cada vista de juego sigue siendo
 * responsable de su propio tablero.
 */

/** Controles de cada juego, tal y como se explican al jugador. */
const GAME_CONTROLS: Record<GameId, string[]> = {
  pool: [
    'Arrastra desde la bola blanca en sentido contrario al golpe.',
    'La longitud del arrastre marca la potencia; suelta para tirar.',
    'Solo puede tirar el jugador activo.',
  ],
  quiz: [
    'Pulsa una de las cuatro respuestas antes de que acabe el tiempo.',
    'Responder rápido da bonificación.',
    'Las respuestas se revelan cuando contestan todos o se agota el tiempo.',
  ],
  darts: [
    'Mueve el cursor sobre la diana y haz clic para lanzar.',
    'El servidor aplica una pequeña desviación: apunta con margen.',
    'Tres dardos por turno.',
  ],
  golf: [
    'Mantén pulsado sobre tu bola y arrastra en sentido contrario.',
    'La línea marca la dirección y la barra la potencia.',
    'Solo puedes golpear con la bola prácticamente detenida.',
  ],
  bowling: [
    'Ajusta dirección, potencia y efecto antes de lanzar.',
    'Dos tiradas por frame salvo strike.',
    'El décimo frame puede dar tiradas extra.',
  ],
  karts: [
    'Acelera con W o flecha arriba y gira con A y D.',
    'Freno con S o flecha abajo.',
    'Pasa por todos los checkpoints antes de cruzar la meta.',
  ],
  arena: [
    'Muévete con WASD o las flechas.',
    'Apunta con el ratón y ataca con clic o espacio.',
    'Mantén la zona segura a la vista: fuera pierdes vida.',
  ],
  blackjack: [
    'Pide carta para acercarte a 21 sin pasarte.',
    'Plántate cuando quieras conservar tu total.',
    'Tras jugar todos, el crupier revela su carta oculta y pide hasta 17.',
  ],
  songless: [
    'Pulsa reproducir para escuchar el fragmento disponible.',
    'Elige una respuesta: solo se acepta un intento por ronda.',
    'Acertar con menos notas concede más puntos.',
  ],
  'air-hockey': [
    'Mueve tu mazo con el ratón, el dedo, WASD o las flechas.',
    'Solo puedes moverte dentro de tu mitad de la mesa.',
    'Protege la portería y busca el ángulo para marcar.',
  ],
  'table-tennis': [
    'Mueve tu pala con el ratón, el dedo, W/S o las flechas.',
    'Golpear lejos del centro cambia el ángulo de salida.',
    'Cada devolución acelera ligeramente la pelota.',
  ],
  'head-soccer': [
    'Muévete con A/D o las flechas izquierda y derecha.',
    'Salta con W o flecha arriba y remata con Espacio o K.',
    'El balón debe entrar por debajo del larguero rival.',
  ],
  'head-basketball': [
    'Muévete con A/D y salta con W o flecha arriba.',
    'Pulsa Espacio o K cerca del balón para lanzar al aro rival.',
    'La pelota debe cruzar el aro de arriba abajo; cada canasta vale dos.',
  ],
  tanks: [
    'Ajusta el ángulo y la potencia teniendo en cuenta el viento.',
    'Puedes mover el tanque tres veces antes de disparar.',
    'El daño es mayor cerca del centro de la explosión.',
  ],
};

function modeName(game: GameId, mode: string | undefined): { name: string; rule: string } | null {
  if (!mode) return null;
  const found = GAME_MODE_CATALOG[game].find((entry) => entry.id === mode);
  return found ? { name: found.name, rule: found.rule } : null;
}

/** Extrae el jugador activo si el estado del juego tiene turnos. */
function activePlayerOf(state: GamePublicState): string | null {
  return 'activePlayerId' in state && typeof state.activePlayerId === 'string'
    ? state.activePlayerId
    : null;
}

export function GameStage({
  state,
  children,
}: {
  state: GamePublicState;
  children: React.ReactNode;
}) {
  const { room, session } = useRoom();
  const { lastGameEvent } = useMatch();
  const [helpOpen, setHelpOpen] = useState(false);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const meta = GAME_META[state.game];
  const mode = modeName(state.game, 'mode' in state ? (state.mode as string) : undefined);
  const activeId = activePlayerOf(state);
  const activePlayer = room?.players.find((player) => player.id === activeId) ?? null;
  const disconnected = useMemo(
    () => (room?.players ?? []).filter((player) => player.connection === 'disconnected'),
    [room],
  );

  const isMyTurn = activeId !== null && activeId === session?.playerId;
  const turnLine = activeId
    ? isMyTurn
      ? 'Es tu turno'
      : 'Turno de ' + (activePlayer?.name ?? 'otro jugador')
    : 'Partida simultánea: todos juegan a la vez';

  // El lobby puede ser largo: cada partida debe abrir con su cabecera visible,
  // aunque el jugador hubiese dejado la pagina desplazada hacia abajo.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.game]);

  // La ayuda se cierra al cambiar de juego para no arrastrar el panel abierto.
  useEffect(() => {
    setHelpOpen(false);
  }, [state.game]);

  // Momentos destacados: se muestran grandes y se retiran solos.
  useEffect(() => {
    if (!lastGameEvent) return;
    const described = describeGameEvent(lastGameEvent.payload, room?.players ?? []);
    if (!described) return;
    setHighlight({ id: lastGameEvent.id, ...described });
    const timer = setTimeout(() => setHighlight(null), 1900);
    return () => clearTimeout(timer);
  }, [lastGameEvent, room?.players]);

  return (
    <section
      className="game-stage"
      style={{ ['--game-accent' as string]: meta.accent }}
      aria-label={'Partida de ' + meta.name}
    >
      <header className="stage-head">
        <span className="stage-identity">
          <span className="stage-mark">
            <GameIcon game={state.game} size={27} />
          </span>
          <span>
            <span className="stage-kicker">
              <span className="stage-live-dot" />
              Partida en directo
            </span>
            <span className="stage-title">{meta.name}</span>
          </span>
        </span>

        <p className={'stage-turn' + (isMyTurn ? ' is-mine' : '')} aria-live="polite">
          {activePlayer && (
            <PlayerIconGlyph icon={activePlayer.icon} color={activePlayer.color} size={14} />
          )}
          {turnLine}
        </p>

        <span className="stage-meta">
          {mode && <span className="stage-mode">{mode.name}</span>}
          {room && <span className="stage-room">Sala {room.code}</span>}
        </span>

        <button
          type="button"
          className="stage-help-toggle"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        >
          {helpOpen ? 'Ocultar ayuda' : 'Cómo se juega'}
        </button>
      </header>

      {helpOpen && (
        <div className="stage-help">
          {mode && (
            <p className="stage-help-rule">
              <strong>{mode.name}:</strong> {mode.rule}
            </p>
          )}
          <ul>
            {GAME_CONTROLS[state.game].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {disconnected.length > 0 && (
        <p className="stage-warning" role="status">
          {disconnected.length === 1
            ? disconnected[0]?.name + ' se ha desconectado. Puede volver con el mismo enlace.'
            : disconnected.length + ' jugadores desconectados. Pueden volver con el mismo enlace.'}
        </p>
      )}

      {highlight && (
        <div className="stage-flash" role="status" aria-live="polite" key={highlight.id}>
          <p className={'stage-flash-card tone-' + highlight.tone}>
            <span className="stage-flash-title">{highlight.title}</span>
            {highlight.detail && <span className="stage-flash-detail">{highlight.detail}</span>}
          </p>
        </div>
      )}

      <div className="stage-body">{children}</div>
    </section>
  );
}
