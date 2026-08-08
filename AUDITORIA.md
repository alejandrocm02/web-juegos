# Auditoría técnica — Parque Arcade

**Fecha:** 8 de agosto de 2026
**Base auditada:** `main` (`8886c6f`, tras la PR #14 "endurecer-y-pulir")
**Método:** lectura del código + ejecución real de `lint`, `typecheck`, `test`, `test:coverage` y `build` sobre instalación limpia.

> **Nota sobre una auditoría anterior.** La primera versión de este documento se escribió sobre la rama `modo-individual`, que estaba **12 commits por detrás de `main`**. Varios de sus "hallazgos críticos" ya estaban resueltos en `main` y el informe daba una imagen equivocada del estado real. Este documento lo sustituye por completo y parte del código que hoy está en producción.

---

## 1. Resumen ejecutivo

El proyecto está en muy buen estado. Es un monorepo coherente, con el servidor como única autoridad, contratos tipados y validados en el borde, 376 pruebas automáticas y una cobertura del 83% sobre la lógica que decide partidas. La capa de abuso —lo que suele faltar en proyectos de este tamaño— está seriamente trabajada: cuotas de salas y sockets por IP, techo global de proceso, limitador aplicado también a los eventos sin datos y pruebas dedicadas para cada límite.

Lo que queda no son agujeros, sino **techos**: un único proceso sin estado compartido, un bundle inicial que ya no baja por dividir vistas sino por lo que arrastra el propio lobby, y una accesibilidad que se detiene donde empieza el canvas.

| Área                       | Valoración | Comentario                                                         |
| -------------------------- | ---------- | ------------------------------------------------------------------ |
| Arquitectura y modularidad | 9/10       | Fronteras nítidas; `packages/shared` como única fuente de verdad   |
| Backend autoritativo       | 9/10       | El cliente envía intención, nunca resultado                        |
| Contratos y validación     | 9/10       | Zod exhaustivo, uniones discriminadas, rangos físicos acotados     |
| Seguridad y abuso          | 8/10       | Cuotas por IP, techo de proceso, CSP estricta, contenedor sin root |
| Tests                      | 9/10       | 376 pruebas, cobertura medida con umbral, componentes con jsdom    |
| Rendimiento cliente        | 7/10       | Vistas divididas y prefetch; el peso restante está en el arranque  |
| Escalabilidad              | 4/10       | Un proceso, estado en memoria, sin adaptador Redis                 |
| Accesibilidad              | 7/10       | Notable fuera del canvas; dentro, casi nada                        |
| Documentación              | 9/10       | README de 530 líneas con limitaciones incluidas                    |

---

## 2. Comprobaciones ejecutadas

Instalación limpia, Node 22:

| Comprobación            | Resultado                                                  |
| ----------------------- | ---------------------------------------------------------- |
| `npm run lint`          | ✅ sin avisos                                              |
| `npm run typecheck`     | ✅ limpio, con `noUncheckedIndexedAccess` activo           |
| `npm test`              | ✅ **376 pruebas / 44 ficheros**                           |
| `npm run test:coverage` | ✅ 83,5% líneas · 78,7% ramas · 83,1% funciones            |
| `npm run build`         | ✅ 335,7 kB iniciales (gzip 102) + 13 fragmentos por juego |
| `npm audit`             | ✅ **0 vulnerabilidades**, también en desarrollo           |

---

## 3. Puntos fuertes

**3.1. La capa de abuso está pensada por alguien que ha visto fallar un servidor.**
No es solo "hay rate limiting". Es que `activeRoomsForIp` cuenta salas _con gente conectada_ en lugar de salas existentes, y el comentario explica por qué: al cerrar la pestaña el jugador conserva la plaza durante el margen de reconexión, así que contar salas vacías agotaría el cupo de quien encadena partidas. Y elige recorrer en vez de llevar un contador, con el motivo escrito: un contador se desincroniza en alguna de las cinco rutas que lo tocan; recorrer no puede mentir. Ese nivel de razonamiento es raro.

**3.2. El servidor es autoritativo de verdad.**
`Room.handleAction` → `GameRunner.handleAction` es la única puerta, y los bots entran por ella igual que los humanos. Las simulaciones viven en `packages/game-engine` y solo se ejecutan en el servidor. Ningún cliente envía puntuaciones ni posiciones finales.

**3.3. Presupuesto de red deliberado.**
60 Hz de física, 20 Hz de snapshots, estado completo cada medio segundo, y las entradas continuas (karts, arena, deportes) se envían **solo al cambiar**, no por fotograma. Por eso cinco jugadores caben de sobra en el límite de 60 mensajes por 5 s.

**3.4. Tests que comprobarían una regresión real.**
`golf.test.ts` no afirma que el nivel 4 _esté marcado_ como apto para hoyo en uno: **simula el golpe** con ángulo y potencia concretos y verifica que entra. `pool.test.ts` comprueba que ninguna bola escapa de la mesa tras 627 ms de simulación. `limits.test.ts` cubre las cuotas incluyendo el caso sutil de la sala abandonada que libera su hueco.

**3.5. La reconexión está resuelta con cuidado.**
`markDisconnected` documenta y resuelve la carrera real (el socket nuevo llega antes del cierre del viejo). El resultado de partida viaja **dentro** de `room:state`, no solo en el evento efímero, así que recargar justo al terminar no rompe nada.

**3.6. Degradación elegante en persistencia.**
Si Prisma no está listo, `initStats` cae a memoria y la partida sigue. La decisión correcta para un juego: nunca sacrificar la partida por la base de datos.

**3.7. Carga diferida con prefetch.**
`registry.ts` no se limita a `lazy`: precarga el fragmento del juego seleccionado mientras la gente elige, de modo que al pulsar empezar el módulo ya está en caché. Y fuerza exhaustividad con un `Record<GameId, …>` para que añadir un juego y olvidarlo aquí sea un error de compilación.

---

## 4. Hallazgos

Severidad: 🟠 alto · 🟡 medio · ⚪ bajo

### 🟠 H-1 · Un solo proceso: sin escalado ni tolerancia a reinicios

Todo el estado vive en `Map` en memoria y cada partida con física abre su propio `setInterval` a 60 Hz (ocho juegos lo hacen). Consecuencias: un despliegue corta **todas** las partidas en curso, no se puede añadir una segunda instancia sin `@socket.io/redis-adapter` y estado compartido, y no hay medición de cuántas salas simultáneas aguanta el proceso.

Para jugar con amigos es irrelevante. Es el techo del proyecto si algún día deja de serlo.

_Mitigado en parte por el apagado con drenaje que añade esta entrega: las salas ocupadas reciben aviso y unos segundos antes del cierre._

### 🟠 H-2 · Sin alternativa de teclado dentro del juego

Fuera del canvas la accesibilidad es buena: `focus-visible` global, `prefers-reduced-motion` respetado en ambas hojas, `role="radiogroup"` en los selectores, `aria-live` en los avisos, y color **más** icono para identificar jugadores. Dentro del canvas, solo dardos y tanques tienen `onKeyDown`. Billar y minigolf exigen arrastrar con el ratón sin ninguna vía alternativa, así que son injugables sin él.

### 🟡 H-3 · `room.ts` con 800 líneas

Es el fichero con más responsabilidades del servidor: jugadores, anfitrión, bots, fases, ajustes, práctica en solitario y —desde esta entrega— torneo y chat. Ya no es fácil de leer de una sentada. Los candidatos naturales a salir son la gestión de bots y el chat, que apenas tocan el resto.

### 🟡 H-4 · `quiz.ts` con 1.268 líneas de datos mezclados con lógica

Tras ampliar el banco a 151 preguntas, el fichero es sobre todo contenido. Separar el banco (datos) de las funciones (`quizPool`, `shuffleQuizAnswers`) facilitaría ampliarlo sin abrir un fichero de mil líneas, y abriría la puerta a cargarlo desde JSON.

### 🟡 H-5 · El bundle inicial ya no baja dividiendo vistas

335 kB (102 gzip) tras separar los catorce juegos. Lo que queda es React, el lobby y los datos compartidos que el lobby necesita (niveles de golf, mapas de tanques, circuitos). El siguiente recorte real pasa por que esos catálogos viajen desde el servidor en vez de compilarse en el cliente.

### 🟡 H-6 · Sin métricas históricas ni alertas

`/api/metrics` (nuevo en esta entrega) da una foto del instante, pero nadie la guarda ni la vigila. Si el proceso empieza a sufrir, la única señal es que alguien se queje.

### ⚪ H-7 · Sin control del historial del navegador

Solo se lee `?code=` al arrancar. El botón "atrás" saca de la aplicación en lugar de volver al lobby. No hay router.

### ⚪ H-8 · Dependencias con una mayor de retraso

React 18 (→19), Prisma 5 (→7), Express 4 (→5), Tailwind 3 (→4), Zod 3 (→4). Ninguna urgente y ninguna con CVE en producción. Dependabot ya tiene abiertas las PR: **vite 7→8 y express-rate-limit 7→8 pasan el CI**; **tailwind 3→4 y express 4→5 fallan**, que son justo las dos que rompen (Tailwind cambia el sistema de configuración; Express 5 rompe el `app.get('*')` que sirve el cliente).

### ⚪ H-9 · El resultado de un torneo se archiva bajo el último juego

`Tournament.finalResult` reutiliza `MatchResult`, que exige un `GameId`. Se guarda el de la última prueba para no inventar un identificador que el resto del sistema no conoce. Las estadísticas históricas contarán ese torneo como una partida de ese juego. Es una simplificación consciente y documentada; si algún día importa, la tabla necesita una columna propia.

---

## 5. Qué mejoraría

1. **Alternativa de teclado en billar y minigolf** (H-2): ángulo con flechas, potencia con una barra que sube y baja, disparo con espacio. Es el hallazgo con más impacto humano de la lista.
2. **Sacar bots y chat de `room.ts`** (H-3) y **separar datos de lógica en el quiz** (H-4).
3. **Persistir las métricas** (H-6): volcar `/api/metrics` a la base cada minuto ya permite ver una curva.
4. **Router e historial** (H-7).
5. **Dependencias por lotes**, empezando por las dos PR de Dependabot que ya pasan el CI, y dejando Tailwind y Express para sesiones dedicadas.
6. **Catálogos desde el servidor** (H-5), si el arranque llega a molestar.
7. **Redis y estado compartido** (H-1), solo si el objetivo pasa a ser servicio público.

---

## 6. Qué añadiría

**6.1. Espectador y repetición.** Ya se guardan snapshots: un espectador para el eliminado en la arena, o una repetición de tres segundos del hoyo en uno, aprovechan infraestructura existente.

**6.2. Hándicap.** Una pequeña ventaja para quien va último mantiene vivas las partidas de cinco donde uno domina.

**6.3. Historial de sala persistente.** `MatchRecord` ya se guarda; falta exponerlo: "habéis jugado 12 partidas, Ana lidera 5-3-2". Es lo que fideliza a un grupo fijo.

**6.4. Sonido con identidad.** Hay `sound.ts` y `songless-audio.ts`; faltan efectos propios para los hitos (hoyo en uno, strike, victoria de torneo). Sintetizados con Web Audio pesan cero y no tienen problemas de licencia.

**6.5. Etiquetas de aptitud móvil.** Quiz, dardos y blackjack se juegan bien desde el móvil de un invitado sin portátil. Marcarlo en el lobby es honesto y útil.

**6.6. Editor de niveles de golf.** Los diez niveles son datos declarativos, así que es viable. Solo cuando el resto esté pulido.

---

## 7. Backlog priorizado

| #   | Acción                                     | Impacto | Esfuerzo | Prioridad          |
| --- | ------------------------------------------ | ------- | -------- | ------------------ |
| 1   | Teclado en billar y minigolf (H-2)         | Alto    | M        | Siguiente          |
| 2   | Fusionar las PR verdes de Dependabot (H-8) | Medio   | XS       | Siguiente          |
| 3   | Historial de sala persistente (6.3)        | Alto    | S        | Siguiente          |
| 4   | Hándicap (6.2)                             | Medio   | S        | Siguiente          |
| 5   | Sacar bots y chat de `room.ts` (H-3)       | Medio   | M        | Cuando duela       |
| 6   | Separar datos y lógica del quiz (H-4)      | Bajo    | S        | Cuando duela       |
| 7   | Persistir métricas (H-6)                   | Medio   | S        | Cuando duela       |
| 8   | Espectador y repetición (6.1)              | Medio   | M        | Cuando duela       |
| 9   | Sonidos propios (6.4)                      | Medio   | M        | Cuando duela       |
| 10  | Router e historial (H-7)                   | Bajo    | S        | Mantenimiento      |
| 11  | Tailwind 4 y Express 5 (H-8)               | Bajo    | M        | Sesión dedicada    |
| 12  | Redis y estado compartido (H-1)            | Alto*   | L        | Solo si se publica |

\* Alto solo si el objetivo deja de ser "jugar con amigos".

---

## 8. Lo que trae esta entrega

| Cambio                               | Por qué                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modo torneo**                      | De 3 a 5 pruebas encadenadas con general acumulada (10·7·5·3·1, desempate por pruebas ganadas). Orquestador por encima de la sala: reutiliza `MatchResult` y ningún juego sabe que está dentro de un torneo.                                                                                                                                          |
| **Chat y reacciones**                | Texto en el lobby (160 caracteres, 30 de historial, hilo completo al entrar) y seis reacciones efímeras en partida. Contexto propio para que un emoji no repinte el lobby ni un `game:state` repinte el chat.                                                                                                                                         |
| **Quiz: 46 → 151 preguntas**         | Con 46, a la tercera partida se repiten. Además las respuestas se **barajan por partida**: con el orden fijo se memoriza la posición del botón, no la respuesta.                                                                                                                                                                                      |
| **Filtro de categorías respetado**   | Antes, si no había preguntas suficientes se rellenaba en silencio con todas las categorías. Ahora la partida se acorta y se avisa, y el lobby muestra cuántas hay.                                                                                                                                                                                    |
| **`GET /api/metrics`**               | Salas, partidas, jugadores y memoria en texto plano. Antes no había forma de saber si el proceso sufría.                                                                                                                                                                                                                                              |
| **Apagado con drenaje**              | Las salas ocupadas reciben aviso y 8 s antes del cierre, en vez de morir en seco al desplegar.                                                                                                                                                                                                                                                        |
| **Rate limit HTTP acotado a `/api`** | Cubría también los estáticos: cinco amigos tras el mismo NAT gastaban cuota solo recargando.                                                                                                                                                                                                                                                          |
| **Cobertura con umbral**             | 83% de líneas medido, con umbral de no retroceso en CI e informe como artefacto.                                                                                                                                                                                                                                                                      |
| **`overrides` reparados**            | El `brace-expansion: ^5` global rompía a los dos `minimatch` del árbol (uno llama al módulo como función, otro a `.expand()`) e impedía arrancar la cobertura. Además `@testing-library/react` se traía React 19 junto al 18 de la app en instalación limpia. Ambos dirigidos ahora; el árbol queda en **0 vulnerabilidades**, también en desarrollo. |

---

## 9. Lo que esta auditoría no cubre

- **No se han ejecutado los E2E de Playwright**: el entorno de análisis no tiene navegadores. Se ha verificado que las nueve pruebas existen y qué cubren, no que pasen hoy.
- **No hay prueba de carga real.** Lo dicho sobre salas simultáneas es estimación a partir de los límites configurados.
- **No se ha revisado el balance de jugabilidad** (dificultad de los bots, curva de los niveles, equilibrio de modos por equipos). Eso requiere jugar, no leer.
