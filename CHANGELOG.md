# Changelog

Cambios visibles para quien juega o despliega, del más reciente al más antiguo.

## Sin publicar

### Añadido

- **Tanques: el suelo deja de ser plano.** Cada mapa tiene colinas, lomas y hondonadas. Los tanques se inclinan con la pendiente, no pueden subir cuestas muy empinadas, los proyectiles chocan con las laderas y meterse en una hondonada sirve de cobertura. Las salidas están en zonas casi llanas. Se ve igual en 2D y en 3D.

## 18 de noviembre de 2026 (quinto despliegue)

### Añadido

- **Tanques: campo de batalla grande.** El campo pasa de 1000 a 2200 de ancho, con cámara que sigue al tanque, al proyectil y a la explosión, botón «Ver todo el campo» (V) y un radar con el campo entero. Los tres mapas se rehacen como campos de guerra: trincheras de sacos terreros, búnkeres, muros, torre de vigilancia, ruinas, cráteres, alambradas y restos humeantes, en 2D y en 3D. Los disparos llegan más lejos y cada turno hay cuatro movimientos en vez de tres.

## 18 de noviembre de 2026 (cuarto despliegue)

### Añadido

- **Minigolf: agua y hierba alta.** Si la bola cae al agua vuelve al punto desde el que golpeaste y suma un golpe (aunque la sala no penalice salirse). La hierba alta frena más que el césped pero deja rodar. Se estrenan en el hoyo 5, «Caminos divididos»: el camino de abajo pasa por hierba alta y termina junto a un estanque. Se ven en 2D y en 3D. Recoge las ideas del PR #36, que se cierra; el viento queda fuera.

## 18 de noviembre de 2026 (tercer despliegue)

### Corregido

- **La vista 3D ya no se pasa a 2D por tapar la ventana.** Con la ventana minimizada o detrás de otra, el navegador frena el dibujo a 1 fps y el juego lo confundía con un equipo lento.

## 18 de noviembre de 2026 (segundo despliegue)

### Cambiado

- **Los juegos se ven en 3D por defecto.** Billar, Bolos, Minigolf, Dardos, Tanques, Blackjack, Head Soccer, Head Basketball, Air Hockey, Tenis de mesa, Karts y Battle Royale abren directamente en 3D. La 2D sigue a un clic con «Volver a la vista 2D» y se recuerda; y si el dispositivo no tiene WebGL2 o va por debajo de 25 fps, la partida pasa sola a 2D sin cortarse. Quiz y Songless siguen como estaban.
- La preferencia de vista se guarda con otra clave: quien eligió la 2D cuando la 3D era una beta opcional también ve ahora la 3D (puede volver a la 2D y se recordará).

### Corregido

- **Minigolf en 2D:** al empezar un hoyo ya se ve el recorrido, no media pantalla vacía. La cámara sigue a la bola pero se detiene en los bordes del hoyo.

## 18 de noviembre de 2026

### Añadido

- **Las estadísticas ya no se borran.** Partidas, clasificación y marcas personales se guardan en Postgres (Neon) en lugar de un fichero dentro del contenedor, que Render vaciaba en cada despliegue y cada vez que el servicio se dormía. En local se sigue usando SQLite.

### Corregido

- **Battle Royale: los bots ya no te eliminan en segundos.** Durante los primeros 12 s recogen objetos en vez de ir a por ti, dejan más margen entre golpes cuanto más fácil es la dificultad y ya no se lanzan varios a la vez contra el mismo jugador. Quieto, con un bot fácil, ahora aguantas unos 23 s en vez de 7.
- **Avisos de gol, strike y demás en móvil:** salen sobre el campo y ya no tapan la cabecera de la partida.

### Documentación

- `BUGS.md` recoge el fallo de arranque en producción (resuelto en #62), la pérdida de estadísticas en cada despliegue y sube a P1 el bug de los bots de Battle Royale.

## 16 de noviembre de 2026

### Corregido

- **Producción vuelve a arrancar.** Tras pasar a Zod 4 la imagen de Render no encontraba la librería y el servidor no se ponía en marcha. La imagen ya incluye las dependencias de cada parte del proyecto, y la CI construye y arranca la imagen de producción en cada cambio para que no vuelva a pasar (#62).

### Rendimiento

- **La web carga unos 18 kB menos (gzip).** El navegador descargaba Zod, la librería con la que el servidor valida los mensajes, aunque nunca la usaba. Los esquemas están ahora en `@arcade/shared/schemas`, que solo importa el servidor.

### Mantenimiento

- Zod 4 en el servidor (#61).
- Dependencias actualizadas con Dependabot (#60).

### Problemas conocidos

- Las estadísticas se borran en cada despliegue: la base SQLite no sobrevive al reinicio del contenedor en el plan gratuito de Render. Ver `BUGS.md`.

## 9 de noviembre de 2026

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

### Corregido (bolos)

- **Triángulo como en una bolera:** el bolo 1 va delante y la fila de cuatro al fondo.
- **Turnos:** en partidas de varios jugadores se alterna frame a frame; antes cada uno jugaba la partida entera seguida.
- **Plenos:** se celebran como pleno, no como «10 bolos».
- **Efecto y potencia:** la línea de puntería muestra la curva real, y hasta el lanzamiento más flojo llega a los bolos.

### Añadido

- **Vista 3D de Billar y Bolos (beta):** optativa, con el botón «Probar la vista 3D» o `?mode=3d`. La 2D sigue siendo la vista por defecto y la partida la sigue resolviendo el servidor. Si el dispositivo no puede con ella, vuelve sola a 2D sin salir de la partida. Ver `docs/VISTA-3D.md`.
- **Vista 3D del resto de juegos (beta):** Tanques, Blackjack, Karts, Battle Royale, Air Hockey, Tenis de mesa, Head Soccer y Head Basketball. Mismas reglas y mismo servidor; solo cambia cómo se ve. Quedan en 2D Quiz y Songless.
- **Vista 3D de Minigolf y Dardos (beta):** mismas reglas y mismo servidor; el minigolf levanta en 3D los diez niveles con sus obstáculos móviles. Ambos se pueden jugar con teclado.
- **Billar con teclado** en la vista 3D: flechas para apuntar y dar potencia, espacio para golpear.
- **Portada nueva:** cada máquina muestra una escena de su juego, sus modos reales y, al pulsarla, abre la práctica de ese juego. En móvil van en dos columnas. Dos accesos nuevos: «Sorpréndeme» (juego al azar) y «Modo torneo».

- **Portada estilo sala recreativa:** cada juego aparece como una máquina con pantalla animada (se detiene con «reducir movimiento»).
- **Billar:** taco visible al apuntar y mesa con acabado de madera.

### Documentación

- Línea base de la Fase 0 de la renovación 3D (`docs/BASELINE.md`) y registro de bugs (`BUGS.md`).
