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

## [P1] Minigolf: el golpe se pierde al soltar fuera del lienzo

- Juego/zona: Minigolf, sobre todo en móvil y con lápiz.
- Pasos para reproducir: en un navegador que rechace `setPointerCapture`, arrastrar desde el campo y soltar fuera del lienzo.
- Esperado / Real: se envía el golpe / no se envía, salta un error sin capturar y la bola parece bloqueada.
- Causa: la excepción de `setPointerCapture` interrumpía el gesto y el final solo se escuchaba en el lienzo.
- Arreglo: captura opcional y fin del gesto escuchado en `window` (parte de corrección de la PR #36). Prueba: `e2e/golf-gesture.spec.ts`.
- Estado: resuelto (rama `fase-1/sincronizacion-reloj`).

## [P1] Billar: una bola rápida podía atravesar a otra

- Juego/zona: Billar.
- Pasos para reproducir: golpe muy fuerte con una bola a poca distancia.
- Esperado / Real: chocan / la blanca la cruzaba sin contacto en un solo fotograma.
- Causa: cada bola hacía sus subpasos por separado y los choques solo se resolvían al final del fotograma.
- Arreglo: subpasos compartidos con choques en cada subpaso (rama `feat/arcade-immersive-redesign`). Prueba: `packages/game-engine/tests/pool-sim.test.ts`, que antes ni se ejecutaba.
- Estado: resuelto (rama `fase-1/sincronizacion-reloj`).

## [P1] Al volver de una pestaña en segundo plano se ven varias rondas de golpe

- Juego/zona: partidas por rondas (Quiz, Songless, Dardos).
- Pasos para reproducir: dos clientes en la misma sala; dejar uno en segundo plano varios minutos durante la partida y volver.
- Esperado / Real: el cliente salta directamente al estado actual / se reproducían varias rondas seguidas (auditoría de septiembre).
- Causa: Socket.IO guarda las emisiones hechas sin conexión y las reenvía al reconectar, así que las acciones de una pestaña que había perdido la conexión llegaban todas de golpe. Lo corrigió la PR #42 (20 oct.): `sendAction` ya no emite sin conexión.
- Comprobado el 9 nov. sobre `main`: el estado de juego no se encola (cada mensaje sustituye al anterior), los avisos destacados tampoco (el último gana) y todos los bucles de animación limitan el salto a 50 ms por fotograma. Con el hilo del invitado bloqueado 24 s mientras la sala avanza de ronda, al soltarlo procesa los mensajes acumulados en menos de 30 ms y pinta directamente la ronda actual.
- Descartado: la congelación por CDP (`Page.setWebLifecycleState`) no tiene efecto en headless; por eso la prueba bloquea el hilo principal.
- Prueba: `e2e/background-tab.spec.ts`. Pasa con el código actual y falla (repetición de 1,8 s) si se simula una cola de estados.
- Estado: resuelto (PR #42) y cubierto por prueba de regresión.

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

## [P2] Test E2E de Arena inestable (1 de cada 8 ejecuciones)

- Juego/zona: `e2e/game-review.spec.ts`, Arena.
- Pasos para reproducir: `npx playwright test game-review.spec.ts -g arena --repeat-each=10`.
- Esperado / Real: siempre en verde / falla por tiempo agotado; también falló en el CI de la PR #44.
- Causa: los bots eliminan al jugador, quieto durante la prueba, y la partida termina sola antes de que la prueba salga por el menú (a veces con el diálogo de salida ya abierto, y el clic esperaba sin límite).
- Arreglo: en Arena, si la partida acaba antes, la prueba vuelve desde la pantalla de resultados (mismo lobby, mismo segundo inicio) y los clics de salida tienen tiempo propio. 14 de 14 seguidas en verde.
- Estado: resuelto (rama `fase-1/sincronizacion-reloj`).

## [P3] Arena: los bots eliminan muy rápido a un jugador inactivo

- Juego/zona: Arena en práctica.
- Pasos para reproducir: empezar Arena con los rivales por defecto (3, normal) o con 1 en fácil y no moverse.
- Esperado / Real: margen razonable en fácil / el jugador cae en unos 10-25 s incluso con un rival fácil.
- Causa: por revisar el balance de los bots (persecución y daño). No es necesariamente un fallo: un jugador real se mueve.
- Estado: abierto, para revisar al migrar Arena.
