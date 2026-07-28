# Parque Arcade

Plataforma web de **minijuegos multijugador en tiempo real** para jugar con amigos, cada uno desde su propio ordenador. Salas privadas con código, entrada como invitado, anfitrión que configura la partida y cuatro juegos completos: **Billar**, **Quiz**, **Dardos** y **Minigolf de 10 hoyos**.

El servidor es **autoritativo**: valida jugadores, turnos, golpes, posiciones, puntuaciones, temporizadores y ganadores. El navegador solo envía intenciones y dibuja los snapshots que recibe.

---

## 1. Puesta en marcha

Requisitos: **Node.js 20.19 o superior** (o 22.12+) y npm 10+. Vite 7 no arranca con versiones anteriores.

```bash
# 1. Instalar dependencias de todo el monorepo (npm workspaces)
npm install

# 2. Copiar la configuración de ejemplo
cp .env.example .env          # en Windows PowerShell: copy .env.example .env

# 3. Preparar la base de datos SQLite (opcional pero recomendado)
npm run db:push               # crea apps/server/dev.db y genera el cliente Prisma

# 4. Arrancar servidor + cliente a la vez
npm run dev
```

- Cliente: <http://localhost:5173>
- Servidor y API: <http://localhost:3001> (`/api/health`, `/api/games`, `/api/leaderboard`)

Para jugar entre varios ordenadores de la misma red, arranca con `npm run dev` y ajusta en `.env`:

```env
CORS_ORIGINS=http://192.168.1.50:5173
PUBLIC_WEB_URL=http://192.168.1.50:5173
VITE_SERVER_URL=http://192.168.1.50:3001
```

> Si no ejecutas `npm run db:push`, la aplicación **funciona igualmente**: las estadísticas se guardan en memoria y el servidor lo avisa por consola. Las salas y partidas en curso viven siempre en memoria por diseño.

**Un único `.env`, en la raíz.** Los tres consumidores lo leen desde ahí:

- el servidor, porque `apps/server/src/env.ts` carga `apps/server/.env` y después el de la raíz;
- el cliente, porque `vite.config.ts` usa `envDir` apuntando a la raíz (por eso `VITE_SERVER_URL` funciona);
- Prisma, a través de `apps/server/scripts/run-prisma.mjs`, que carga el `.env` antes de invocar la CLI. La CLI de Prisma solo mira el directorio del esquema, así que sin ese envoltorio daría `Environment variable not found: DATABASE_URL`.

### Ejecución con Docker (opcional)

```bash
docker compose up --build
```

### Desplegar en Render (para jugar por internet)

El `Dockerfile` construye todo el monorepo y arranca **un único servicio** que sirve el cliente compilado y los WebSockets desde el mismo origen. No hay CORS entre partes ni un segundo despliegue que mantener.

1. Sube el repositorio a GitHub.
2. En Render: **New → Blueprint**, elige el repositorio. Render lee `render.yaml` y crea el servicio con el plan gratuito.
3. Espera al primer build (unos minutos) y comparte la URL que te da Render.

No hace falta configurar `CORS_ORIGINS` ni `PUBLIC_WEB_URL`: el enlace de invitación se construye en el navegador a partir del dominio real, así que funciona igual en local, en red local y en producción.

Dos avisos sobre el plan gratuito de Render:

- El servicio se duerme tras unos 15 minutos sin visitas y la primera carga tarda cerca de un minuto en despertar. Abre la URL antes de convocar a la gente.
- El disco es efímero: al reiniciar se pierde `dev.db` con las estadísticas históricas. Las partidas en curso no se ven afectadas porque siempre viven en memoria.

---

## 2. Comandos

| Comando                                   | Qué hace                                                      |
| ----------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                             | Compila los paquetes compartidos y arranca servidor + cliente |
| `npm run dev:server`                      | Solo el servidor (tsx watch)                                  |
| `npm run dev:web`                         | Solo el cliente (Vite)                                        |
| `npm run build`                           | Compila paquetes, servidor (tsc) y cliente (Vite)             |
| `npm start`                               | Arranca el servidor ya compilado (`apps/server/dist`)         |
| `npm run typecheck`                       | Comprobación de tipos de todos los workspaces                 |
| `npm run lint` / `npm run lint:fix`       | ESLint sobre todo el repositorio                              |
| `npm run format` / `npm run format:check` | Prettier                                                      |
| `npm test`                                | Tests unitarios y de integración (Vitest)                     |
| `npm run test:e2e`                        | Tests de extremo a extremo con dos navegadores (Playwright)   |
| `npm run db:push` / `npm run db:generate` | Prisma sobre SQLite (usan el `.env` de la raíz)               |
| `npm run check`                           | lint + typecheck + tests + build                              |

Para Playwright, la primera vez: `npx playwright install chromium`.

---

## 3. Arquitectura

```
arcade-party/
├─ apps/
│  ├─ server/            Express + Socket.IO + Prisma (servidor autoritativo)
│  │  ├─ src/rooms/      Room, RoomManager, contexto de juego
│  │  ├─ src/games/      quiz, dardos, billar, minigolf + puntuaciones
│  │  ├─ src/socket.ts   Eventos tipados y validados con Zod
│  │  ├─ src/security.ts Rate limiting y tamaño máximo de mensaje
│  │  └─ prisma/         Esquema SQLite de estadísticas
│  └─ web/               React + Vite + TypeScript + Tailwind
│     ├─ src/views/      Inicio, lobby, resultados, estados de error
│     ├─ src/games/      QuizView, DartsView, PoolView, GolfView
│     └─ src/store.tsx   Estado global y conexión Socket.IO
├─ packages/
│  ├─ shared/            Tipos, esquemas Zod, eventos, reglas, banco de quiz,
│  │                     los 10 niveles de minigolf y constantes comunes
│  └─ game-engine/       Física determinista reutilizable (golf y billar)
├─ e2e/                  Tests Playwright con dos navegadores
├─ Dockerfile            Imagen única: cliente + servidor en un proceso
├─ render.yaml           Despliegue de un servicio en Render
├─ .env.example
└─ docker-compose.yml
```

### Decisiones técnicas (y por qué se apartan del guion inicial)

1. **Física propia determinista en `packages/game-engine` en lugar de Matter.js.**
   El servidor debe simular con paso fijo y obtener siempre el mismo resultado. Matter.js no garantiza determinismo entre versiones ni plataformas y arrastra un motor de cuerpos rígidos genérico que aquí no hace falta: el minigolf y el billar solo necesitan círculos contra segmentos, zonas de superficie y obstáculos móviles. El motor incluido son ~600 líneas auditables, con paso fijo de 1/60 s, y está cubierto por tests.
2. **Render con Canvas 2D en lugar de Phaser 3.**
   Al ser el servidor autoritativo, el cliente **no simula**: interpola los snapshots recibidos a 20 Hz. La pila de escenas, loaders y física de Phaser sería peso muerto (~1 MB) para dibujar unos círculos y rectángulos. El render vive en `PoolView.tsx` y `GolfView.tsx` y usa la misma geometría declarativa que el servidor, así que ambos ven exactamente lo mismo.
3. **Minigolf en vista cenital 2.5D.** Los saltos de rampa usan una altura simulada (`z`) que afecta a las reglas (una bola en el aire ignora paredes y límites) y al dibujo (sombra y escala). Se mantiene todo en el mismo motor, sin una pila 3D aparte.

### Modelo de sincronización

```
Cliente                        Servidor
  |  game:action (intención)     |
  |----------------------------->|  Zod valida payload
  |                              |  Room comprueba sala, turno y fase
  |                              |  GameRunner valida la regla del juego
  |                              |  GolfWorld/PoolWorld simulan a 60 Hz
  |<-----------------------------|  game:snapshot a 20 Hz (posiciones)
  |<-----------------------------|  game:state en cada cambio relevante
  |<-----------------------------|  game:event (hoyo en uno, fuera, penalización)
```

El cliente **interpola** entre snapshots, por lo que el movimiento es fluido sin enviar un mensaje por frame. Nunca se acepta una posición, puntuación ni resultado enviado por el navegador.

---

## 4. Eventos de Socket.IO

Todos los payloads de cliente a servidor se validan con Zod (`packages/shared/src/events.ts`).

### Cliente → servidor

| Evento                 | Payload              | Reglas                                                                              |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `room:create`          | `{ name }`           | Nombre saneado, 2–16 caracteres                                                     |
| `room:join`            | `{ code, name }`     | Sala existente, con hueco, en lobby y sin nombre duplicado                          |
| `room:rejoin`          | `{ code, token }`    | Token anónimo guardado en `localStorage`                                            |
| `room:leave`           | —                    | Libera la plaza y promociona anfitrión si hace falta                                |
| `room:select-game`     | `{ game }`           | Solo anfitrión, solo en lobby                                                       |
| `room:update-settings` | `{ game, settings }` | Solo anfitrión, solo en lobby                                                       |
| `room:ready`           | `{ ready }`          | Cualquier jugador                                                                   |
| `room:start`           | —                    | Solo anfitrión y con 2–5 jugadores                                                  |
| `room:kick`            | `{ playerId }`       | Solo anfitrión, no a sí mismo                                                       |
| `room:transfer-host`   | `{ playerId }`       | Solo el anfitrión actual                                                            |
| `room:back-to-lobby`   | —                    | Solo anfitrión                                                                      |
| `game:action`          | unión discriminada   | `quiz:answer`, `darts:throw`, `pool:shoot`, `golf:shoot`, `golf:reset`, `golf:sync` |

### Servidor → cliente

| Evento          | Contenido                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `session`       | `{ playerId, token, code }` para reconexión                                                        |
| `room:state`    | Estado completo de la sala (jugadores, conexión, preparación, configuración, enlace de invitación) |
| `game:started`  | Juego elegido y estado inicial                                                                     |
| `game:state`    | Estado público del juego en curso                                                                  |
| `game:snapshot` | Posiciones de bolas (billar y minigolf) a 20 Hz                                                    |
| `game:event`    | Sucesos del minigolf: `ace`, `holed`, `out`, `penalty`, `reset`, `maxStrokes`, `timeUp`            |
| `game:over`     | Clasificación final y ganadores                                                                    |
| `room:kicked`   | Has sido expulsado                                                                                 |
| `app:error`     | `{ code, message }` con códigos tipados                                                            |
| `app:toast`     | Aviso puntual (individual o a toda la sala)                                                        |

---

## 5. Reglas de los juegos

### Billar (2–5 jugadores)

- Mesa cenital con bandas, fricción, seis troneras y física de bolas.
- Turnos rotatorios: apuntas con el ratón y arrastras hacia atrás para dar potencia.
- Solo el jugador activo puede lanzar; el turno cambia cuando **todas** las bolas se detienen.
- Cada bola de color embocada suma **1 punto**; embocar la blanca **resta 1** y se recoloca.
- La partida acaba cuando no quedan bolas de color. Gana quien más puntos tenga; puede haber empate.

### Quiz

- 10 preguntas (configurable 5–20), 4 respuestas, 15 s por pregunta (configurable).
- Respuestas simultáneas y ocultas hasta que todos contestan o expira el tiempo.
- 100 puntos por acierto + hasta 50 de bonificación por rapidez.
- Clasificación después de cada pregunta y clasificación final.
- Banco local de **46 preguntas en español** en siete categorías: cultura general, ciencia, historia, geografía, cine, música y tecnología.

### Dardos (301)

- Cada jugador empieza en 301 y tira **3 dardos por turno**.
- Diana con simples, dobles, triples, bull (25) y bullseye (50).
- Apuntas con el cursor y el **servidor** aplica una desviación aleatoria según la dificultad elegida.
- Si te pasas de los puntos restantes es **bust**: recuperas la puntuación con la que empezaste el turno.
- No hace falta cerrar a doble en este MVP. Gana quien llega exactamente a cero.

### Minigolf (10 hoyos)

Configuración del anfitrión, bloqueada al empezar:

- Colisión entre bolas activada o desactivada.
- Tiempo máximo por hoyo: 60, 90 o 120 s.
- Límite de golpes por hoyo: 8, 10 o 12.
- Reinicio automático al salir del recorrido.
- Penalización al salir del recorrido.

Juego:

- Todos juegan **a la vez**. Mantén pulsado y arrastra en dirección contraria al golpe: verás línea de dirección y medidor de potencia. Solo puedes golpear con la bola prácticamente detenida.
- Cámara que sigue la bola con suavizado; `Z` aleja la cámara para ver el nivel entero; `R` reinicia la bola con +1 golpe.
- Superficies con fricción distinta (césped, arena, hielo, piedra), pendientes, rampas de salto, obstáculos fijos y móviles, aspas giratorias, zonas de vacío y puntos de reaparición.
- La ronda termina cuando todos emboca, alcanzan el límite de golpes o se agota el tiempo (se aplica la puntuación máxima).
- Gana quien completa los 10 hoyos con menos golpes. Empate → menos tiempo total. Si persiste → empate compartido.
- Cada jugador tiene color **e icono** propios, para no depender solo del color.

**Hoyo en uno.** Se detecta explícitamente cuando la bola entra con el primer golpe del nivel y la bola sigue siendo elegible (un reinicio, una penalización o una corrección de posición invalidan el hoyo en uno). Se anuncia a toda la sala, se registra jugador, hoyo y tiempo, y el total aparece en el resumen final.

**Los 10 niveles** (campaña original "Parque Fantasía", con arte, nombres y trazados propios):

| #   | Nombre              | Dificultad  | Par | Hoyo en uno |
| --- | ------------------- | ----------- | --- | ----------- |
| 1   | Primer golpe        | Fácil       | 2   | ✅          |
| 2   | Rebote amistoso     | Fácil       | 2   | ✅          |
| 3   | Curva del jardín    | Fácil-media | 3   | —           |
| 4   | El molino           | Media       | 2   | ✅          |
| 5   | Caminos divididos   | Media       | 3   | —           |
| 6   | Salto de la cantera | Media       | 2   | ✅          |
| 7   | Puentes inquietos   | Media-alta  | 4   | —           |
| 8   | Caverna helada      | Difícil     | 4   | —           |
| 9   | Torre espiral       | Muy difícil | 5   | —           |
| 10  | Golpe maestro       | Experto     | 4   | ✅          |

Los cinco niveles marcados tienen una **ruta real de hoyo en uno basada en habilidad**, verificada por búsqueda exhaustiva sobre el propio simulador y fijada en los tests (`packages/game-engine/tests/golf.test.ts`): hay que acertar dirección, potencia y, en el molino, el momento del golpe.

---

## 6. Pruebas

```bash
npm test          # Vitest: 59 tests
npm run test:e2e  # Playwright: dos navegadores compartiendo sala
```

Cobertura de los tests exigidos del minigolf:

| Comprobación                                           | Dónde                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| Colisiones activadas y desactivadas                    | `packages/game-engine/tests/golf.test.ts`                           |
| Rechazo de potencia inválida                           | idem                                                                |
| Imposible golpear una bola en movimiento               | idem                                                                |
| Detección de bola fuera del recorrido                  | idem                                                                |
| Reaparición y penalización                             | idem                                                                |
| Detección de hoyo completado                           | idem                                                                |
| Detección correcta de hoyo en uno (y su invalidación)  | idem                                                                |
| Finalización por tiempo                                | idem + `apps/server/tests/golf-game.test.ts`                        |
| Límite de golpes                                       | idem                                                                |
| Suma de puntuaciones tras 10 niveles                   | `apps/server/tests/golf-game.test.ts`                               |
| Desempate por tiempo                                   | `apps/server/tests/scoring.test.ts`                                 |
| Reconexión durante un nivel                            | `golf.test.ts` + `apps/server/tests/integration.test.ts`            |
| Sincronización entre dos navegadores                   | `apps/server/tests/integration.test.ts` + `e2e/multiplayer.spec.ts` |
| Los niveles 1, 2, 4, 6 y 10 tienen ruta de hoyo en uno | `golf.test.ts`                                                      |

Además: reglas de sala (nombres duplicados, aforo, mínimo de jugadores, configuración bloqueada, transferencia de anfitrión, promoción automática), banco de preguntas, puntuación de la diana y simulación de billar.

---

## 7. Seguridad y robustez

- **Validación Zod** de todos los eventos entrantes; los payloads inválidos responden con `app:error` y nunca tocan el estado.
- **Rate limiting** por socket (60 mensajes / 5 s configurable) y límite de tamaño de mensaje (4 KB; el buffer de Socket.IO está limitado a 100 KB).
- **Rate limiting HTTP** (120 peticiones/minuto) y cabeceras de seguridad con Helmet.
- **CORS por entorno**: abierto en desarrollo, lista blanca de `CORS_ORIGINS` en producción.
- **Nombres** saneados (sin caracteres de control), longitud máxima y detección de duplicados ignorando acentos y mayúsculas.
- **Identificadores internos** (`randomUUID`) independientes del nombre; el token de reconexión son 24 bytes aleatorios.
- **Protección de turnos**: cada acción comprueba sala, fase, jugador y turno. En el golf, además, número de secuencia contra duplicados, potencia acotada, bola detenida obligatoria y límite de golpes.
- **Manejo centralizado de errores** en Express y en cada handler de socket, con logs legibles y niveles configurables.
- Sin secretos en el cliente: todas las variables sensibles viven en el servidor.

## 8. Persistencia

- Salas y partidas en curso: **en memoria**.
- SQLite vía Prisma para resultados y estadísticas: partidas ganadas, golpes totales y hoyos en uno.
- Limpieza automática de salas vacías (`ROOM_EMPTY_TTL_SECONDS`) y expulsión de desconectados sin vuelta (`RECONNECT_GRACE_SECONDS`).
- Token anónimo en `localStorage` para reconectar tras recargar. No se almacena ningún dato personal: el alias es el único texto que introduce el jugador.

---

## 9. Limitaciones conocidas

- Sin cuentas de usuario ni chat de voz o texto: el diseño es "abre el enlace y juega".
- Las salas viven en memoria y en un único proceso: al reiniciar el servidor se pierden las partidas en curso, y no hay escalado horizontal (haría falta un adaptador Redis para Socket.IO).
- El billar es una versión casual: no implementa efecto (spin), faltas por no tocar bola ni bola 8.
- Los dardos no exigen cierre a doble.
- El minigolf usa vista cenital 2.5D: los saltos se simulan con altura, no con una física 3D completa.
- La reproducción de sonidos del hoyo en uno se limita a un efecto sintetizado por el navegador (WebAudio), sin recursos externos.
- Playwright necesita descargar Chromium la primera vez (`npx playwright install chromium`).
- Si `npm audit` sigue avisando tras actualizar, borra `node_modules` y `package-lock.json` y reinstala: un `npm install` incremental conserva resoluciones antiguas del lockfile. Una instalación limpia da cero avisos.
- El repositorio fija `overrides: { "brace-expansion": "^5.0.8" }` para que `npm audit` quede a cero: la cadena `eslint → minimatch@3 → brace-expansion@1` arrastraba un aviso de denegación de servicio que solo afectaba a la herramienta de desarrollo.
- Prisma descarga sus motores nativos durante `npm install`; si no hay red, la aplicación cae automáticamente al almacén en memoria.

---

## 10. Créditos

Todo el contenido —niveles, nombres, geometría, textos, banco de preguntas y estilo visual— es original de este proyecto. No se han copiado mapas, texturas, sonidos ni nombres de ningún juego comercial.
