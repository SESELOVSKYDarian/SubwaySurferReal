# Visibilidad y animación del corredor

## Cámara

`camera-rig.js` mantiene la tercera persona y anticipa el carril seleccionado.
La cámara sigue lateralmente al alumno, con altura base de 4 m, distancia mínima
7,8 m y encuadre más amplio en vertical. Ante un colectivo que pasa cerca sube
hasta 5,5 m sobre la superficie de apoyo. Posición y dirección de mirada se
suavizan, también al subir o bajar de un techo.

Se comprueba la línea de visión hacia el alumno y los carriles laterales con
segmentos contra cajas del colectivo. Si un colectivo cercano todavía obstruye,
su opacidad baja gradualmente a 0,22 y se recupera al despejar el paso. Los
colectivos lejanos que anuncian un obstáculo permanecen opacos. La rampa conserva
su opacidad. Esto no altera superficies ni colisiones.

Los materiales se clonan solo la primera vez que un colectivo necesita atenuarse;
las texturas siguen compartidas. Los clones se liberan al reciclar el objeto o
reiniciar. La pausa congela cámara, animación y atenuación.

## Lectura de obstáculos y murales

Los bancos rotos tienen pintura verde visible en tablas y patas, con desgaste y
un aporte tenue de color para distinguirlos a distancia y en sombra. Mantienen
las mismas dimensiones y el hueco para agacharse.

Los murales se dibujan a 2048 × 480, con menos firmas superpuestas, menor suciedad
sobre las letras y hiedra limitada al borde superior. Un aporte moderado de luz
en el material evita perder la pintura en el muro sombreado. Las cuatro variantes
Aldosivi, Alvarado, SPOT y Mar del Plata siguen reutilizándose.

## Animación

La carrera tiene zancada más amplia, codos flexionados, muñecas relajadas, balanceo
contrapuesto de pelvis y hombros y oscilación vertical pequeña. El apoyo de las
suelas se corrige con una muestra de vértices de los zapatos, sin recorrer todo
el cuerpo. Las muestras se almacenan por geometría, incluyendo ambos niveles de
detalle, para que el cambio de calidad no deje índices del modelo anterior.

El salto distingue ascenso, ápice y descenso: flexión variable y piernas en
posiciones distintas. Al aterrizar hay una compresión breve que se disipa. El
cambio de carril añade giro suavizado; agachado, vuelo y alcance del profesor
mantienen sus mezclas propias. La pausa no avanza estas transiciones.

Con cámara corporal, las manos descansando dejan actuar el braceo de carrera;
levantar una mano mezcla progresivamente el seguimiento de ese brazo. El otro
brazo sigue animado. La iluminación indirecta del cielo permite leer mejor tela
y anatomía sin aumentar el número de polígonos. Se conserva el rig actual:
esta revisión no equivale a sustituirlo por un personaje AAA ni añade dedos
articulados o animación facial.

## Verificación

```bash
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture:visibility
```

Capturas en `test-results/`: cámara antes/después, formato vertical, carrera,
salto y agachado. La comparación usa el mismo escenario con el encuadre anterior
y el nuevo. Las pruebas cubren seguimiento lateral, visibilidad del carril
contiguo, encuadre de los tres carriles, recuperación de opacidad, aislamiento y
liberación de materiales, color del banco, suelas en ambos niveles de detalle,
flexión de codos, salto, giro y aterrizaje. Se conservan las regresiones de pausa,
agachado, brazos de cámara y las 72 combinaciones de rampas de colectivos.
La validación gráfica usa SwiftShader; no acredita FPS en un dispositivo físico.

Resultado: 17 pruebas aprobadas. Tras ajustar la coordinación de brazos/piernas
y el sentido del giro se repitieron las regresiones de animación y seguimiento,
también aprobadas. Las capturas se revisaron en escritorio y formato vertical.
