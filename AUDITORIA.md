# Auditoría técnica — Parque Arcade

**Fecha:** 8 de agosto de 2026
**Alcance:** auditoría 360º (arquitectura, backend autoritativo, red, frontend, seguridad, calidad, despliegue)
**Método:** lectura completa del código + ejecución real de `lint`, `typecheck`, `test` y `build` sobre una instalación limpia (`npm ci`).

---

## 1. Resumen ejecutivo

El proyecto está **muy por encima de lo habitual en un MVP**. La separación cliente/servidor es correcta, el servidor es realmente autoritativo, los contratos están tipados y validados con Zod en el borde, y hay 303 tests que pasan. La arquitectura aguanta bien haber crecido de 4 a 14 juegos sin degenerar en un `if` gigante: el patrón `GameRunner` ha resistido.

Los problemas no están en el diseño sino en **la capa de abuso y en la escala**: tres eventos de socket se saltan el limitador, no hay tope global de salas, no hay CSP, y todo vive en un único proceso sin posibilidad de escalado horizontal. En frontend, el punto débil claro es un **bundle único de 440 kB** con los 14 juegos y un contexto global que re-renderiza todo.

| Área | Valoración | Comentario |
|---|---|---|
| Arquitectura y modularidad | 9/10 | Monorepo limpio, fronteras nítidas, `packages/shared` como única fuente de verdad |
| Backend autoritativo | 9/10 | El cliente no decide nada: turnos, física, puntuación y tiempos son del servidor |
| Contratos y validación | 9/10 | Zod exhaustivo, uniones discriminadas, rangos acotados por acción |
| Seguridad | 6/10 | Buena base, pero con huecos concretos y evitables (ver §4) |
| Tests | 8/10 | 303 unitarios + 9 E2E, pero sin cobertura medida y con áreas ciegas |
| Rendimiento cliente | 6/10 | Sin *code splitting*, contexto global monolítico |
| Escalabilidad | 4/10 | Un solo proceso, estado en memoria, sin adaptador Redis |
| Accesibilidad | 7/10 | Notable para un proyecto de juegos, pero sin alternativa de teclado en el juego |
| Documentación | 9/10 | README de 524 líneas que cubre instalación, eventos, reglas y limitaciones |
| DX / CI | 8/10 | `npm run check` unificado, CI con artefactos de traza |

---

## 2. Comprobaciones ejecutadas

Todas sobre instalación limpia con `npm ci` (405 paquetes, Node 22.22.3):

| Comprobación | Resultado | Detalle |
|---|---|---|
| `npm run lint` | ✅ Sin avisos | ESLint 9 flat config |
| `npm run typecheck` | ✅ Limpio | 4 workspaces, sin `any` implícitos salvo los marcados |
| `npm run test` | ✅ **303 tests / 37 ficheros** en 31 s | 0 fallos, 0 *skipped* |
| `npm run build` | ✅ 3,04 s | JS 439,59 kB (gzip 129,40) · CSS 61,79 kB (gzip 12,43) |
| `npm audit --omit=dev` | ✅ **0 vulnerabilidades** | |
| `npm audit` (con dev) | ⚠️ 3 *high* | `nanoid`, `js-yaml` — solo cadena de herramientas |

### ⚠️ Aviso sobre tu instalación local

Tu carpeta `node_modules` **está desincronizada del `package-lock.json`**: contiene `vite@5.4.21` en la raíz mientras el lockfile declara `7.3.6`, y hay una copia anidada en `apps/web/node_modules`. Con ese árbol, `npm run typecheck` **falla** con un muro de errores de tipos de Vite que no tienen nada que ver con tu código, y `npm run test` ni siquiera llega a compilar `@arcade/shared`.

```bash
# Solución (una vez)
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm ci
```

No es un defecto del repositorio —CI e instalación limpia pasan— pero explica cualquier error raro que estés viendo en local.

---

## 3. Puntos fuertes

**3.1. El servidor es autoritativo de verdad, no de boquilla.**
`Room.handleAction` → `GameRunner.handleAction` es la única puerta de entrada, y los bots pasan por ella igual que los humanos (`room.ts:511`). Ninguna vista envía puntuaciones, posiciones ni resultados: solo intención (ángulo, potencia, índice de respuesta). Las simulaciones viven en `packages/game-engine` y se ejecutan **únicamente** en el servidor; el cliente interpola snapshots. Es exactamente el modelo correcto.

**3.2. Presupuesto de red bien pensado.**
60 Hz de física, 20 Hz de snapshots, estado completo cada 0,5–1 s, y entradas continuas (karts, arena, head-sports) enviadas **solo cuando cambian**, no por fotograma. Es una decisión deliberada y documentada en los esquemas, y es la razón de que 5 jugadores quepan de sobra en el límite de 60 mensajes / 5 s.

**3.3. Validación en el borde, no dispersa.**
`settingsPatchSchema` es una unión discriminada de 14 configuraciones; cada acción acota sus rangos físicos (`power: 0.02–1`, `angle: ±2π`, `tanks:fire` limitado a ángulos hacia arriba). Un cliente manipulado no puede inyectar una potencia de 9999 ni un ángulo imposible. Los nombres se sanean y se limitan antes de tocar la sala.

**3.4. La reconexión está resuelta con cuidado quirúrgico.**
El comentario de `markDisconnected` (`room.ts:298-307`) documenta la carrera real —el socket nuevo llega antes del cierre del viejo— y la resuelve comparando `socketId`. Además el resultado de partida viaja **dentro** de `room:state`, no solo en el evento efímero `game:over`, de modo que recargar en el instante exacto del final no rompe nada. Hay `session:replaced` para pestañas duplicadas. Esto es de las cosas que casi nadie hace bien.

**3.5. Tests que comprueban comportamiento, no implementación.**
El caso estrella: `packages/game-engine/tests/golf.test.ts` no se limita a afirmar `level.aceRoute === true`, sino que **simula el golpe real** con ángulo y potencia concretos en los niveles 1, 2, 4, 6 y 10 y verifica `ball.ace`. Igualmente, `pool.test.ts` comprueba que ninguna bola escapa de la mesa tras 627 ms de simulación. Son tests que detectarían una regresión física de verdad.

**3.6. Degradación elegante en persistencia.**
Si Prisma no está generado o falta una tabla, `initStats` cae a `MemoryStats` y la partida sigue funcionando; solo se pierden estadísticas históricas. El `CMD` del Dockerfile aplica la misma filosofía. Es la decisión correcta para un juego: nunca sacrificar la partida por la base de datos.

**3.7. Identidad visual coherente y accesibilidad por encima de la media.**
Color **y** icono por jugador (`PLAYER_COLORS` + `PLAYER_ICONS`), `prefers-reduced-motion` respetado en ambas hojas de estilo, `focus-visible` global, `role="radiogroup"` en los selectores de juego, `aria-live` en los avisos de partida. La diana de dardos incluso tiene control por teclado.

**3.8. Documentación real.**
524 líneas de README con instalación, comandos, arquitectura, catálogo de eventos, reglas por juego, pruebas y —lo más raro de encontrar— una sección honesta de **limitaciones conocidas**.

---

## 4. Puntos débiles y hallazgos

Severidad: 🔴 crítico · 🟠 alto · 🟡 medio · ⚪ bajo

### 🔴 H-01 · Tres eventos de socket se saltan el limitador de mensajes

`apps/server/src/socket.ts` — `room:start`, `room:back-to-lobby` y `room:leave` se registran **sin pasar por `guard()`**, que es donde vive `SocketRateLimiter`. Los tres tienen efectos caros:

- `room:start` construye un `GameRunner` completo, arranca un `setInterval` a 60 Hz y lanza el `BotDirector`.
- `room:back-to-lobby` hace `dispose()` + `syncBots()` + *broadcast* a toda la sala.

Un anfitrión (o cualquiera que se haga anfitrión) puede alternar start/back en bucle y saturar el bucle de eventos del proceso, afectando a **todas** las salas del servidor. Es el hallazgo más explotable y el más barato de arreglar.

### 🔴 H-02 · No hay tope global de salas

`RoomManager.create()` no tiene límite. El limitador por socket permite 60 mensajes cada 5 s, así que un único cliente puede crear ~43.000 salas/hora; con un TTL de vaciado de 120 s se sostienen del orden de 1.400 salas vivas simultáneas por atacante, cada una con su `Room`, sus jugadores y su `structuredClone(DEFAULT_SETTINGS)`. Sin tope, es agotamiento de memoria trivial.

### 🟠 H-03 · Sin Content-Security-Policy

`index.ts` monta `helmet({ contentSecurityPolicy: false })`. En una app que sirve su propio cliente compilado desde el mismo origen, una CSP es casi gratis y elimina toda una clase de riesgos (inyección de scripts de terceros, exfiltración). Está desactivada, presumiblemente para no pelearse con Vite en desarrollo, pero en producción no hay excusa.

### 🟠 H-04 · Un solo proceso: sin escalado horizontal ni tolerancia a reinicios

Todo el estado de las salas vive en `Map` en memoria y cada partida con física abre su propio `setInterval` a 60 Hz. Consecuencias:

- Un reinicio o *deploy* corta **todas** las partidas en curso. No hay drenaje ni aviso.
- No se puede añadir una segunda instancia: sin `@socket.io/redis-adapter` y sin estado compartido, dos réplicas serían dos servidores independientes.
- N salas activas = N temporizadores a 16 ms. No hay medición de cuántas aguanta el proceso ni límite defensivo.

Para jugar con amigos es irrelevante; para cualquier cosa pública es el techo del proyecto.

### 🟠 H-05 · Bundle único de 440 kB con los 14 juegos

`App.tsx` importa estáticamente las 14 vistas de juego. Quien solo quiere jugar al quiz descarga también la física de karts, el renderizador de golf (660 líneas) y la arena. Con `React.lazy` + `Suspense` esto son ~5 líneas de cambio y probablemente reduce la carga inicial a menos de la mitad.

### 🟡 H-06 · Contexto global monolítico

`store.tsx` expone un único `AppStateValue` con `gameState`, `room`, `result`, `toasts`, `golfEvents`… Cualquier `game:state` (hasta 2/s en juegos con física) re-renderiza **todo** el árbol suscrito, incluidos HUD, clasificaciones y barras que no han cambiado. Está mitigado con acierto —los snapshots a 20 Hz van por `snapshotRef` y no provocan render—, pero el patrón no escala si añades más juegos. Selectores o contextos separados (sala / partida / avisos) lo resolverían.

### 🟡 H-07 · El rate limit HTTP también cuenta los ficheros estáticos

`rateLimit({ limit: 120 })` se monta **antes** de `express.static`. Cargar la página consume varias peticiones (HTML + JS + CSS + favicon). Cinco amigos detrás del mismo NAT que recargan unas cuantas veces pueden empezar a comerse el presupuesto. Debería excluir estáticos y `/api/health`.

### 🟡 H-08 · El filtro de categorías del quiz se ignora en silencio

`quiz-game.ts:60-62`: si el conjunto filtrado tiene menos preguntas de las pedidas, cae a `QUIZ_QUESTIONS` **completo** sin avisar. Si el anfitrión elige "solo cine" y 10 preguntas, con ~6-7 preguntas por categoría recibe preguntas de todas las categorías y no entiende por qué. Debería recortar `questionCount` al tamaño del conjunto y comunicarlo en el lobby.

### 🟡 H-09 · Banco de preguntas corto y con respuestas en posición fija

46 preguntas para partidas de 10. En la tercera partida seguida ya se repiten, y como el orden de las cuatro respuestas es fijo por pregunta, se memoriza la **posición** de la correcta, no la respuesta. Barajar las opciones por partida es trivial y multiplica la vida útil del banco.

### 🟡 H-10 · `LobbyView.tsx` con 928 líneas

Es, con diferencia, el fichero más grande del proyecto y concentra selector de juego, configuración de los 14 juegos, lista de jugadores, invitación y controles de anfitrión. Es el punto donde más va a doler el próximo juego que añadas. Extraer un `GameSettingsPanel` por juego (o un registro `game → componente de ajustes`) devolvería el fichero a un tamaño legible.

### 🟡 H-11 · Sin cobertura medida ni áreas explícitamente cubiertas

303 tests es mucho, pero `vitest.config.ts` no configura `coverage`, así que nadie sabe qué queda fuera. Huecos que sí he podido identificar leyendo:

- **`socket.ts` no tiene tests propios de abuso**: no hay ningún test que compruebe que el limitador rechaza una ráfaga, ni que un payload gigante se descarta, ni que un no-anfitrión no puede iniciar (esto último sí está cubierto indirectamente en `room-rules`).
- **`quiz-game.ts` y `darts-game.ts` no tienen fichero de test propio**; se cubren de refilón desde `integration`, `game-modes` y `game-regressions`.
- El test *"el hoyo en uno exige precisión"* es débil: `expect(misses.length).toBeGreaterThan(0)` pasa aunque 2 de 3 potencias erróneas metan la bola.

### ⚪ H-12 · `inviteUrl` del servidor es un campo muerto y engañoso

`room.ts:179` construye la URL con `env.PUBLIC_WEB_URL` (por defecto `http://localhost:5173`, y **no definido** en `render.yaml`), pero `LobbyView.tsx:89` lo ignora y usa `window.location.origin`. El resultado visible es correcto; el campo del contrato es basura. O se elimina del `RoomSummary`, o se emite relativo (`/?code=XXXXX`).

### ⚪ H-13 · Nombres de evento en crudo dentro de `Room`

`room.ts` emite `'game:state'`, `'app:toast'`, `'game:started'`… como literales, mientras `socket.ts` usa `SERVER_EVENTS`. Existe la constante compartida precisamente para esto; el día que renombres un evento, el `grep` no te salvará.

### ⚪ H-14 · Dependencias con retraso de una o dos mayores

React 18 (→19), Prisma 5 (→7), Express 4 (→5), Tailwind 3 (→4), Zod 3 (→4), ESLint 9 (→10). Ninguna es urgente y ninguna tiene CVE en producción, pero el salto acumulado crece. Express 4→5 y Zod 3→4 son los que más van a doler si se dejan.

### ⚪ H-15 · Contenedor corriendo como root

El `Dockerfile` no declara `USER node`. Buena práctica barata.

### ⚪ H-16 · Sin control de historial del navegador

Solo se lee `?code=` una vez en `HomeView`. El botón "atrás" no hace nada útil: estando en una partida te saca de la app en lugar de al lobby. No hay router.

---

## 5. Qué mejoraría (técnico)

En orden de relación valor/esfuerzo:

1. **Pasar los tres eventos huérfanos por `guard()`** y añadir un tope global de salas. Media hora, cierra los dos hallazgos críticos.
2. **`React.lazy` para las 14 vistas de juego.** Cinco líneas, mitad de bundle inicial.
3. **CSP en producción**, permisiva en desarrollo.
4. **Cobertura con `vitest --coverage`** y un umbral mínimo en CI (empieza en el % actual y sube; nunca al revés).
5. **Tests de abuso del socket**: ráfaga rechazada, payload de 10 kB descartado, acción fuera de turno, `room:start` de un no-anfitrión.
6. **Trocear `LobbyView`** con un registro `GameId → componente de ajustes`. Convierte "añadir un juego" en tocar un fichero nuevo en vez de uno de 928 líneas.
7. **Partir el contexto** en `RoomContext` / `MatchContext` / `NotificationContext`.
8. **Métricas mínimas**: salas activas, partidas en curso, jugadores conectados, latencia media de tick. Un `/api/metrics` en texto plano ya te dice si el proceso está sufriendo.
9. **Apagado con drenaje**: al recibir SIGTERM, avisar a las salas en curso ("el servidor se reinicia en 15 s") antes de cerrar. Hoy la partida simplemente muere.
10. **Barajar respuestas del quiz** y ampliar el banco a 150+ preguntas.
11. **Actualizar dependencias por lotes** (una mayor por PR, con los tests como red).
12. **`USER node` en el Dockerfile** y `PUBLIC_WEB_URL` resuelto o eliminado.

---

## 6. Qué añadiría (producto)

Ordenado por lo que más cambiaría la experiencia de jugar con amigos:

**6.1. Chat de sala y reacciones rápidas.** Es la ausencia más llamativa de una plataforma "para jugar con amigos". Ni siquiera hace falta chat completo: seis emojis con cooldown durante la partida cubren el 80% del valor social. Coste bajo, impacto alto.

**6.2. Modo torneo / "party".** Encadenar 3–5 juegos elegidos con una clasificación global acumulada y una ceremonia final. Convierte 14 minijuegos sueltos en **una velada**. Es, con diferencia, la funcionalidad con mejor retorno: reutiliza todo lo que ya existe (`MatchResult`, `rankPlayers`) y solo necesita un orquestador por encima de `Room`.

**6.3. Espectador y repetición del último golpe.** Ya guardas snapshots; un espectador para el jugador eliminado en la arena, o una repetición de 3 s del hoyo en uno, aprovechan infraestructura existente.

**6.4. Ajuste de dificultad y hándicap.** Que el jugador que va último tenga una pequeña ventaja mantiene vivas las partidas de 5 personas donde uno domina.

**6.5. Historial de sala persistente.** Ya guardas `MatchRecord`; falta exponerlo: "habéis jugado 12 partidas, Ana lidera 5-3-2". Fideliza a un grupo fijo.

**6.6. Sonido con identidad.** Hay `sound.ts` y `songless-audio.ts`, pero el proyecto pide efectos originales para hitos (hoyo en uno, strike, victoria). Un banco pequeño de sonidos sintetizados con Web Audio evita problemas de licencia y pesa cero.

**6.7. Soporte táctil real.** El proyecto prioriza ordenadores por diseño, pero el quiz, dardos y blackjack son perfectamente jugables desde el móvil de un invitado que no tiene el portátil a mano. Marcar qué juegos son "aptos para móvil" en el lobby es honesto y útil.

**6.8. Nivel de golf comunitario / editor.** A largo plazo, y solo si el resto está pulido: los 10 niveles son datos declarativos, así que un editor es viable. Es la vía natural para que el minigolf tenga vida más allá de la décima partida.

---

## 7. Backlog priorizado

| # | Acción | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 1 | Limitar `room:start` / `back-to-lobby` / `room:leave` (H-01) | Alto | XS | **Ahora** |
| 2 | Tope global de salas (H-02) | Alto | XS | **Ahora** |
| 3 | CSP en producción (H-03) | Medio | XS | **Ahora** |
| 4 | Excluir estáticos del rate limit HTTP (H-07) | Medio | XS | **Ahora** |
| 5 | `React.lazy` en las vistas de juego (H-05) | Alto | XS | Siguiente |
| 6 | Tests de abuso del socket (H-11) | Alto | S | Siguiente |
| 7 | Cobertura medida + umbral en CI (H-11) | Medio | S | Siguiente |
| 8 | Arreglar filtro de categorías del quiz (H-08) | Medio | S | Siguiente |
| 9 | Modo torneo (6.2) | Muy alto | M | Siguiente |
| 10 | Chat / reacciones (6.1) | Alto | S–M | Siguiente |
| 11 | Trocear `LobbyView` (H-10) | Medio | M | Cuando duela |
| 12 | Partir el contexto global (H-06) | Medio | M | Cuando duela |
| 13 | Ampliar y barajar el banco de quiz (H-09) | Medio | S | Cuando duela |
| 14 | Métricas + apagado con drenaje (5.8, 5.9) | Medio | M | Cuando duela |
| 15 | Redis adapter + estado compartido (H-04) | Alto* | L | Solo si se publica |
| 16 | Actualizar dependencias mayores (H-14) | Bajo | M | Mantenimiento |
| 17 | Router e historial (H-16) | Bajo | S | Mantenimiento |
| 18 | `USER node`, limpiar `inviteUrl`, `SERVER_EVENTS` en `Room` (H-12, H-13, H-15) | Bajo | XS | Mantenimiento |

\* Impacto alto solo si el objetivo deja de ser "jugar con amigos" y pasa a ser servicio público.

---

## 8. Correcciones aplicadas en esta sesión

Se han cerrado los cuatro hallazgos marcados como **Ahora**.

| Hallazgo | Cambio | Ficheros |
|---|---|---|
| H-01 | Nuevo helper `throttle()` que aplica el limitador a los eventos sin payload; `room:start`, `room:back-to-lobby` y `room:leave` pasan ya por él. `guard()` y `throttle()` comparten `withinRate()`. | `apps/server/src/socket.ts` |
| H-02 | `MAX_ROOMS` (500 por defecto) en el entorno; `RoomManager.isAtCapacity` se consulta antes de crear y `create()` lanza si se fuerza. Las dos rutas de creación responden con un aviso claro. | `env.ts`, `rooms/manager.ts`, `socket.ts`, `.env.example` |
| H-03 | CSP estricta en producción (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), desactivada en desarrollo por el HMR de Vite. | `apps/server/src/index.ts` |
| H-07 | El rate limit HTTP se monta en `/api` en lugar de global y omite `/api/health`. Los estáticos dejan de consumir cuota. | `apps/server/src/index.ts` |

**Tests nuevos** — `apps/server/tests/socket-abuse.test.ts` (3 casos):

- una ráfaga de `room:start` recibe `RATE_LIMITED` (habría pasado desapercibida antes del cambio);
- un payload de 20 kB se descarta con `INVALID_PAYLOAD` sin cerrar la conexión;
- `RoomManager` rechaza crear salas al alcanzar el aforo.

**Verificación tras los cambios** (instalación limpia):

| Comprobación | Antes | Después |
|---|---|---|
| `lint` | ✅ | ✅ |
| `typecheck` | ✅ | ✅ |
| `test` | 303 / 37 ficheros | **306 / 38 ficheros**, 0 fallos |
| `build` | ✅ | ✅ |

También se ha actualizado la sección 8 del `README.md` para reflejar el nuevo comportamiento.

---

---

## 8 bis. Segunda tanda: mejoras técnicas y añadidos

Después de la auditoría se implementó el bloque §5 completo (salvo la actualización de dependencias mayores, descartada por riesgo) y los dos añadidos de producto principales.

### Mejoras técnicas

| Hallazgo | Qué se hizo | Resultado medido |
|---|---|---|
| H-05 | `React.lazy` + `Suspense` para las 14 vistas de juego | Bundle inicial **440 kB → 335 kB** (gzip 129 → 102 kB); cada juego es ahora un chunk de 4–23 kB |
| H-06 | Contexto partido en cuatro: `useRoom`, `useMatch`, `useNotices`, `useChat`. Avisos, barra de salida y overlay de desconexión memoizados y auto-suscritos | Un `game:state` deja de repintar avisos, lobby y barra de salida |
| H-08 | El filtro de categorías del quiz se respeta: se recorta la partida y se avisa, en lugar de rellenar en silencio | El lobby muestra las preguntas disponibles antes de empezar |
| H-09 | Banco ampliado de **46 → 151 preguntas** (21–22 por categoría) y **respuestas barajadas** en cada partida | Se acabó memorizar la posición del botón |
| H-10 | `LobbyView` troceado: registro `GameId → panel de ajustes` en `components/settings/` | **928 → 397 líneas**; añadir un juego ya no toca el fichero grande |
| H-11 | Cobertura con `@vitest/coverage-v8` y umbrales en CI + 7 tests de abuso nuevos | **83% líneas / 79% ramas**, umbral de no retroceso en 80/75 |
| H-12 | `inviteUrl` pasa a ser relativo; el origen lo pone el navegador | Se elimina la dependencia de `PUBLIC_WEB_URL`, que no estaba definida en producción |
| H-13 | `Room` usa `SERVER_EVENTS` en vez de literales | Renombrar un evento ya no depende de un `grep` |
| H-15 | `USER node` en el Dockerfile | El contenedor deja de correr como root |
| §5.8 | `GET /api/metrics` en texto plano: salas, partidas, jugadores, memoria | Se puede ver de un vistazo si el proceso sufre |
| §5.9 | Apagado con drenaje: aviso a las salas ocupadas y 8 s de cortesía antes de cerrar | Las partidas dejan de morir en seco al desplegar |

**Nota sobre `overrides`.** El `package.json` forzaba `brace-expansion@^5` en todo el árbol. Se comprobó que la versión 5 cambió la API —ya no exporta la función directamente— y que eso **rompe a los dos consumidores del repositorio**: `minimatch@3` (que hace `require(...)()`) y `minimatch@9/10` (que hace `.default()`). El síntoma era que la herramienta de cobertura no arrancaba. Se sustituyó por overrides dirigidos a cada rama con la versión que respeta su contrato. Queda un aviso de `npm audit` en esa dependencia, **solo de desarrollo**: no viaja al servidor ni al cliente, y en producción siguen siendo 0 vulnerabilidades.

### Añadidos de producto

**Modo torneo (§6.2).** De tres a cinco pruebas encadenadas con clasificación acumulada (10·7·5·3·1 puntos por posición, desempate por pruebas ganadas). Está construido como un orquestador (`apps/server/src/rooms/tournament.ts`) por encima de la sala: reutiliza `MatchResult` y `rankPlayers` tal cual, y **ningún runner de juego sabe que está dentro de un torneo**. La clasificación viaja dentro de `room:state`, así que recargar a mitad de torneo la recupera sin pedir nada.

**Chat y reacciones (§6.1).** Dos canales para dos momentos: texto en el lobby (160 caracteres, 30 mensajes de historial, enfriamiento de 700 ms, hilo completo al entrar o reconectar) y seis reacciones con emoji durante la partida (efímeras, enfriamiento de 1,2 s). El catálogo de reacciones es cerrado en lugar de aceptar cualquier emoji: el servidor valida contra una lista y no hay que sanear texto arbitrario.

Un test del chat encontró un fallo real durante el desarrollo: el saneado eliminaba los caracteres de control en vez de sustituirlos por un espacio, de modo que `"hola\nmundo"` se convertía en `"holamundo"`. Corregido.

### Verificación final

| Comprobación | Antes de la auditoría | Ahora |
|---|---|---|
| `lint` | ✅ | ✅ |
| `typecheck` | ✅ | ✅ |
| `test` | 303 tests / 37 ficheros | **346 tests / 41 ficheros** |
| `test:coverage` | no existía | ✅ 83% líneas |
| `build` | ✅ 440 kB en un chunk | ✅ **335 kB** + 12 chunks por juego |

### Lo que sigue pendiente

- **H-04 (escalado horizontal con Redis)** y **H-14 (dependencias mayores)**: descartados en esta tanda por decisión de alcance. El primero solo importa si el juego se publica; el segundo es riesgo puro sin poder probar en navegador real.
- **H-16 (router e historial)**: el botón "atrás" del navegador sigue sin hacer nada útil.
- Del bloque de producto quedan sin hacer: espectador y repetición (§6.3), hándicap (§6.4), historial de sala persistente (§6.5), sonidos originales (§6.6) y etiquetas de aptitud móvil (§6.7).

---

## 9. Lo que esta auditoría no cubre

- **No se han ejecutado los tests E2E de Playwright** (requieren navegadores instalados); se ha verificado que las 9 pruebas existen y qué cubren, no que pasen hoy.
- **No se ha hecho prueba de carga real.** Las afirmaciones sobre número de salas sostenibles son estimaciones a partir de los límites configurados, no mediciones.
- **No se ha revisado el balance de jugabilidad** de los 14 juegos (dificultad de los bots, curva de los niveles de golf, equilibrio de los modos por equipos). Eso requiere jugar, no leer.
