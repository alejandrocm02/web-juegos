# Vista 3D

Billar, Bolos, Minigolf y Dardos tienen una vista 3D optativa que convive con la 2D. Por defecto
se sigue viendo la 2D.

## Cómo se activa

- Con el botón **«Probar la vista 3D (beta)»** de cada juego.
- Con `?mode=3d` en la URL (y `?mode=2d` para volver). La elección se recuerda
  en el navegador (`localStorage`, clave `arcade:render-mode`).

## Qué hace y qué no

La vista 3D **solo dibuja y recoge el gesto**. Las bolas y los bolos llegan del
servidor por el mismo snapshot que usa la 2D, y el golpe sale con la misma
acción (`pool:shoot`, `bowling:roll`). No hay ninguna regla ni física en el
cliente: cambiar de vista en mitad de una partida no altera nada.

- **Billar:** se apunta arrastrando hacia atrás en cualquier punto del lienzo
  (tirachinas), con cualquiera de las tres cámaras. Con teclado: flechas
  izquierda y derecha para apuntar (con Mayús, ajuste fino), arriba y abajo para
  la potencia, espacio para golpear y Escape para cancelar.
- **Bolos:** la cámara va detrás de la bola. Dirección, efecto y potencia se
  siguen eligiendo con los deslizadores HTML.

- **Minigolf:** el nivel se levanta a partir de la misma definición que usa el
  servidor (plataformas, superficies, paredes, bumpers, aspas, rampas), y los
  bordillos salen de `buildLevelWalls`, la función con la que el servidor
  calcula sus paredes. Un nivel nuevo aparece en 3D sin tocar la vista. Mismo
  gesto y mismo teclado que el billar; «Ver el nivel (Z)» sigue funcionando.
- **Dardos:** se toca la diana donde se quiere lanzar, como en 2D; el servidor
  aplica la dispersión y puntúa, y el dardo vuela hasta ese impacto. Con
  teclado: flechas para mover la mira (con Mayús, ajuste fino) y espacio.

## Vuelta automática a 2D

La sesión vuelve a 2D, sin salir de la partida y con un aviso, cuando:

- el navegador no tiene WebGL2 (ni siquiera se ofrece el botón);
- se pierde el contexto gráfico;
- el dispositivo baja de 25 fps: primero se reduce la calidad (sin sombras y a
  densidad 1) y, si sigue por debajo, se vuelve a 2D;
- falla la descarga o el render de la vista 3D.

## Código

| Archivo                                  | Qué contiene                                                  |
| ---------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/lib/renderMode.ts`         | Vista pedida, soporte de WebGL2 y fallback de la sesión       |
| `apps/web/src/components/RenderMode.tsx` | Botón 2D/3D y envoltorio que captura fallos de carga          |
| `apps/web/src/three/stage.ts`            | Renderer, luces, bucle, pausa, vigilancia de fps y `dispose`  |
| `apps/web/src/three/aim.ts`              | Puntería de tirachinas independiente de la cámara (con tests) |
| `apps/web/src/three/PoolBoard3D.tsx`     | Mesa de billar                                                |
| `apps/web/src/three/BowlingBoard3D.tsx`  | Pista de bolos                                                |
| `apps/web/src/three/GolfBoard3D.tsx`     | Recorrido de minigolf                                         |
| `apps/web/src/three/DartsBoard3D.tsx`    | Diana                                                         |

## Peso

Three.js no entra en el bundle inicial: se descarga al abrir la vista 3D.

| Trozo              | gzip     |
| ------------------ | -------- |
| Entrada inicial    | 60,5 kB  |
| Three.js + base 3D | 130,3 kB |
| Mesa de billar 3D  | 3,5 kB   |
| Pista de bolos 3D  | 2,6 kB   |
| Minigolf 3D        | 5,0 kB   |
| Diana 3D           | 2,7 kB   |

Three.js (130 kB) es el coste fijo de tener 3D; lo comparten todos los juegos
que se migren. No hay modelos ni texturas externas: todo es geometría y lienzos
generados en el cliente.

## Pendiente

- Medir fps en móviles reales de gama media.
- Probar en Firefox y Safari.
- Vibración y sonido propios de la vista 3D.
