# Revisión local de Parque Arcade

Repositorio: https://github.com/alejandrocm02/web-juegos. Fecha: 9 de octubre de 2026.
Las correcciones se prepararon en una copia local; esta revisión no incluyó un despliegue.

## Fallos confirmados y correcciones

| Prioridad | Reproducción del fallo anterior                                                                                                                                                 | Corrección                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alta      | Practicar cualquier juego, volver al lobby e intentar empezar otra vez: el botón quedaba deshabilitado sin un control «Estoy listo». Cambiar de juego también podía bloquearlo. | Las salas de práctica conservan a sus jugadores preparados. Las salas multijugador mantienen el requisito de confirmación.                                         |
| Alta      | Mantener W antes de terminar la cuenta atrás de Karts: la primera intención se descartaba y no se reenviaba al arrancar.                                                        | Reenvío al entrar en la fase activa y al reconectar; aplicado también a Arena y deportes de cabeza.                                                                |
| Alta      | Desconectar un jugador mientras acelera, se mueve o ataca: el servidor conservaba la última entrada.                                                                            | Neutralización al desconectar en Karts, Arena y deportes de cabeza, conservando la plaza recuperable.                                                              |
| Alta      | Abrir o recuperar la sesión en otra pestaña: la pestaña sustituida borraba la sesión compartida y podía intentar recuperarla de nuevo.                                          | La pestaña sustituida conserva los datos de recuperación de la nueva y deja de reclamar el token.                                                                  |
| Media     | Ver Karts, Arena o Bolos con densidad de pantalla 2x: parte del tablero quedaba vacía porque el dibujo anulaba la escala del lienzo.                                            | Cada renderizador restaura la transformación de su viewport.                                                                                                       |
| Media     | Desactivar objetos de Arena y pasar por sus posiciones: todavía otorgaban bonificaciones invisibles.                                                                            | La simulación tampoco crea, recoge ni regenera objetos cuando están desactivados.                                                                                  |
| Media     | Mantener W y flecha arriba, soltar solo uno; perder el foco; volver varias veces a un juego.                                                                                    | Seguimiento de teclas físicas, liberación al perder foco/ocultar pestaña y eliminación correcta de listeners. Los atajos respetan formularios, botones y diálogos. |
| Media     | Cancelar un arrastre de billar con el navegador/sistema: se ejecutaba el golpe.                                                                                                 | La cancelación descarta la intención y la pérdida de captura libera el gesto.                                                                                      |
| Media     | Cambiar de fase mientras el paddle tenía un envío pendiente.                                                                                                                    | La limpieza del temporizador también restablece su referencia, permitiendo nuevos envíos.                                                                          |
| Media     | Cambiar de ronda o salir de Songless durante la inicialización de WebAudio.                                                                                                     | Cancelación de reproducción pendiente, cierre de audio y temporizadores, y descarte de respuestas asíncronas antiguas.                                             |
| Media     | Bloquear localStorage o guardar una sesión JSON con campos incorrectos.                                                                                                         | Lectura tolerante a excepciones y validación de los campos antes de recuperar la sesión.                                                                           |
| Media     | Acceder desde otro dispositivo dejando la URL del servidor predeterminada.                                                                                                      | Cliente y API usan el origen del navegador; Vite reenvía las peticiones y WebSockets al servidor local.                                                            |
| Media     | Reconectar al Quiz tras responder: las opciones aparecían disponibles aunque el servidor ya había registrado la respuesta.                                                      | Desactivación basada también en los jugadores que han respondido.                                                                                                  |
| Media     | Finalizar una partida y volver al lobby antes de que termine el guardado de la marca.                                                                                           | Los resultados asíncronos de la partida anterior no vuelven a sobrescribir la pantalla actual.                                                                     |

## Jugabilidad, diseño y accesibilidad

- Controles táctiles disponibles también en tabletas y dispositivos con puntero grueso; botones de 56 px de alto, apariencia compartida y estado pulsado visible.
- Los botones mantenidos admiten Espacio/Intro y liberan su acción al cancelar el gesto, perder captura o perder foco.
- Los diálogos conservan el foco dentro de sus controles, admiten Escape, restituyen el foco anterior y no lo vuelven a robar con cada actualización del servidor.
- Arena agrupa las actualizaciones de orientación para evitar un mensaje por cada movimiento del puntero, manteniendo inmediatos los cambios de movimiento y ataque.
- Las acciones de juego sin conexión no se acumulan para reproducirse más tarde. Cada partida limpia el destacado de la anterior.
- Se conservan la estética, los fondos, los juegos y las dependencias principales del proyecto.

## Validación

`npm run check` termina con código 0:

| Control                                     | Resultado                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ESLint                                      | Correcto                                                                                              |
| TypeScript, todos los workspaces            | Correcto                                                                                              |
| Vitest                                      | 49 archivos, **414 pruebas aprobadas** (389 al inicio; 25 regresiones añadidas)                       |
| Compilación de paquetes, servidor y cliente | Correcta                                                                                              |
| Playwright con servidor compilado           | **23 recorridos aprobados**, incluidos los 14 juegos; 3,1 minutos                                     |
| Cobertura                                   | Código 0 y umbrales satisfechos: líneas 76,78 %, sentencias 74,03 %, funciones 74,84 %, ramas 64,10 % |

Las 14 pruebas nuevas terminan sin excepciones de página, errores de consola ni peticiones fallidas registradas en sus navegadores. El proxy de Vite emite avisos `ECONNABORTED` al cerrar algunas conexiones de prueba; los siguientes recorridos se conectan y completan correctamente. JSDOM avisa de que no implementa `scrollTo`; no afecta a los resultados de los tests ni al navegador real.

Las pruebas nuevas incluyen inicio, una acción real aceptada por el servidor, salida confirmada y segundo inicio de **los 14 juegos**, con densidad 2x, controles de tableta y comprobación de desbordamiento a **320, 768 y 1440 px**. Recogen excepciones de página, errores de consola y peticiones fallidas.

Las pruebas existentes comprueban también partidas compartidas, reconexión, navegación, deportes de cabeza, Tanques y una partida completa de Blackjack con marca personal conservada tras recargar. Las pruebas unitarias cubren reglas, puntuación, física, fases y resultados; se añaden regresiones específicas para los fallos corregidos.

## Dependencias y seguridad

La instalación inicial registraba 17 avisos: 5 moderados, 9 altos y 3 críticos. Las actualizaciones compatibles del lockfile reducen el total a **7: 3 moderados y 4 altos, sin críticos**. La auditoría con `--omit=dev` todavía registra **4 altos** en el árbol de Prisma (`prisma`, `@prisma/config`, `deepmerge-ts` y `mysql2`). Los avisos moderados restantes afectan al árbol de Vitest.

Las soluciones automáticas propuestas requieren cambios de versión fuera de las restricciones actuales, o versiones que no quedaron disponibles mediante la actualización compatible. Queda pendiente evaluar y actualizar esas ramas con su propia validación. La existencia del aviso en una dependencia no demuestra por sí sola que el recorrido del juego sea explotable.

Se revisan las validaciones y permisos existentes mediante las suites del servidor: entradas Zod, autoridad del anfitrión, límites de frecuencia y de mensajes, sesiones y acceso a salas. El proyecto usa identidades anónimas; no ofrece cuentas autenticadas ni marcas privadas. No se añaden credenciales al cliente ni al repositorio.

## Alcance y límites

- Las pruebas del navegador comprueban un recorrido principal por juego; no terminan manualmente cada partida de todos los modos, dificultades y configuraciones. Las condiciones de finalización adicionales se comprueban en las suites del servidor y del motor.
- La adaptación y entrada táctil se prueban mediante Chromium emulado. Queda pendiente comprobar Safari/iOS, Firefox, dispositivos físicos, lectores de pantalla y la audición/calidad subjetiva del audio.
- Se mejora el teclado en controles de movimiento y diálogos; los juegos basados en arrastrar y apuntar todavía requieren puntero para sus acciones principales. Queda pendiente una alternativa completa de teclado para esos gestos y una preferencia común para silenciar efectos automáticos.
- El entorno local usa Windows, Node 24 y SQLite. No se prueba un despliegue público, Docker, PostgreSQL ni carga de muchos usuarios concurrentes.
- Las salas siguen viviendo en memoria: un reinicio del servidor pierde partidas activas. Las marcas necesitan la base de datos preparada; el almacenamiento alternativo en memoria no persiste tras reiniciar.
- La revisión no constituye una auditoría exhaustiva de seguridad. Permanecen los avisos de dependencias descritos arriba.

## Ejecución local

```sh
npm ci
npm run db:push
npm run dev
```

Abrir http://localhost:5173. Para repetir la validación: `npx playwright install chromium`, `npm run check` y `npm run test:coverage`.
