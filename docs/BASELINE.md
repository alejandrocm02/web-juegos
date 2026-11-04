# Línea base — Fase 0 (renovación 3D)

**Fecha:** 4 de noviembre de 2026
**Base medida:** `origin/main` en `8a5e521` («fix: corrige reinicios, controles y renderizado de los juegos (#42)»)
**Entorno:** Node 22, build de producción del cliente servido con `vite preview`, Lighthouse 12 con Chrome headless.

## 1. Stack real frente al documento del proyecto

| Documento del proyecto         | Código real                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Frontend HTML/CSS/JS           | **React 18 + TypeScript + Vite 8 + Tailwind 4**, monorepo con npm workspaces              |
| Backend Node + Socket.IO       | Correcto: **Express 5 + Socket.IO 4**, TypeScript, validación con Zod                     |
| —                              | **Prisma 7** (SQLite en local; cae a memoria si no hay base de datos)                     |
| Billar, dardos, minigolf, quiz | **14 juegos** (ver §2)                                                                    |
| Sin tests                      | **Vitest + Playwright ya instalados**, CI en GitHub Actions (`npm run check`)             |
| Despliegue en Render           | Correcto: un servicio Docker (`render.yaml`, `Dockerfile`) que sirve cliente y WebSockets |
| Render 2D                      | Canvas 2D propio en 11 vistas; sin WebGL ni Three.js                                      |

Consecuencia para el plan: como el proyecto ya usa React, el documento admite **React Three Fiber** además de Three.js puro. Es una decisión pendiente.

Estructura:

```
apps/server        Express + Socket.IO, salas, bots, un GameRunner por juego
apps/web           React; una vista por juego, cargada con lazy() y prefetch
packages/shared    Tipos, eventos, reglas y estado público (fuente de verdad de contratos)
packages/game-engine  Simulaciones físicas (solo se ejecutan en el servidor)
e2e/               Playwright: solo.spec.ts y multiplayer.spec.ts
```

## 2. Inventario

**Juegos (14):** Billar, Quiz, Dardos, Minigolf, Bolos, Karts, Battle Royale (arena), Blackjack, Songless, Air Hockey y Tenis de mesa (arcade-sport), Head Soccer y Head Basketball (head-sport), Tanques. Todos tienen modo individual con bots o marcas personales.

**Servidor autoritativo:** física a 60 Hz, snapshots a 20 Hz, estado completo cada 0,5 s. El cliente envía intenciones, nunca resultados.

**Eventos Socket.IO (48):** `app:error`, `app:toast`, `arena:input`, `blackjack:hit`, `blackjack:stand`, `bowling:roll`, `chat:history`, `chat:message`, `chat:react`, `chat:reaction`, `chat:send`, `darts:throw`, `game:action`, `game:event`, `game:over`, `game:snapshot`, `game:started`, `game:state`, `golf:reset`, `golf:shoot`, `golf:sync`, `karts:input`, `pool:shoot`, `quiz:answer`, `room:back-to-lobby`, `room:create`, `room:create-solo`, `room:join`, `room:kick`, `room:kicked`, `room:leave`, `room:ready`, `room:rejoin`, `room:select-game`, `room:solo-config`, `room:start`, `room:state`, `room:tournament`, `room:transfer-host`, `room:update-settings`, `session:replaced`, `solo:outcome`, `solo:records`, `songless:answer`, `sport:input`, `tanks:fire`, `tanks:move`, `tournament:state`.

**Dependencias de cliente en producción:** `react`, `react-dom`, `socket.io-client`, `zod`, `@arcade/shared`.

## 3. Métricas

### Peso del bundle (build de producción)

| Recurso                       | Tamaño   | gzip        |
| ----------------------------- | -------- | ----------- |
| `index` (entrada)             | 193,3 kB | 60,7 kB     |
| `ui` (precargado)             | 144,1 kB | 42,1 kB     |
| CSS                           | 91,3 kB  | 16,5 kB     |
| Resto de la carga inicial     | ~4,7 kB  | ~2,1 kB     |
| **Total carga inicial**       | —        | **~121 kB** |
| Juego más pesado (`GolfView`) | 23,0 kB  | 7,9 kB      |
| Juego más ligero (`QuizView`) | 4,1 kB   | 1,6 kB      |

Presupuesto del proyecto: < 300 kB gzip inicial. **Margen actual: ~179 kB** para la base 3D y el lobby.

### Lighthouse (página de inicio)

| Categoría        | Móvil | Escritorio |
| ---------------- | ----- | ---------- |
| Rendimiento      | 99    | 100        |
| Accesibilidad    | 100   | 100        |
| Buenas prácticas | 96    | 96         |
| SEO              | 91    | 91         |

Móvil: FCP 1,7 s · LCP 1,7 s · TBT 50 ms · CLS 0 · 120 KiB transferidos.
Escritorio: FCP 0,4 s · LCP 0,4 s · TBT 0 ms · CLS 0.

Fallos detectados:

- **SEO:** `robots.txt` no existe (la ruta devuelve el HTML de la app). Tampoco hay `sitemap.xml` ni datos estructurados.
- **Buenas prácticas:** errores de consola de WebSocket. Son **esperados en esta medición** porque `vite preview` no levanta el servidor; hay que repetirla con el servidor arrancado.

### Tests

| Comprobación                                | Resultado                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run lint`                              | ✅ sin avisos                                                              |
| Vitest de `packages/` y `apps/web`          | ✅ **213 pruebas / 26 ficheros**                                           |
| Vitest de `apps/server`                     | ⚠️ no ejecutado aquí: el entorno no puede descargar los binarios de Prisma |
| CI de GitHub en `8a5e521` (`npm run check`) | ✅ verde: según `REVISION.md`, 414 pruebas y 23 recorridos E2E             |

### Pendiente de medir

- **fps por juego:** requiere el servidor en marcha y una partida activa. Se medirá en Fase 1 con Playwright (`requestAnimationFrame` durante 10 s) en escritorio y con CPU ralentizada ×4 para simular móvil.
- **Producción en Render:** no medida desde aquí. Conviene repetir Lighthouse sobre la URL pública.
- **Firefox y Safari:** las pruebas existentes solo usan Chromium.
