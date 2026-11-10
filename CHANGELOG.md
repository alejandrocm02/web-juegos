# Changelog

Cambios visibles para quien juega o despliega, del más reciente al más antiguo.

## Sin publicar

### Corregido

- **Cuentas atrás sincronizadas con el servidor.** Cada equipo calculaba el tiempo restante con su propio reloj, así que un ordenador o móvil con la hora desajustada veía otro número (con un minuto de diferencia, 0 s durante toda la pregunta). Ahora el cliente mide el desfase con el servidor al conectar, cada minuto y al volver a la pestaña, y todos los jugadores ven el mismo tiempo. Afecta a Quiz, Dardos, Billar, Bolos, Songless, Blackjack y Tanques.

- **Minigolf: el golpe ya no se pierde al soltar fuera del campo.** En algunos móviles y con lápiz, soltar el dedo fuera del lienzo dejaba la bola bloqueada.
- **Billar: las bolas rápidas ya no se atraviesan.** Los choques se comprueban en cada subpaso de la física, y la simulación descarta golpes y pasos con valores no válidos.

### Añadido

- **Vista 3D de Billar y Bolos (beta):** optativa, con el botón «Probar la vista 3D» o `?mode=3d`. La 2D sigue siendo la vista por defecto y la partida la sigue resolviendo el servidor. Si el dispositivo no puede con ella, vuelve sola a 2D sin salir de la partida. Ver `docs/VISTA-3D.md`.
- **Vista 3D de Minigolf y Dardos (beta):** mismas reglas y mismo servidor; el minigolf levanta en 3D los diez niveles con sus obstáculos móviles. Ambos se pueden jugar con teclado.
- **Billar con teclado** en la vista 3D: flechas para apuntar y dar potencia, espacio para golpear.

- **Portada estilo sala recreativa:** cada juego aparece como una máquina con pantalla animada (se detiene con «reducir movimiento»).
- **Billar:** taco visible al apuntar y mesa con acabado de madera.

### Documentación

- Línea base de la Fase 0 de la renovación 3D (`docs/BASELINE.md`) y registro de bugs (`BUGS.md`).
