# Técnica: personaje y corrección de animaciones

## Problemas corregidos

- El agachado anterior giraba el modelo a partir de `rollTimer`. Las detecciones
  sostenidas y las teclas repetidas cambiaban ese temporizador y hacían saltar el
  ángulo. Ahora sostiene una postura baja sin girar ni escalar todo el cuerpo.
- El salto anterior mantenía la carrera y añadía giros a sus huesos. Ahora carrera,
  salto, agachado y vuelo tienen estados mezclados sin acumulación de rotaciones.
- La trayectoria del salto usa la ecuación balística por paso; se redujo la
  dependencia de la tasa de cuadros. Repetir Espacio no encadena saltos y repetir
  agachado durante una caída no reinicia su velocidad vertical.
- La altura efectiva de colisión interpola entre 2,1 m y 1,2 m según la postura
  visible, en lugar de reducirse instantáneamente a 0,9 m.
- La pausa ahora congela animaciones, cámara y objetos. Monedas y jetpacks que
  estén cerca no se retiran sin recogerse mientras la partida está pausada.
- Reiniciar limpia el salto en espera y la postura; soltar ↓/S o terminar el gesto
  corporal inicia la salida del agachado. Recalibrar también libera ese gesto.

## Modelo y ambientación

El alumno tiene cabeza descubierta y guardapolvo azul con cuello, solapas, botones,
bolsillos y faldón hasta la rodilla. La anatomía viene de la base CC0 de MakeHuman;
ropa, rig de 19 huesos y posturas están hechos para este juego. El GLB generado
pesa menos de 0,9 MB y no contiene geometría militar ni depende de animaciones
externas. La fuente y el generador están incluidos y se comprobó la reconstrucción
reproducible del archivo.

El profesor usa una variante genérica con guardapolvo gris. Su parecido específico
está pendiente de la foto solicitada por el usuario; no se afirma que ya reproduzca
esa persona. Carteles, grafitis y letreros mencionan la técnica, talleres,
laboratorios, electromecánica y diseño. La ciudad y las vías se conservan.

## Validación

La batería completa pasó **7 pruebas, 0 fallos, 0 omitidas**. Tras los ajustes
finales de confección se repitieron y pasaron las dos pruebas específicas de salto
y agachado. Incluyen:

- Arranque real, teclado, pausa/reanudación y selección de calidad sin CDN.
- Modelo, animación, encuadre horizontal/vertical, física y reinicio.
- Recuperación si no carga el personaje.
- Persecución del profesor y perro, rampas, techos de vagones y jetpack.
- Esqueletos independientes, materiales de profesor y monedas instanciadas.
- Cinco segundos agachado con órdenes repetidas: sin giros ni saltos de postura.
  La altura visible medida ronda 1,11 m y el cuerpo no atraviesa el suelo.
- Paso bajo una barra estando agachado, salida al soltar y pausa sin consumir
  monedas/potenciadores ni mover la cámara.
- Salto a 30, 60 y 120 Hz: diferencia de altura máxima inferior a 3 cm,
  aterrizaje limpio, caída rápida y reinicio sin salto/agachado heredado.

Para repetir:

```bash
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture
```

Las capturas se guardan en `test-results/student-run.png`, `student-crouch.png`,
`student-jump.png` y `student-front.png`. La vista frontal es únicamente una cámara
de inspección del modelo: el juego sigue en tercera persona desde atrás.

Se validó en Chromium con renderizado por software. No se probaron gestos con una
webcam física ni 60 FPS en una GPU real, y no se afirma que estén eliminados todos
los posibles errores. Los resultados de rendimiento de versiones anteriores en
`validation.md` no corresponden a esta revisión.

## Respaldo

El main previo está en `backup/main-before-tecnica-5929fc5`, commit
`5929fc50aff67e2b3c454fe052c50ce7c0f6c5bb`. La etiqueta `tecnica-animation-v1`
identifica esta actualización; ver `rollback.md` para revertirla sin reescribir
el historial.
