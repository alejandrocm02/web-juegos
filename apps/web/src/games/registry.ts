import { lazy } from 'react';
import type { GameId } from '@arcade/shared';

/**
 * Carga diferida de las vistas de juego.
 *
 * Antes las catorce vistas entraban en el bundle inicial: cada una arrastra su
 * propio renderizador de canvas, asi que abrir la pagina para jugar a una sola
 * descargaba las trece restantes. Con `lazy` cada vista es un fragmento aparte
 * y el arranque solo paga el lobby.
 *
 * El precio de dividir es un parpadeo al empezar la partida, justo cuando mas
 * molesta. Por eso existe `prefetchGame`: el lobby pide el fragmento del juego
 * seleccionado mientras la gente sigue eligiendo, de modo que cuando el
 * anfitrion pulsa empezar el modulo ya esta en cache.
 *
 * Los `import()` se escriben literales a proposito. El analizador de Vite
 * necesita ver la ruta para crear el fragmento, asi que no se pueden generar a
 * partir de una plantilla.
 */

const load = {
  quiz: () => import('./QuizView.js'),
  darts: () => import('./DartsView.js'),
  pool: () => import('./PoolView.js'),
  golf: () => import('./GolfView.js'),
  bowling: () => import('./BowlingView.js'),
  karts: () => import('./KartsView.js'),
  arena: () => import('./ArenaView.js'),
  blackjack: () => import('./BlackjackView.js'),
  songless: () => import('./SonglessView.js'),
  // Air Hockey y tenis de mesa comparten vista; tambien los dos "head sport".
  'air-hockey': () => import('./ArcadeSportView.js'),
  'table-tennis': () => import('./ArcadeSportView.js'),
  'head-soccer': () => import('./HeadSportView.js'),
  'head-basketball': () => import('./HeadSportView.js'),
  tanks: () => import('./TanksView.js'),
};

// Deja que el compilador avise si algun dia se anade un juego y se olvida aqui.
const _exhaustive: Record<GameId, () => Promise<unknown>> = load;
void _exhaustive;

/**
 * Vistas perezosas. Se exportan una a una, en vez de por un mapa indexado,
 * para que `App` conserve el estrechamiento de tipos de su `switch`: cada
 * vista espera su propio estado publico, no el de la union entera.
 */
export const QuizView = lazy(load.quiz);
export const DartsView = lazy(load.darts);
export const PoolView = lazy(load.pool);
export const GolfView = lazy(load.golf);
export const BowlingView = lazy(load.bowling);
export const KartsView = lazy(load.karts);
export const ArenaView = lazy(load.arena);
export const BlackjackView = lazy(load.blackjack);
export const SonglessView = lazy(load.songless);
export const ArcadeSportView = lazy(load['air-hockey']);
export const HeadSportView = lazy(load['head-soccer']);
export const TanksView = lazy(load.tanks);

/** Fragmentos ya solicitados, para no repetir la peticion en cada render. */
const requested = new Set<GameId>();

/**
 * Pide por adelantado el fragmento de un juego.
 *
 * El fallo se silencia a proposito: si la red falla, `Suspense` reintentara al
 * montar la vista y ese sera el momento de contarselo al jugador.
 */
export function prefetchGame(game: GameId | null | undefined): void {
  if (!game || requested.has(game)) return;
  const loader = load[game];
  if (!loader) return;
  requested.add(game);
  void loader().catch(() => requested.delete(game));
}
