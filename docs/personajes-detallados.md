# Personajes detallados: esqueleto de 52 huesos y animaciones nuevas

Los cuatro personajes jugables y Estanga comparten ahora un esqueleto
detallado de 52 huesos con nombres Mixamo (`mixamorig*`). Respecto del rig
anterior de 19 huesos, se suman las clavículas (`LeftShoulder`,
`RightShoulder`), una vértebra intermedia (`Spine1`) y cinco dedos de tres
falanges por mano. Se conservan los 19 nombres anteriores, así que la física,
el seguimiento de brazos por cámara y el resto del juego no cambian.

Convención: el personaje mira a +Y en Blender (−Z en glTF) y los huesos
`Left*` están en +X. Todos los huesos tienen rotación de reposo identidad: el
IK de piernas y las posturas trabajan en ejes del modelo.

## Cómo se riggeó cada personaje

| Personaje | Malla | Esqueleto y pesos |
| --- | --- | --- |
| El pibe (`technical-student`) | teen-boy original (CC BY 4.0) | Rig Mixamo original de 65 huesos y sus pesos: se fusionan las puntas en sus padres, se baja de pose T a pose A con su propio skinning y se intercambian Left/Right para la convención del juego (sin espejar la malla). `tools/rig_detailed.py -- teen` |
| El técnico (`classic-student`) | Reconstruido: anatomía MakeHuman CC0 y guardapolvo nuevo | Pesos anatómicos MakeHuman mapeados a 52 huesos. `tools/build_classic.py` + `tools/build_estanga.py -- test-results/classic classic-student` |
| La del buzo / La conectada | Escaneos aportados | Antes tenían articulaciones copiadas de otro personaje (el codo quedaba fuera del brazo). Ahora se ajusta el cuerpo MakeHuman a cada escaneo por pose y escala (estilo SMPL) y se transfieren sus pesos con normales compatibles. `tools/rig_scan.py` + `tools/fit_scan_rig.py` |
| Estanga | Reconstruido desde la hoja | Pesos anatómicos MakeHuman mapeados a 52 huesos (`docs/estanga.md`) |

### Ajuste de plantilla de los escaneos

`fit_scan_rig.py` posa y escala el cuerpo MakeHuman (cadera, columna, cabeza,
hombros, codos, muñecas, caderas, rodillas y largos de segmentos) hasta
coincidir con la superficie del escaneo. Usa pérdida robusta (pelo largo y
ropa suelta son valores atípicos), restricción de lado (una pierna del molde
no puede emparejarse con la otra pierna del escaneo), ajuste por etapas
(tronco y piernas, luego brazos con arranque múltiple, luego todo) y manos
relajadas en el molde. Los pesos se transfieren solo desde vecinos con normal
compatible (la cara interna de una manga pegada al torso toma el brazo), las
islas de peso de brazo sin conexión con el hombro se descartan, y se eliminan
las caras de contacto del escaneo (mano sobre el muslo) que de otro modo se
estirarían como una lámina al bracear.

## Animaciones

- **Carrera**: braceo contralateral por direcciones (húmero de −0,67 a +0,77 rad,
  codo a unos 90°), puños sueltos, hombros que se adelantan con el brazo,
  inclinación repartida en tres vértebras con contrarrotación del pecho.
- **Pies**: rodado de talón a punta y flexión del dedo al despegar; punta
  extendida en el aire.
- **Salto**: brazos arriba y adelante (asimétricos), manos abiertas, piernas
  recogidas (física sin cambios).
- **Rodada**: brazos al frente, mano semicerrada, cabeza abajo.
- **Jetpack**: brazos abiertos atrás, dedos extendidos.
- **Reposo**: brazos relajados, dedos curvados, respiración.
- **Cambio de carril**: el tronco se inclina hacia la curva y la cabeza compensa.
- **La conectada** sostiene el teléfono con ambas manos: sus brazos quedan en
  la pose del escaneo y el resto del cuerpo corre.
- **Estanga**: manos en los bolsillos en reposo, puños al trotar y manos
  abiertas al atrapar.

Las mezclas entre estados son suavizadas; el seguimiento de brazos por cámara
sigue teniendo prioridad sobre el braceo.

## Escala e IK

El pibe y El técnico conservan su altura real en el GLB (1,70 y 1,76 m) y el
juego los escala a 2,05 m como a los demás. El IK de piernas ahora convierte la
altura del modelo a sus unidades locales antes de resolver; antes asumía escala
1 y, con escala ≠ 1, al agacharse los pies atravesaban el piso.

La miniatura de El técnico en el menú se volvió a renderizar desde el GLB nuevo
(`tools/render_menu_thumb.py -- classic-student classic.png`).

## Límites

- Los escaneos traen manga y costado, y mano y muslo, fusionados en una sola
  superficie. Se eliminan esas caras de contacto (3.320 en La del buzo, 705 en
  La conectada, que no bracea): al bracear pueden verse pequeños huecos bajo el
  brazo o junto a la cadera en lugar de una lámina estirada.
- Los dedos de los escaneos se mueven con su peso transferido; donde la mano
  quedó pegada al muslo, el pulgar puede deformarse un poco al cerrar el puño.
- La miniatura de El pibe sigue mostrando la pose T original del recurso.

## Revisión

`node tests/capture-characters.cjs [personaje]` genera reposo, mano, carrera
cuadro a cuadro, salto, rodada y jetpack en `test-results/characters/`.
`npm test` verifica 52 huesos con reposo identidad en los diez GLB, dedos que
se cierran al correr y se abren al saltar, y hombros que acompañan el braceo.
