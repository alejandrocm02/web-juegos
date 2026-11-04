# Changelog

Cambios visibles para quien juega o despliega, del más reciente al más antiguo.

## Sin publicar

### Corregido

- **Cuentas atrás sincronizadas con el servidor.** Cada equipo calculaba el tiempo restante con su propio reloj, así que un ordenador o móvil con la hora desajustada veía otro número (con un minuto de diferencia, 0 s durante toda la pregunta). Ahora el cliente mide el desfase con el servidor al conectar, cada minuto y al volver a la pestaña, y todos los jugadores ven el mismo tiempo. Afecta a Quiz, Dardos, Billar, Bolos, Songless, Blackjack y Tanques.

- **Minigolf: el golpe ya no se pierde al soltar fuera del campo.** En algunos móviles y con lápiz, soltar el dedo fuera del lienzo dejaba la bola bloqueada.
- **Billar: las bolas rápidas ya no se atraviesan.** Los choques se comprueban en cada subpaso de la física, y la simulación descarta golpes y pasos con valores no válidos.

### Añadido

- **Portada estilo sala recreativa:** cada juego aparece como una máquina con pantalla animada (se detiene con «reducir movimiento»).
- **Billar:** taco visible al apuntar y mesa con acabado de madera.

### Documentación

- Línea base de la Fase 0 de la renovación 3D (`docs/BASELINE.md`) y registro de bugs (`BUGS.md`).
