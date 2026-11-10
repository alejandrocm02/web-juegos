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

## [P1] Bolos: en móvil el juego se sale de la pantalla y queda recortado

- Juego/zona: Bolos, móviles (comprobado a 390 px).
- Pasos para reproducir: practicar Bolos en un móvil en vertical.
- Esperado / Real: pista, deslizadores y botón «Lanzar bola» caben en pantalla / la columna medía 501 px, así que la pista y los controles quedaban cortados por la derecha sin poder desplazarse.
- Causa: la rejilla de la vista no declaraba columna en móvil; la columna implícita crece hasta el contenido más ancho (la tira de diez frames). `document.scrollWidth` no lo delataba porque un `overflow: hidden` lo ocultaba, y por eso el E2E pasaba.
- Arreglo: columna base `minmax(0, 1fr)` en las doce vistas de juego (todas compartían el patrón) y nueva comprobación en `e2e/game-review.spec.ts` que mide tablero y controles.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P2] Bolos: los bolos se apilan en una franja y la bola sale cortada

- Juego/zona: Bolos, todas las pantallas.
- Esperado / Real: triángulo de diez bolos reconocible / las cuatro filas quedaban a 8 px y parecían una sola fila de bolos montados; los de las esquinas flotaban sobre el canal y la bola asomaba cortada por abajo.
- Causa: una única escala vertical para una pista de 18 m dibujada con el ancho a escala 10 veces mayor.
- Arreglo: zona de bolos con escala propia y plataforma a todo el ancho, tamaño aparente según la distancia, bolos pintados de atrás hacia delante y bola siempre entera. Solo cambia el dibujo: la física sigue en el servidor.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P2] Songless: las cuatro respuestas no parecen botones

- Juego/zona: Songless.
- Esperado / Real: tarjetas con borde y color como en el Quiz / texto suelto sin borde ni fondo.
- Causa: `.quiz-answer` calcula borde y fondo con `--answer-accent`, que solo definía `QuizView`. Sin la variable, las declaraciones son inválidas y el navegador las descarta.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P2] Billar: fila de puntuación descolocada

- Juego/zona: Billar, panel «Puntuación».
- Esperado / Real: icono, nombre y estado alineados / icono encima del nombre y un recuadro degradado a medias.
- Causa: se usaba `score-row-leading` (el resaltado del primer clasificado) como contenedor.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P2] Marcador de equipos partido en dos filas en móvil

- Juego/zona: Tenis de mesa y Head Basketball (cualquier modo con rótulo central largo).
- Esperado / Real: Rojo · VS · Azul en una fila / «Azul» caía a una segunda fila.
- Causa: `flex-wrap` con anchos mínimos fijos. Ahora es una rejilla de tres columnas.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P3] Portada: títulos montados sobre el dibujo, «010» y etiquetas falsas

- Juego/zona: tarjetas de juego de la portada.
- Real: con descripción de dos líneas (Blackjack, Songless, Tenis de mesa) el título pisaba la pantalla de la máquina; los juegos 10 a 14 se numeraban «010»…«014»; Blackjack, Songless o Quiz anunciaban «Física autoritativa»; en móvil la lista medía más de 5.000 px de alto; las tarjetas no hacían nada al pulsarlas.
- Arreglo: tarjeta con pantalla y texto separados, escena propia por juego, modos reales como etiqueta, dos columnas en móvil y cada tarjeta abre la práctica de su juego.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P3] Lobby de práctica: «ENTRENAMIENTO» se corta en móvil

- Causa: interletrado pensado para el código de sala de 5 caracteres.
- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P3] Dardos: «1 disponibles»

- Estado: resuelto (rama `visual/auditoria-noviembre`).

## [P3] Aviso «¡GOL!» tapa la cabecera de la partida en móvil

- Juego/zona: Head Soccer (y demás avisos destacados).
- Real: el aviso aparece sobre la píldora «Partida simultánea» en vez de sobre el campo.
- Estado: abierto.

## [P3] Minigolf: medio lienzo vacío al empezar el hoyo

- Juego/zona: Minigolf, escritorio y móvil.
- Real: la cámara centra la bola y, con la bola en la salida, la mitad izquierda del lienzo queda vacía y el recorrido se corta por la derecha hasta pulsar «Ver el nivel (Z)».
- Propuesta: limitar la cámara a los bordes del hoyo, o mostrar el hoyo entero un segundo al empezar.
- Estado: abierto.

## [P1] Bolos: en multijugador cada jugador jugaba la partida entera seguida

- Juego/zona: Bolos, salas de dos o más jugadores.
- Pasos para reproducir: empezar una partida con dos jugadores y completar el primer frame.
- Esperado / Real: tras cada frame lanza el siguiente jugador / el mismo jugador seguía lanzando hasta acabar sus diez frames.
- Causa: para saber si el jugador seguía en el mismo frame se comparaban dos tarjetas calculadas después de anotar la tirada, así que siempre coincidían.
- Arreglo: se compara con el frame de antes de la tirada. Test: «los jugadores se alternan frame a frame» (falla con el código anterior).
- Estado: resuelto (rama `fix/bolos-triangulo`).

## [P1] Bolos: el triángulo estaba al revés

- Juego/zona: Bolos, física del servidor y las dos vistas.
- Esperado / Real: bolo 1 delante y fila de cuatro al fondo, como en una bolera / la fila de cuatro quedaba delante y el bolo 1 al fondo, así que una bola centrada chocaba contra un muro de cuatro bolos.
- Arreglo: `bowlingPinLayout` coloca las filas hacia el fondo; el foso se desplaza con ellas (`BOWLING_PIT_Y`).
- Estado: resuelto (rama `fix/bolos-triangulo`).

## [P2] Bolos: un pleno se anunciaba como «10 bolos»

- Causa: el suceso se leía de la tarjeta, que tras un pleno ya apunta al frame siguiente, vacío.
- Arreglo: se decide por los bolos en pie antes y después de la tirada.
- Estado: resuelto (rama `fix/bolos-triangulo`).

## [P2] Bolos: los lanzamientos flojos se quedaban a media pista

- Real: por debajo de un 46 % de potencia la bola no llegaba a los bolos y el turno tardaba hasta 20 s en acabar con cero.
- Arreglo: la potencia mínima ya alcanza los bolos (`bowlingLaunchSpeed`).
- Estado: resuelto (rama `fix/bolos-triangulo`).

## [P2] Bolos: la trayectoria dibujada no coincidía con la real

- Real: la curva del efecto que se veía al apuntar era una aproximación distinta de la que aplicaba el servidor, y además el efecto dependía de la potencia.
- Arreglo: una sola fórmula (`bowlingHookOffset`) que usan el servidor y las dos vistas.
- Estado: resuelto (rama `fix/bolos-triangulo`).
