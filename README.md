# Parque Arcade

Plataforma web de **minijuegos multijugador en tiempo real** para jugar con amigos, cada uno desde su propio ordenador. Salas privadas con código, entrada como invitado y catorce juegos completos: **Billar**, **Quiz**, **Dardos**, **Minigolf**, **Bolos**, **Karts**, **Battle Royale**, **Blackjack**, **Songless**, **Air Hockey**, **Tenis de mesa**, **Head Soccer**, **Head Basketball** y **Tanques**.

También incluye **modo individual**: los catorce juegos se pueden practicar en solitario, con rivales controlados por el servidor en los juegos de duelo y marcas personales guardadas en todos. Ver [§6](#6-modo-individual).

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
2. Crea una base de datos PostgreSQL gratuita en [Neon](https://neon.com) o [Supabase](https://supabase.com) y copia su cadena de conexión.
3. En Render: **New → Blueprint**, elige el repositorio. Render lee `render.yaml` y crea el servicio con el plan gratuito. Te pedirá el valor de `DATABASE_URL`: pega ahí la cadena del paso 2.
4. Espera al primer build (unos minutos) y comparte la URL que te da Render.

**Por qué Postgres y no el SQLite de siempre.** El disco del plan gratuito de Render es efímero: se borra cada vez que el servicio se duerme y despierta. Con SQLite la aplicación funciona, pero las marcas personales del modo individual y las estadísticas desaparecen solas, que es justo lo contrario de lo que se espera de un récord. Una base externa gratuita lo resuelve sin coste.

El Postgres gratuito **del propio Render** no sirve para esto: caduca a los 30 días, con 14 más de gracia antes de borrar los datos ([changelog](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90)). Las capas gratuitas de Neon y Supabase no caducan por tiempo.

Si prefieres seguir con SQLite y asumir que los récords son de usar y tirar, pon `DATABASE_URL=file:./dev.db` y todo funciona igual.

No hace falta configurar `CORS_ORIGINS` ni `PUBLIC_WEB_URL`: el enlace de invitación se construye en el navegador a partir del dominio real, así que funciona igual en local, en red local y en producción.

Dos avisos sobre el plan gratuito de Render:

- El servicio se duerme tras unos 15 minutos sin visitas y la primera carga tarda cerca de un minuto en despertar. Abre la URL antes de convocar a la gente.
- El disco es efímero. Con `DATABASE_URL` apuntando a un Postgres externo esto deja de importar; con SQLite se pierden las estadísticas y las marcas en cada reinicio. Las partidas en curso nunca se ven afectadas porque siempre viven en memoria.

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
| `npm run test:coverage`                   | Lo mismo midiendo cobertura, con umbrales mínimos             |
| `npm run test:e2e`                        | Tests de extremo a extremo con dos navegadores (Playwright)   |
| `npm run db:push` / `npm run db:generate` | Prisma sobre SQLite (usan el `.env` de la raíz)               |
| `npm run check`                           | lint + tipos + tests + build + E2E                            |

Para Playwright, la primera vez: `npx playwright install chromium`.

---

## 3. Arquitectura

```
arcade-party/
├─ apps/
│  ├─ server/            Express + Socket.IO + Prisma (servidor autoritativo)
│  │  ├─ src/rooms/      Room, RoomManager, contexto de juego
│  │  ├─ src/games/      lógica autoritativa de los catorce juegos + puntuaciones
│  │  ├─ src/socket.ts   Eventos tipados y validados con Zod
│  │  ├─ src/security.ts Rate limiting y tamaño máximo de mensaje
│  │  └─ prisma/         Esquema SQLite de estadísticas
│  └─ web/               React + Vite + TypeScript + Tailwind
│     ├─ src/views/      Inicio, lobby, resultados, estados de error
│     ├─ src/games/      una vista React por juego
│     └─ src/store.tsx   Estado global y conexión Socket.IO
├─ packages/
│  ├─ shared/            Tipos, esquemas Zod, eventos, reglas, banco de quiz,
│  │                     los 10 niveles de minigolf y constantes comunes
│  └─ game-engine/       Física determinista reutilizable (golf, billar, bolos, karts, arena, deportes y tanques)
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

| Evento                 | Payload                             | Reglas                                                                              |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `room:create`          | `{ name }`                          | Nombre saneado, 2–16 caracteres                                                     |
| `room:create-solo`     | `{ name, profileId, game, config }` | Sala de práctica: un humano, bots opcionales                                        |
| `room:solo-config`     | `{ botCount, botDifficulty }`       | Solo en salas de práctica, solo en lobby                                            |
| `solo:records`         | `{ profileId }`                     | Devuelve las marcas personales del perfil anónimo                                   |
| `room:join`            | `{ code, name }`                    | Sala existente, con hueco, en lobby y sin nombre duplicado. Rechaza las de práctica |
| `room:rejoin`          | `{ code, token }`                   | Token anónimo guardado en `localStorage`                                            |
| `room:leave`           | —                                   | Libera la plaza y promociona anfitrión si hace falta                                |
| `room:select-game`     | `{ game }`                          | Solo anfitrión, solo en lobby                                                       |
| `room:update-settings` | `{ game, settings }`                | Solo anfitrión, solo en lobby                                                       |
| `room:tournament`      | `{ enabled }` o `{ enabled, settings }` | Solo anfitrión, solo en lobby, 3–5 pruebas distintas                            |
| `chat:send`            | `{ text }`                          | Saneado y máximo 160 caracteres, con enfriamiento de 700 ms                          |
| `chat:react`           | `{ reaction }`                      | Solo emojis del catálogo, con enfriamiento de 1,2 s                                  |
| `room:ready`           | `{ ready }`                         | Cualquier jugador                                                                   |
| `room:start`           | —                                   | Solo anfitrión, con 2–5 conectados y todos preparados                               |
| `room:kick`            | `{ playerId }`                      | Solo anfitrión, no a sí mismo                                                       |
| `room:transfer-host`   | `{ playerId }`                      | Solo el anfitrión actual                                                            |
| `room:back-to-lobby`   | —                                   | Solo anfitrión                                                                      |
| `game:action`          | unión discriminada                  | Acciones tipadas de los catorce juegos: respuestas, tiros, movimiento y controles   |

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
| `solo:outcome`  | Marca de la práctica recién terminada y si mejora el récord anterior                               |
| `solo:records`  | Listado completo de marcas personales del perfil                                                   |
| `app:error`     | `{ code, message }` con códigos tipados                                                            |
| `app:toast`     | Aviso puntual (individual o a toda la sala)                                                        |
| `tournament:state` | Clasificación general del torneo tras cada prueba                                               |
| `chat:history`  | Hilo completo al entrar o reconectar                                                               |
| `chat:message`  | Mensaje nuevo de la sala                                                                           |
| `chat:reaction` | Reacción efímera: se muestra unos segundos y no se guarda                                          |

También hay rutas HTTP: `GET /api/records?profileId=<id>` para las marcas y `GET /api/metrics`
con un resumen en texto plano del proceso (salas vivas, partidas en curso, jugadores conectados y
memoria) para saber de un vistazo si el servidor está sufriendo.

---

## 5. Reglas de los juegos

### Billar (2–5 jugadores)

- Mesa cenital con bandas, fricción, seis troneras y física de bolas.
- Turnos rotatorios: apuntas con el ratón y arrastras hacia atrás para dar potencia.
- Solo el jugador activo puede lanzar; el turno cambia cuando **todas** las bolas se detienen.
- Cada bola de color embocada suma **1 punto**; embocar la blanca **resta 1** y se recoloca.
- La partida acaba cuando no quedan bolas de color. Gana quien más puntos tenga; puede haber empate.

**Modo bola 8** (`pool.mode = 'bola8'`):

- Triángulo completo de **15 bolas**: lisas 1–7, rayadas 9–15 y la negra en el centro del rack.
- La mesa está **abierta** hasta la primera entrada limpia. Si en ese tiro entran bolas de los dos grupos, sigue abierta.
- Al cerrarse, el grupo se asigna al bando del tirador y el contrario recibe el otro. Con 3–5 jugadores se reparten dos bandos alternos que comparten grupo y victoria (la bola 8 es 1 contra 1 por naturaleza).
- Embocar bola propia conserva el turno; bola del rival o ningún acierto cede el turno.
- Embocar la blanca es **falta**: se recoloca y cambia el turno.
- Se gana embocando la negra **después** de limpiar el grupo propio. Meterla antes, o junto con la blanca, **pierde la partida**.
- Fuera de alcance en este MVP: bola cantada, falta por no tocar banda tras el impacto y bola en mano libre (la blanca se recoloca automáticamente).

### Quiz

- 10 preguntas (configurable 5–20), 4 respuestas, 15 s por pregunta (configurable).
- Respuestas simultáneas y ocultas hasta que todos contestan o expira el tiempo.
- 100 puntos por acierto + hasta 50 de bonificación por rapidez.
- Clasificación después de cada pregunta y clasificación final.
- Banco local de **151 preguntas en español** en siete categorías (21–22 por categoría): cultura general, ciencia, historia, geografía, cine, música y tecnología.
- **Las cuatro respuestas se barajan en cada partida.** Con el orden fijo, a la tercera partida se memoriza la posición del botón en lugar de la respuesta.
- El filtro de categorías se **respeta siempre**: si con las categorías marcadas no hay preguntas suficientes, la partida se acorta y se avisa, en vez de colar en silencio preguntas de categorías que nadie ha pedido. El lobby muestra cuántas hay disponibles antes de empezar.

### Dardos (301)

- Cada jugador empieza en 301 y tira **3 dardos por turno**.
- Diana con simples, dobles, triples, bull (25) y bullseye (50).
- Apuntas con el cursor y el **servidor** aplica una desviación aleatoria según la dificultad elegida.
- Si te pasas de los puntos restantes es **bust**: recuperas la puntuación con la que empezaste el turno.
- No hace falta cerrar a doble en este MVP. Gana quien llega exactamente a cero.

**Modo cricket** (`darts.mode = 'cricket'`):

- Números en juego: **15, 16, 17, 18, 19, 20, bull (25) y bullseye (50)**.
- Cada número necesita **3 marcas** para cerrarse: simple 1, doble 2, triple 3, bull 1 y bullseye 2.
- Las marcas de sobra puntúan solo si **algún rival** sigue con ese número abierto; si está cerrado por todos, el número queda muerto y no suma.
- Gana quien cierra **todos** los números y no va por detrás en puntos. Si cierra todo pero pierde en puntos, la partida continúa.
- El marcador muestra la notación clásica (`·`, `/`, `X`) con etiquetas de texto para lectores de pantalla.

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

### Blackjack (2–5 jugadores)

- Cada participante juega su mano por turnos contra un crupier controlado por el servidor.
- La segunda carta del crupier permanece oculta hasta que todos se plantan, consiguen 21 o se pasan.
- Los ases valen 11 o 1 automáticamente; las figuras valen 10 y un 21 inicial es blackjack natural.
- Puntuación por ronda: blackjack 3 puntos, victoria 2, empate 1 y derrota 0.
- Modos **Clásico**, **Rápido** (tres rondas) y **Alto riesgo** (blackjack de 4 puntos y el crupier pide con 17 suave).
- El anfitrión puede configurar 3, 5 o 7 rondas. Un turno agotado se planta automáticamente para que la mesa no quede bloqueada.
- El mazo, el reparto, las acciones válidas, el crupier y la clasificación se resuelven de forma autoritativa en el servidor.

### Songless (2–5 jugadores)

- Todos escuchan a la vez una melodía conocida interpretada con síntesis WebAudio local, sin grabaciones ni recursos externos.
- Cada ronda empieza con cuatro notas y amplía el fragmento hasta ocho y dieciséis; acertar antes concede más puntos.
- Las respuestas son simultáneas y permanecen ocultas hasta que todos contestan o termina el tiempo.
- Modos **Clásico**, **Relámpago** (cinco rondas y pistas cada tres segundos) y **Oído fino** (solo cuatro notas, hasta 500 puntos).
- El catálogo usa composiciones y canciones tradicionales de dominio público. La elección, los plazos y la puntuación se controlan en el servidor.

### Air Hockey (2–5 jugadores)

- Equipos rojo y azul repartidos de forma estable; cada participante controla su propio mazo dentro de su mitad.
- Control directo con ratón o pantalla táctil y alternativa con WASD o flechas.
- Modos **Clásico**, **Turbo** (disco y mazos un 28 % más rápidos) y **Gol de oro**.
- El anfitrión puede configurar partidas a 5, 7 o 9 goles en los modos largos.
- El servidor limita posiciones, simula colisiones y porterías a 60 Hz y distribuye snapshots a 20 Hz.

### Tenis de mesa (2–5 jugadores)

- Equipos rojo y azul con una pala por participante y peloteo simultáneo.
- El punto de contacto cambia el ángulo de devolución y cada golpe acelera ligeramente la pelota.
- Modos **Clásico**, **Rápido** (siempre a siete puntos) y **Vértigo** (pelota un 28 % más rápida).
- El anfitrión puede fijar el objetivo en 7, 11 o 15 puntos.
- Comparte el motor de red y movimiento de Air Hockey, pero usa colisiones rectangulares y reglas de mesa propias.

### Head Soccer (2–5 jugadores)

- Equipos rojo y azul en un campo lateral con movimiento, salto, remate, gravedad y colisiones autoritativas.
- Controles de teclado y botones táctiles: A/D o flechas para moverse, W/↑ para saltar y Espacio/K para rematar.
- Modos **Clásico**, **Turbo** (movimiento y balón un 25 % más rápidos) y **Gol de oro**.
- El anfitrión puede elegir partidas a 3, 5 o 7 goles; el gol solo cuenta por debajo del larguero.

### Head Basketball (2–5 jugadores)

- Reutiliza el movimiento lateral de Head Soccer con aros, rebotes de aro y detección de canasta descendente.
- Cada canasta suma dos puntos y el remate cercano orienta el tiro hacia el aro rival.
- Modos **Clásico**, **Rápido** (siempre a seis puntos) y **Gravedad baja** para jugadas aéreas.
- El anfitrión puede fijar el objetivo en 6, 10 o 14 puntos.

### Tanques (2–5 jugadores)

- Artillería lateral por turnos con trayectoria balística, viento variable, obstáculos y daño radial.
- Cada tanque puede gastar hasta tres cargas de combustible antes de disparar; el servidor valida movimiento, colisiones, impacto, blindaje y bajas.
- Modos **Clásico**, **Blitz** (70 PV, más daño y turnos de 18 segundos) y **Rebotes** (hasta dos rebotes en paredes u obstáculos).
- Tres campos propios: **Cañón Carmesí**, **Fortaleza Neón** y **Cráter Lunar**.
- Controles con botones, teclado y sliders de ángulo/potencia; la trayectoria discontinua es solo una ayuda visual y el servidor resuelve el disparo real.

---

### Marco visual común de las partidas

Todas las vistas de juego se montan dentro de `apps/web/src/components/GameStage.tsx`, que aporta:

- **Identidad por juego** mediante la variable CSS `--game-accent`, tomada de `GAME_META`. El halo de fondo y los bordes se derivan de ese único token con `color-mix`, así que ningún color queda escrito a mano en las vistas.
- **Cabecera de partida** con icono, nombre, insignia del modo activo y una línea de turno con `aria-live="polite"` (o "partida simultánea" en los juegos sin turnos).
- **Ayuda en pantalla** desplegable: la regla del modo sale del catálogo compartido `GAME_MODE_CATALOG` y los controles se declaran por juego.
- **Aviso de desconexión** con `role="status"` cuando algún jugador se ha caído, indicando que puede volver con el mismo enlace.
- **Momentos destacados**: los eventos que emite el servidor (`game:event`) se traducen en `components/highlights.ts` a un cartel central grande para hoyo en uno, strike, spare, bust, cierre exacto, eliminación y tanque destruido. El cartel usa fondo sólido para no poner texto grande sobre un degradado.

El texto del acento se aclara con `color-mix(... 45%, #ffffff)` porque el rojo y el azul puros no llegan a 4.5:1 sobre negro.

---

## 6. Modo torneo, chat y modo individual

### Modo torneo

En una sala normal, el anfitrión puede encadenar **de tres a cinco pruebas** con una clasificación
acumulada. No es un juego más: es un orquestador por encima de la sala que va lanzando partidas
normales y sumando puntos entre una y otra, así que ningún juego se entera de que está dentro de un
torneo.

- Reparto por prueba: **10 · 7 · 5 · 3 · 1** puntos según la posición. La curva es suave a propósito:
  una mala ronda no deja a nadie fuera y la última prueba sigue decidiendo.
- Los empatados cobran lo mismo (dos primeros se llevan diez puntos cada uno). Es más generoso que
  repartir, pero mucho más fácil de entender en pantalla.
- Desempate de la general: **pruebas ganadas**. Si persiste, se muestra empate compartido.
- Mientras dura el torneo, el juego seleccionado lo decide el orden de las pruebas: nadie puede
  cambiarlo a mitad, ni siquiera el anfitrión.
- Entre prueba y prueba, la pantalla de resultados muestra la clasificación de esa prueba **y** la
  general, con la siguiente prueba anunciada.
- La clasificación viaja dentro de `room:state`, así que quien recargue a mitad de torneo la
  recupera sin pedir nada.

Hay dos presets (**Clásico**, cinco pruebas; **Relámpago**, tres) o selección libre.

### Chat y reacciones

Dos canales para dos momentos distintos:

- **Chat de texto** en el lobby, donde hay tiempo de escribir. Máximo 160 caracteres, se conservan
  los 30 últimos mensajes y quien entra o se reconecta recibe el hilo completo. Enfriamiento de
  700 ms por jugador.
- **Seis reacciones** con emoji, disponibles también durante la partida, donde nadie va a soltar el
  ratón para teclear. Son efímeras: aparecen unos segundos flotando sobre el tablero y no se
  guardan. Enfriamiento de 1,2 s.

El catálogo de reacciones es cerrado en lugar de aceptar cualquier emoji: así el servidor valida
contra una lista, no hay que sanear texto arbitrario y la interfaz dibuja seis botones fijos.

En las salas de práctica no hay chat: no hay con quién hablar.

### Modo individual

Los catorce juegos se pueden practicar en solitario desde la pestaña **Practicar** de la pantalla de inicio.

### Cómo está construido

Una sala de práctica **es una sala normal** creada con `room:create-solo`. Solo cambian tres cosas:

- `minPlayers` baja a 1, así que un único jugador puede empezar.
- No se publica enlace de invitación y `room:join` la rechaza con el código `SOLO_ROOM`.
- El servidor puede sentar **bots** en los asientos libres.

Reutilizar la sala en lugar de escribir un modo aparte es deliberado: las reglas, la física, la validación de turnos y el cálculo de puntuaciones son exactamente los mismos que en multijugador. No hay una segunda implementación que pueda divergir.

### Rivales controlados por el servidor

Un bot es un `RoomPlayer` con `isBot: true`. Ocupa plaza, tiene color e icono propios y **el juego no sabe que no es humano**: sus acciones entran por `runner.handleAction()`, la misma puerta que las de un navegador, y pasan por la misma validación.

Quien las genera es el `BotDirector` (`apps/server/src/bots/`), que late a 20 Hz, lee el estado público de la partida y deja decidir a la IA correspondiente:

| Juego                         | Estrategia de la IA                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Karts                         | Apunta al centro de la siguiente puerta del circuito; con más destreza mira una puerta más allá y corta la curva                                             |
| Battle Royale                 | Prioriza no morir en la tormenta, recoge botiquín si le pilla de paso y persigue al rival más cercano                                                        |
| Air Hockey / Tenis de mesa    | Predice dónde cruzará la bola su línea de defensa, rebotes en banda incluidos                                                                                |
| Head Soccer / Head Basketball | Se coloca detrás del balón; salto y remate se disparan por flanco, como exige el simulador                                                                   |
| Tanques                       | Simula el disparo con las mismas ecuaciones del servidor y busca en una rejilla de ángulo y potencia el tiro que menos falla, esquivando su propia cobertura |

Tres dificultades (`facil`, `normal`, `dificil`) que ajustan destreza, ruido en las decisiones y tiempo de reacción. Un fallo de una IA se registra y se ignora: nunca tumba la partida del jugador.

Los siete juegos por turnos o de preguntas (billar, quiz, dardos, minigolf, bolos, blackjack, songless) se juegan **sin rivales**: ahí lo que se persigue es la marca propia. Los modos que necesitan contrincante (los de equipos y la bola 8) se ocultan del selector y el servidor los sustituye por el primer modo válido.

### Marcas personales

Al terminar, el servidor calcula la marca de la partida, la compara con la mejor guardada y emite `solo:outcome`. Cada juego mide lo que tiene sentido medir:

| Juego                                                   | Marca              | Mejor es |
| ------------------------------------------------------- | ------------------ | -------- |
| Quiz, Songless, Blackjack, Bolos, Billar                | Puntuación         | Más      |
| Air Hockey, Tenis de mesa, Head Soccer, Head Basketball | Puntos a favor     | Más      |
| Battle Royale, Tanques                                  | Eliminaciones      | Más      |
| Minigolf                                                | Golpes totales     | Menos    |
| Karts                                                   | Mejor vuelta       | Menos    |
| Dardos                                                  | Dardos para cerrar | Menos    |

En dardos solo cuenta si llegas exactamente a cero, y en karts solo si completas una vuelta válida: una partida abandonada no deja marca.

Se guardan en la tabla `SoloRecord` de SQLite, indexadas por un **identificador de perfil anónimo** que el navegador genera al azar la primera vez y conserva en `localStorage`. No hay cuentas, ni correo, ni nada que identifique a la persona: si se borra el almacenamiento, simplemente se empieza de cero.

### Flujo

1. Pestaña **Practicar** → nombre, juego y (si aplica) dificultad y número de rivales.
2. Se abre el lobby de práctica, donde se puede cambiar el juego, el modo, la configuración y los rivales.
3. La partida se juega igual que en multijugador.
4. La pantalla final muestra la clasificación y, encima, si la marca ha mejorado el récord.
5. Las marcas se listan en el inicio y en el lateral del lobby.

---

## 7. Pruebas

```bash
npm test             # Vitest: 346 tests
npm run test:coverage # Los mismos, midiendo cobertura
npm run test:e2e     # Playwright: dos navegadores compartiendo sala
```

Actualmente hay **346 tests Vitest** en 41 ficheros y 9 flujos E2E (5 multijugador en
`e2e/multiplayer.spec.ts` y 4 de modo individual en `e2e/solo.spec.ts`). GitHub Actions ejecuta el
control completo en cada pull request y cada actualización de `main`, mide la cobertura y conserva
las trazas de Playwright si falla.

### Cobertura

`npm run test:coverage` mide la lógica que se puede probar sin navegador: servidor, reglas
compartidas y simulaciones. Las vistas de React quedan fuera a propósito —se cubren con Playwright,
y contarlas aquí daría un porcentaje engañoso.

| Métrica     | Actual | Umbral mínimo |
| ----------- | ------ | ------------- |
| Líneas      | 83%    | 80%           |
| Sentencias  | 83%    | 80%           |
| Funciones   | 83%    | 80%           |
| Ramas       | 79%    | 75%           |

El umbral es de **no retroceso**: se sube cuando se añaden pruebas y no se baja para que pase una
entrega. Si la cobertura cae por debajo, `test:coverage` falla y el informe HTML queda en `coverage/`
y como artefacto de CI para ver qué se ha dejado de probar.

### Pruebas de abuso

`apps/server/tests/socket-abuse.test.ts` comprueba que el servidor aguanta a un cliente hostil:
ráfagas de eventos sin payload, mensajes desproporcionados, acciones fuera de sala, potencias
imposibles, nombres vacíos o duplicados, y el tope de salas del proceso.

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

Cobertura del modo individual:

| Comprobación                                                       | Dónde                                        |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Una sala de práctica arranca con un solo jugador                   | `apps/server/tests/solo-room.test.ts`        |
| Una sala normal sigue exigiendo dos                                | idem                                         |
| Los bots se sientan, se retiran y se reajustan al cambiar de juego | idem                                         |
| Nunca se supera el aforo de cinco                                  | idem                                         |
| La configuración se bloquea al empezar                             | idem                                         |
| Los modos por equipos y la bola 8 se sustituyen al jugar solo      | idem                                         |
| Un bot no puede ser anfitrión                                      | idem                                         |
| Cálculo de la marca de cada juego y dirección de la mejora         | idem                                         |
| Cada IA solo actúa sobre su juego y dentro de los límites válidos  | `apps/server/tests/bots.test.ts`             |
| El artillero acierta en difícil y esquiva su propia cobertura      | idem                                         |
| El salto del cabezón se dispara por flanco                         | idem                                         |
| Recorrido completo por sockets con marca guardada                  | `apps/server/tests/solo-integration.test.ts` |
| Nadie puede unirse a una práctica ajena                            | idem                                         |
| Se rechazan perfiles y configuraciones inválidos                   | idem                                         |
| Pestaña "Practicar" de punta a punta en navegador real             | `e2e/solo.spec.ts`                           |
| El lobby de práctica oculta invitación y "Estoy listo"             | idem                                         |
| La marca sobrevive a recargar la página                            | idem                                         |

Además: reglas de sala (nombres duplicados, aforo, mínimo de jugadores, configuración bloqueada, transferencia de anfitrión, promoción automática), banco de preguntas, puntuación de la diana y simulación de billar.

---

## 8. Seguridad y robustez

- **Validación Zod** de todos los eventos entrantes; los payloads inválidos responden con `app:error` y nunca tocan el estado.
- **Rate limiting** por socket (60 mensajes / 5 s configurable) y límite de tamaño de mensaje (4 KB; el buffer de Socket.IO está limitado a 100 KB). Los eventos sin payload (`room:start`, `room:back-to-lobby`, `room:leave`) pasan por el mismo limitador: arrancan o destruyen partidas enteras y alternarlos en bucle saturaría el proceso.
- **Rate limiting HTTP** (120 peticiones/minuto) aplicado solo a `/api`, excluyendo `/api/health` y los ficheros estáticos, para que recargar la página desde varios equipos tras el mismo NAT no consuma el presupuesto.
- **Tope de salas** (`MAX_ROOMS`, 500 por defecto): al alcanzarlo se rechazan las nuevas con un aviso claro en vez de agotar la memoria y tirar las partidas en curso.
- **Cabeceras de seguridad con Helmet**, incluida una **Content-Security-Policy** estricta en producción (`default-src 'self'`, sin `object-src`, sin `frame-ancestors`). El cliente no carga nada de terceros, así que la política no necesita excepciones más allá de los estilos en línea de Tailwind y del WebSocket de Socket.IO. En desarrollo se desactiva porque Vite sirve desde otro origen con HMR.
- **CORS por entorno**: abierto en desarrollo, lista blanca de `CORS_ORIGINS` en producción.
- **Nombres** saneados (sin caracteres de control), longitud máxima y detección de duplicados ignorando acentos y mayúsculas.
- **Identificadores internos** (`randomUUID`) independientes del nombre; el token de reconexión son 24 bytes aleatorios.
- **Protección de turnos**: cada acción comprueba sala, fase, jugador y turno. En el golf, además, número de secuencia contra duplicados, potencia acotada, bola detenida obligatoria y límite de golpes.
- **Sesión única por jugador**: crear o entrar en otra sala abandona la anterior; al reconectar se revoca el socket sustituido y una expulsión retira al cliente del canal.
- **Límites temporales autoritativos**: una respuesta de quiz recibida después del plazo se rechaza aunque el temporizador del proceso se ejecute con retraso.
- **Manejo centralizado de errores** en Express y en cada handler de socket, con logs legibles y niveles configurables.
- Sin secretos en el cliente: todas las variables sensibles viven en el servidor.

## 9. Persistencia

- Salas y partidas en curso: **en memoria**.
- Prisma para resultados y estadísticas: partidas ganadas, golpes totales y hoyos en uno.
- Marcas personales del modo individual en la tabla `SoloRecord`, indexadas por un identificador de perfil anónimo generado por el navegador. Si vienes de una base de datos anterior al modo individual, ejecuta `npm run db:push` para crear la tabla; mientras no exista, el servidor cae al almacén en memoria y avisa por consola.

### El proveedor lo decide `DATABASE_URL`

Prisma no admite `env()` en el campo `provider`: tiene que ser un literal en el esquema. Para no mantener dos esquemas en paralelo (que acabarían divergiendo), hay **uno solo** —`apps/server/prisma/schema.prisma`— y `scripts/prisma-schema.mjs` escribe una copia con el proveedor sustituido justo antes de invocar la CLI:

| `DATABASE_URL`          | Proveedor    | Cuándo                                              |
| ----------------------- | ------------ | --------------------------------------------------- |
| `file:./dev.db`         | `sqlite`     | Desarrollo local. Sin servicios externos.           |
| `postgresql://…`        | `postgresql` | Producción. Sobrevive a los reinicios del servicio. |
| Ausente o no reconocida | `sqlite`     | Valor por defecto seguro.                           |

La copia derivada (`schema.runtime.prisma`) se escribe en el mismo directorio que el original a propósito: así una ruta relativa como `file:./dev.db` sigue resolviendo al mismo sitio. Está en `.gitignore`.

Como el proveedor solo se conoce al arrancar, el `CMD` del Dockerfile regenera el cliente de Prisma en el arranque del contenedor en lugar de en la construcción de la imagen. Si algo falla, el servidor arranca igual y cae al almacén en memoria: se pierden las estadísticas históricas, pero las partidas funcionan.

- Limpieza automática de salas vacías (`ROOM_EMPTY_TTL_SECONDS`) y expulsión de desconectados sin vuelta (`RECONNECT_GRACE_SECONDS`).
- Token anónimo en `localStorage` para reconectar tras recargar. No se almacena ningún dato personal: el alias es el único texto que introduce el jugador.

---

## 10. Limitaciones conocidas

- Sin cuentas de usuario ni chat de voz o texto: el diseño es "abre el enlace y juega".
- Las salas viven en memoria y en un único proceso: al reiniciar el servidor se pierden las partidas en curso, y no hay escalado horizontal (haría falta un adaptador Redis para Socket.IO).
- El billar casual no implementa efecto (spin) ni faltas por no tocar bola. El modo bola 8 sí está completo en grupos, negra y faltas de blanca, pero no cubre bola cantada, falta por no tocar banda ni bola en mano libre.
- Los dardos 301/501 no exigen cierre a doble. El modo cricket sí implementa marcas, cierres, números muertos y la condición de ganar por puntos.
- El minigolf usa vista cenital 2.5D: los saltos se simulan con altura, no con una física 3D completa.
- La reproducción de sonidos del hoyo en uno se limita a un efecto sintetizado por el navegador (WebAudio), sin recursos externos.
- El rediseño profundo cubre el marco común (cabecera, modo, ayuda, avisos y momentos destacados) y el tablero del billar en bola 8 (rayadas con franja, negra en negro, panel de grupos). Los escenarios de karts, arena y bolos siguen con su arte original de la fase anterior: no se han rehecho sus fondos.
- Los bots del modo individual son deterministas por diseño dentro de cada dificultad: no aprenden ni se adaptan al rival entre partidas.
- Las marcas personales viven en el navegador (identificador anónimo en `localStorage`) y en la base de datos del servidor. No se sincronizan entre dispositivos ni sobreviven a borrar los datos del navegador.
- La regeneración del cliente de Prisma en el arranque del contenedor añade unos segundos al primer despliegue, a cambio de que la misma imagen sirva para SQLite y PostgreSQL sin reconstruirla.
- Playwright necesita descargar Chromium la primera vez (`npx playwright install chromium`).
- Si `npm audit` sigue avisando tras actualizar, borra `node_modules` y `package-lock.json` y reinstala: un `npm install` incremental conserva resoluciones antiguas del lockfile. Una instalación limpia da cero avisos.
- El repositorio fija `overrides: { "brace-expansion": "^5.0.8" }` para que `npm audit` quede a cero: la cadena `eslint → minimatch@3 → brace-expansion@1` arrastraba un aviso de denegación de servicio que solo afectaba a la herramienta de desarrollo.
- Prisma descarga sus motores nativos durante `npm install`; si no hay red, la aplicación cae automáticamente al almacén en memoria.

---

## 11. Créditos

Todo el contenido —niveles, nombres, geometría, textos, banco de preguntas y estilo visual— es original de este proyecto. No se han copiado mapas, texturas, sonidos ni nombres de ningún juego comercial.
