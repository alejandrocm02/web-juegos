# Registro de bugs

Prioridad: **P0** rompe la web o una partida · **P1** afecta a jugar · **P2** molesto · **P3** cosmético.

## [P1] Temporizador desincronizado entre clientes

- Juego/zona: todos los juegos con cuenta atrás (Quiz, Dardos, Billar, Bolos, Songless, Blackjack, Tanques).
- Pasos para reproducir: abrir la misma sala en dos equipos cuyo reloj del sistema difiera unos segundos; empezar una partida de Quiz.
- Esperado / Real: ambos ven el mismo tiempo restante / cada uno ve un tiempo distinto, desfasado tanto como sus relojes.
- Causa: el servidor envía `deadline` como hora absoluta de su reloj (`Date.now()` del servidor) y el cliente la resta a **su propio** `Date.now()` sin corregir el desfase. No existe ningún cálculo de offset en el cliente. Lugares: `apps/web/src/components/ui.tsx` (`Countdown`), `QuizView.tsx`, `DartsView.tsx`, `PoolView.tsx`, `BowlingView.tsx`, `SonglessView.tsx`, `TanksView.tsx`.
- Nota: el avance de rondas lo decide el servidor (`setTimeout` en cada `GameRunner`), así que el desfase es visual y de percepción, pero hace que un jugador crea tener tiempo cuando ya no lo tiene.
- Arreglo: el cliente estima el desfase con el servidor (evento `clock:sync` con acuse, método NTP con 5 muestras; se repite al conectar, cada minuto y al volver de segundo plano) y todas las cuentas atrás usan `serverNow()` en vez de `Date.now()`. Tests: `apps/web/tests/clock.test.tsx`, `apps/server/tests/clock-sync.test.ts` y `e2e/clock.spec.ts` (con el reloj adelantado 60 s marcaba 0 s; ahora marca el tiempo real).
- Estado: resuelto (rama `fase-1/sincronizacion-reloj`).

## [P1] Al volver de una pestaña en segundo plano se ven varias rondas de golpe

- Juego/zona: partidas por rondas (Quiz, Songless, Dardos).
- Pasos para reproducir: dos clientes en la misma sala; dejar uno en segundo plano varios minutos durante la partida y volver.
- Esperado / Real: el cliente salta directamente al estado actual / se reproducen varias rondas seguidas.
- Causa: **sin confirmar**. Lo comprobado: el estado de juego no se encola (`store.tsx` sustituye `gameState` con el último recibido) y las rondas avanzan en el servidor. Hipótesis a verificar: los efectos de `game:event` (avisos, sonidos, destacados) sí se acumulan y se disparan juntos al volver, y los bucles de `requestAnimationFrame` reciben un `dt` enorme en el primer fotograma.
- Estado: abierto. Siguiente paso: reproducirlo con Playwright (dos contextos, uno con `visibilityState = hidden`) antes de tocar código.

## [P1] Billar y minigolf no se pueden jugar sin ratón o pantalla táctil

- Juego/zona: Billar, Minigolf (y en general los juegos de arrastrar y apuntar).
- Pasos para reproducir: entrar en Billar usando solo el teclado.
- Esperado / Real: apuntar y golpear con teclado / el golpe exige arrastrar con el puntero.
- Causa: la entrada de estos juegos solo escucha eventos de puntero. Recogido como H-2 en `AUDITORIA.md` y como pendiente en `REVISION.md`.
- Estado: abierto.

## [P2] Falta `robots.txt`, `sitemap.xml` y datos estructurados

- Juego/zona: SEO global.
- Pasos para reproducir: abrir `/robots.txt`.
- Esperado / Real: fichero de texto válido / devuelve el HTML de la aplicación. Lighthouse SEO baja a 91.
- Causa: no existen en `apps/web/public/` ni hay ruta en el servidor.
- Estado: abierto.
