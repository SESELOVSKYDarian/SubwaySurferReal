# Técnica Run · ambientación marplatense

## Obstáculos y entorno

- Salto: tablero de dibujo inclinado, superficie clara, cantos oscuros, regla
  paralela verde con escala y soporte metálico plegable, basado en la referencia.
- Agachado: banco de escuela con tablas gastadas, hueco, astillas y tornillos.
  Las patas quedan en los extremos para que el pasaje central sea legible.
- Colectivos: 542 rojo, 720 verde/amarillo y 563 azul, con carteles de línea,
  ventanas, puertas, ópticas, patente decorativa, neumáticos, llantas y espejos.
  Las libreas son interpretaciones de los colores pedidos, no réplicas de un
  coche o empresa particular. Se conservan rampas y techos transitables.
- Asfalto, señalización horizontal y veredas reemplazan vías y catenarias.
- Cuatro variantes de mural reutilizables: Aldosivi verde/amarillo, Alvarado
  azul/blanco, SPOT con blanco/naranja y órbita, y Mar del Plata/La Feliz.
  Se intercalan con muros sin pintar y firmas de barrio/taller.

Los límites físicos corresponden a los nuevos objetos: tablero hasta 1 m,
profundidad 1,08 m; banco entre 1,5 y 1,65 m, profundidad 0,8 m. Se mantiene
el apoyo unificado sobre el techo y el barrido de aterrizaje de los colectivos.

## Modelado y presupuesto

“64 polígonos” no es una especificación de realismo. Para esta revisión se usó
un presupuesto cercano a 64 mil **triángulos** por personaje en detalle alto:
64.286, más dos del distintivo. La cara y las manos usan una pasada de
subdivisión, el guardapolvo tiene 64 segmentos de contorno y las mangas 32.
El modelo mide 2.618.552 bytes. La versión de detalle bajo tiene 20.162
triángulos y 847.188 bytes (68,6 % menos geometría).

El profesor tiene mandíbula diferenciada, piel y pelo propios, guardapolvo gris
con distintivo y esqueleto independiente. Sigue siendo una representación
genérica, sin foto de su rostro. Las superficies de piel y tela tienen relieve
procedural sutil. Más geometría mejora la continuidad de las superficies;
no equivale por sí sola a un personaje fotorrealista de un juego AAA.

Ambos niveles comparten el mismo rig. Se intercambia la geometría, sin duplicar
la animación ni dibujar ambos modelos. Calidad equilibrada usa el nivel bajo;
automática también lo usa si la resolución adaptativa cae por debajo de 0,7.
El profesor reduce detalle si está a más de 10 m de la cámara. Los modelos se
cargan una sola vez y se reutilizan.

Los obstáculos escolares se fusionan por material y comparten sus geometrías.
Llantas, techo, paragolpes y brazos de espejos del colectivo se fusionan en una
pieza; las cajas de espejo en otra. No se crean texturas al generar obstáculos.
Las marcas viales usan instancias y se retiraron raíles, traviesas y catenarias.

## Reproducir y comprobar

```bash
python3 tools/build_student.py
python3 tools/build_student.py --low
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture:mdp
QUALITY=balanced CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run benchmark
```

Las capturas quedan en `test-results/`: colectivos, obstáculos escolares, alumno,
profesor y los cuatro murales. Se revisaron visualmente. La suite comprueba
colisiones de salto/agachado, tres líneas, geometría compartida, presupuesto y
cambio de detalle, además de seguimiento, brazos, pausa, rampas y aterrizajes.
El entorno de pruebas usa SwiftShader por software, no una GPU física. Sus FPS
no acreditan la fluidez en un teléfono o PC; hace falta probar el equipo destino.

Resultado de esta revisión: 13 pruebas aprobadas. En SwiftShader a 960×540,
calidad equilibrada y pixel ratio 1, se midieron 364 llamadas de dibujo y
78.432 triángulos; 30 cuadros dieron 384,43 ms de intervalo medio (2,60 FPS)
y 471,70 ms de percentil 95 de renderizado. Son mediciones de software,
sin cámara activa, y no se extrapolan a una GPU ni acreditan 60 FPS.

## Corrección del salto sobre rampas de colectivos

Se reprodujo el falso choque en 35 de 72 combinaciones de entrada, salto y
velocidad: la rampa avanzaba bajo los pies, pero el apoyo exigía velocidad
vertical negativa y comparaba solo la altura nueva. Un salto podía terminar
por debajo de la rampa antes de alcanzar el frente del colectivo.

Ahora se reconstruye la superficie del cuadro anterior usando el desplazamiento
real del colectivo y la posición lateral anterior del jugador. Se permite el
contacto cuando la misma rampa alcanza los pies, incluso durante el ascenso del
salto, incluyendo su transición al techo. Se usa una tolerancia de contacto de
4 cm en el techo redondeado. Saltar desde el suelo contra un colectivo sin rampa
sigue siendo un choque.

La regresión recorre rampas completas y saltos desde cinco alturas a velocidades
14, 24 y 34, en pasos de 20, 30, 60 y 120 Hz: 72 escenarios. Comprueba que se
alcanza el techo sin perder y añade cuatro controles de choque frontal sin rampa.

Validación de la corrección: 14 pruebas aprobadas con Chromium/SwiftShader,
incluidos los 72 recorridos de rampa y los cuatro controles frontales.
