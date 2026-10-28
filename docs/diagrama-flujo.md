# Diagrama de flujo del juego

El [archivo editable de draw.io](diagrama-flujo.drawio) contiene seis páginas conectadas. Los bloques violetas permiten saltar a la página del subproceso. Cada bloque asociado a código incluye el archivo y su línea de referencia, correspondientes a la revisión del 28 de octubre de 2026.

| Página | Contenido | Vista previa |
| --- | --- | --- |
| 1. Inicio y navegación | Carga de la aplicación, menú, opciones y elección de modo. | [Abrir imagen](diagrama-flujo/inicio.png) |
| 2. Sesión, controles y pausa | Cámara, calibración, cuenta atrás, teclado, gestos y recuperación. | [Abrir imagen](diagrama-flujo/sesion.png) |
| 3. Bucle del juego | Actualización por fotograma, avance, mundo, física, dibujo e interfaz. | [Abrir imagen](diagrama-flujo/bucle.png) |
| 4. Física y colisiones | Vuelo, superficies, obstáculos, tropiezos y captura del profesor. | [Abrir imagen](diagrama-flujo/colisiones.png) |
| 5. Modo historia | Introducción, ida a casa, guardapolvo, regreso, derrota y victoria. | [Abrir imagen](diagrama-flujo/historia.png) |
| 6. Resultados y ranking | Derrota según el modo, guardado, errores y clasificación local. | [Abrir imagen](diagrama-flujo/resultados.png) |

Para editarlo, abrí `diagrama-flujo.drawio` en draw.io o diagrams.net. Las seis páginas aparecen como pestañas; todos los bloques, textos y conectores son editables.

## Lectura del flujo

Los óvalos indican inicio o continuidad; los rectángulos, procesos; los rombos, decisiones; los paralelogramos, entradas o salidas; los bloques violetas, subprocesos; y los rojos, derrota o error. Las flechas etiquetadas muestran las alternativas. Los eventos de cámara, teclado y botones pueden ocurrir mientras se ejecuta el bucle de fotogramas.

En el modo infinito, los puntos son `floor(distancia) + 10 × monedas`. El primer tropiezo activa cinco segundos de peligro; un nuevo tropiezo durante ese tiempo provoca captura. Un choque frontal con colectivo o un impacto contra un banco provoca derrota directamente.

En historia, las distancias predeterminadas son 650 m hasta casa y 2004 m acumulados hasta la escuela. El regreso conserva las monedas de la ida. Perder reinicia la ida con cero monedas; ganar ofrece guardar la suma de monedas en el ranking de historia.

## Estados de Game

| Estado | Significado |
| --- | --- |
| `ready` | Partida reiniciada y lista para comenzar. |
| `playing` | Avanzan la carrera, la física y la puntuación. |
| `paused` | Se dibuja la escena con la simulación congelada. |
| `waiting` | Se alcanzó el final de un tramo y StoryMode toma el control. |
| `over` | La partida terminó por choque o captura. |

## Alcance y comprobación

El diagrama resume el flujo de control de `main.js`, `game.js`, `session.js`, `story.js`, `pose.js`, `pose-worker.js`, `menu.js`, `collisions.js`, `leaderboard.js` y `ranking.js`. La construcción de personajes, materiales, edificios y decoraciones se agrupa como preparación del mundo; no se descompone cada rutina gráfica.

Se validó la estructura con la herramienta de la skill de draw.io: cero errores, solapamientos o cruces de conectores detectados. Las seis vistas se renderizaron con el visor oficial de draw.io y se comprobó que los conectores no atravesaran bloques ajenos ni hubiera etiquetas fuera de sus bloques. Esta comprobación corresponde al documento y su representación; no constituye una prueba de ejecución del juego.
