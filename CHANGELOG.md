# Changelog

Cambios visibles para quien juega o despliega, del más reciente al más antiguo.

## Sin publicar

### Corregido

- **Cuentas atrás sincronizadas con el servidor.** Cada equipo calculaba el tiempo restante con su propio reloj, así que un ordenador o móvil con la hora desajustada veía otro número (con un minuto de diferencia, 0 s durante toda la pregunta). Ahora el cliente mide el desfase con el servidor al conectar, cada minuto y al volver a la pestaña, y todos los jugadores ven el mismo tiempo. Afecta a Quiz, Dardos, Billar, Bolos, Songless, Blackjack y Tanques.

- **Minigolf: el golpe ya no se pierde al soltar fuera del campo.** En algunos móviles y con lápiz, soltar el dedo fuera del lienzo dejaba la bola bloqueada.
- **Billar: las bolas rápidas ya no se atraviesan.** Los choques se comprueban en cada subpaso de la física, y la simulación descarta golpes y pasos con valores no válidos.

### Corregido (auditoría visual de noviembre)

- **Bolos en móvil:** la pista y los controles ya caben en pantalla; antes quedaban cortados por la derecha.
- **Bolos:** los diez bolos se ven en triángulo y la bola ya no sale cortada.
- **Songless:** las respuestas vuelven a ser tarjetas con borde y color.
- **Billar:** fila de puntuación alineada.
- **Tenis de mesa y Head Basketball:** el marcador Rojo · VS · Azul cabe en una fila en móvil.
- **Lobby de práctica:** el título ya no se corta en móvil. **Dardos:** «1 disponible».

### Añadido

- **Portada nueva:** cada máquina muestra una escena de su juego, sus modos reales y, al pulsarla, abre la práctica de ese juego. En móvil van en dos columnas. Dos accesos nuevos: «Sorpréndeme» (juego al azar) y «Modo torneo».

- **Portada estilo sala recreativa:** cada juego aparece como una máquina con pantalla animada (se detiene con «reducir movimiento»).
- **Billar:** taco visible al apuntar y mesa con acabado de madera.

### Documentación

- Línea base de la Fase 0 de la renovación 3D (`docs/BASELINE.md`) y registro de bugs (`BUGS.md`).
