# Escenario: calle, paredones, veredas y colectivos

Rediseño del mapa en sí (no de los obstáculos ni de la jugabilidad). Todo se
genera en el navegador con canvas y geometría propia; no se descarga ningún
recurso. Las texturas usan azar sembrado: el recorrido se ve igual en cada
partida.

## Calle y veredas (`world.js`, `street-textures.js`)

- **Calzada** de 12,8 m con una sola textura a escala (80 px/m, repetición de
  8 m): árido, huellas de rodadura más oscuras y algo más lisas en cada carril
  (mapa de rugosidad), fisuras selladas con brea y cordón cuneta de hormigón
  con juntas. Líneas de carril discontinuas de 3 m cada 4 m y bordes continuos.
- **Detalles por tramo** que avanzan con el recorrido: tapas de cloaca (OSSE),
  rejillas pluviales junto al cordón, bacheos y alguna mancha. Cuatro variantes
  fusionadas; cada tramo de 24 m usa una (un solo dibujo).
- **Veredas** de baldosa de 9 panes de 20 cm con relieve, abajo junto a la
  calzada y arriba del paredón, con cordón de granito. Se desplazan con la
  calzada sin saltos (repetición de 1 m).

## Paredones y costados

- **Hormigón encofrado** en escala real (6 m × 3,6 m por repetición): vetas de
  tablas, juntas de tongada y de paño, pasadores, chorreaduras desde el
  coronamiento, base húmeda con verdín y salitre, y descascarados. Pilastras
  cada 6 m y goterón bajo la reja. UV en metros para que nada se estire.
- **Grafitis** (Aldosivi, Alvarado, SPOT, Mar del Plata/La Feliz) ahora son solo
  pintura sobre ese hormigón, interrumpida por las pilastras.
- **Farolas LED** con base, columna cónica, brazo curvo y luminaria con difusor.
- **Edificios**: medianeras revocadas con manchas de humedad (textura compartida
  teñida con el color de cada lote) y techos planos con tanques de agua negros
  sobre estructura, salas de máquinas, aires acondicionados, antenas de TV y
  antenas satelitales (tres variantes con colores de vértice, un dibujo cada una).
  Para respetar el presupuesto de los edificios (105 mallas y 3.522 triángulos
  de promedio visibles), los techos aparecen en tres de cada cuatro lotes de
  techo plano y solo a menos de 60 m: 101 mallas y 3.035 triángulos de promedio.
- **Fondo**: edificios medianos y torres de departamentos con grilla de
  ventanas a escala, en lugar de cajas grises.

## Mobiliario de la vereda baja

Un atlas de textura (`streetAtlas`) y seis variantes por lado, una por tramo:
afiches pegados y rasgados (recitales, ferias, clases, alquileres, taller de
robótica de la Técnica 5, murga), refugios de parada con columnas, techo,
vidrio trasero, banco, panel publicitario y cartel de PARADA con las líneas 542,
720 y 563, cestos verdes y señales de velocidad máxima 40 y prohibido
estacionar. No aparece frente a los hitos. Un dibujo por tramo.

Los bacheos y tapas usan el mismo material PBR que el asfalto, con borde
semitransparente: antes, con otro modelo de luz, se veían como rectángulos negros.

## Colectivos (`bus.js`)

Mismas medidas de juego: caja de 2,1 × 2,6 × 10 m, techo transitable a 3,3 m,
rampas y colisiones sin cambios. Nuevo diseño:

- Vidrios en relieve (dieléctricos: oscuros de frente, reflejo del cielo en
  ángulo), parabrisas partido con limpiaparabrisas y luneta trasera.
- Puertas delantera y central del lado de la vereda (derecha del colectivo) con
  pasamanos; ventanilla del conductor del otro lado.
- Libreas por línea: 542 rojo y crema, 720 verde y amarillo, 563 azul y blanco,
  con franja curva, número grande, faja clara superior y suciedad de calle.
- Cartel de destino de LED ámbar emisivo adelante (línea y recorrido) y atrás.
- Faros, giros ámbar, luces traseras, luces de posición laterales, paragolpes,
  patente Mercosur, rejilla de motor trasero, espejos con brazo y ruedas
  completas con llanta.
- Techo claro con equipo de aire acondicionado y escotillas pintados al ras:
  sigue siendo transitable.

Cada colectivo son 5 piezas (carrocería, vidrios, metal, goma, luces) más la
rampa: menos que antes y por debajo del límite de 8 que verifican las pruebas.

## Costo y comprobación

Vista de juego con calidad alta: 437 dibujos y unos 33 mil triángulos (antes
377 y 20 mil). Las texturas se crean una sola vez y se comparten.

`node tests/capture-play.cjs` juega una partida real desde el menú (con
`main.js`) y comprueba que el navegador recibe el `world.js` actual.

Para jugar en local usar `python3 tools/serve.py`: desactiva la caché. Con
`python3 -m http.server` el navegador puede seguir mostrando el escenario viejo
después de un cambio.

```bash
node tests/capture-map.cjs test-results/map
```

Genera vista de juego, colectivos de cerca, veredas, fachadas y vista general.
