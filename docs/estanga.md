# Estanga: perseguidor reconstruido desde la hoja de referencia

El perseguidor ahora es Estanga, modelado a partir de la hoja de personaje
aportada (`assets/characters/source/estanga/reference-sheet.png`): giro de
cuerpo entero (frente, perfiles y espalda), primeros planos de la cabeza y
detalles de anteojos, pelo, tejido, reloj, jean y botas. Reemplaza al profesor
con gorra de policía: la referencia no lleva gorra.

Archivos del juego: `assets/characters/estanga.glb` y `estanga-low.glb`, con
texturas `assets/characters/textures/estanga-*.{jpg,png}` compartidas por los
dos niveles de detalle. El rig conserva los 19 huesos `mixamorig*` del juego.

## Qué se reconstruyó y cómo

- **Siluetas medidas**: `tools/estanga_reference.py` recorta las vistas y extrae
  máscaras. La altura total (pelo a suela) se fija en 1,80 m; de ahí salen
  entrepierna (41 %), dobladillo del suéter (51 %), puños subidos a mitad del
  antebrazo, abdomen (hasta 0,25 m por delante) y separación de piernas.
- **Anatomía**: base MakeHuman CC0 con targets de edad y peso, remapeo vertical
  de proporciones (torso más largo, piernas más cortas), brazos colgando abiertos
  por el abdomen con el antebrazo adelantado, palmas hacia los muslos y dedos
  relajados. Es la pose de unión del rig.
- **Rostro**: `tools/estanga_face_fit.py` detecta los 478 puntos de MediaPipe en
  el primer plano frontal y en un render de la cabeza, escala la cabeza
  (×1,14) y la deforma con splines biarmónicas hasta un error medio de 2 px;
  luego corrige frente, nariz, labios y mentón con el perfil izquierdo. El
  resultado queda en `source/estanga/face-fit.json`, así que reconstruir no
  necesita MediaPipe.
- **Cráneo y pelo**: el cráneo se ajusta dentro del casco visual de las siete
  vistas dejando el espesor de pelo observado; el pelo es una cáscara con ese
  volumen y dos capas de mechones con recorte alfa.
- **Ropa**: suéter y jean se inflan desde la superficie del cuerpo hasta
  secciones superelípticas medidas en las siluetas de frente, perfiles y
  espalda; cuello redondo acanalado, dobladillo y puños con costillas, mangas
  con pliegues y ruedo apilado sobre las botas.
- **Accesorios**: anteojos rectangulares de acetato medidos en la foto, barba y
  bigote con volumen, smartwatch negro en la muñeca izquierda y botas de
  trekking (caña, suela de goma con puntera, cordones cruzados).
- **Texturas**: `tools/estanga_model.py` proyecta las vistas sobre las UV con
  visibilidad por z-buffer, prioriza los primeros planos, borra los anteojos de
  las fotos y descarta muestras de piel sobre la ropa. Donde la hoja no muestra
  nada se usa piel MakeHuman con el tono corregido o el color medio de la prenda.
- **Rig y niveles**: `tools/build_estanga.py` (Blender 4.3) crea el esqueleto,
  limita a 4 influencias por vértice, subdivide suéter y jean en el nivel alto,
  decima el bajo y exporta con materiales PBR y texturas externas.

## Animación

`character.js` usa un perfil propio para Estanga, sin cambiar al alumno:

- **Reposo**: manos en los bolsillos delanteros, como en la foto principal,
  con respiración leve.
- **Carrera**: trote de adulto corpulento: paso más corto, más apoyo, menos
  vuelo, tronco inclinado y cadera que cae. Braceo contralateral medido en el
  navegador: el húmero va de −36° (atrás) a +27° (adelante) y el antebrazo de
  24° a 98°. La cadencia sigue la velocidad del juego.
- **Mirada**: cabeza y cuello giran hacia el carril del alumno y compensan el
  balanceo del tronco.
- **Agarre**: al atrapar, ambos brazos van al frente a la altura del pecho y el
  tronco se inclina.

## Reconstrucción

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/estanga_reference.py
python3 tools/estanga_model.py
blender -b --python-exit-code 1 --python tools/build_estanga.py
npm test
npm run capture:estanga
```

`tools/estanga_face_fit.py` solo hace falta para volver a ajustar el rostro
(requiere `mediapipe==0.10.14`).

## Validación y límites

- **Siluetas** (modelo completo contra las máscaras de la hoja, IoU): frente
  0,873 · espalda 0,872 · perfil izquierdo 0,852 · perfil derecho 0,905. Cabeza
  en los primeros planos: frente 0,896 · izquierdo 0,914 · derecho 0,812 (la
  hoja corta la nariz del perfil derecho en el borde del recuadro). Las vistas
  enteras miden unos 500 px de alto: un píxel de borde ya pesa en el IoU.
- **Rostro**: 478 puntos de MediaPipe, error medio final 2,0 px en el primer
  plano (≈2,4 mm); la altura de los ojos coincide entre primer plano (1,675 m) y
  vista entera (1,683 m).
- **Geometría**: 80.060 triángulos en el nivel alto y 28.753 en el bajo; 19
  huesos con rotación de reposo identidad y como máximo 4 influencias por
  vértice. GLB de 2,7 MB y 1,0 MB más texturas compartidas.
- **Pruebas**: `npm test` cubre carga, accesorios y ausencia de gorra,
  presupuestos de ambos niveles, reloj en la muñeca izquierda que sigue al
  antebrazo, anteojos que siguen la cabeza, materiales y alfa, cuello estable al
  mover los brazos, esqueletos iguales entre niveles, respaldo si falla el GLB
  y la carrera con apoyo y vuelo de ambos personajes.
- **Capturas**: `npm run capture:estanga` genera frente, perfil, espalda, tres
  cuartos, rostro, carrera cuadro a cuadro, agarre y detalle bajo.

Límites: es una reconstrucción desde una sola hoja generada como imagen, no un
escaneo. Las zonas que ninguna vista muestra (axilas, bajo los brazos, plantas)
usan colores de relleno; la luz de estudio queda en parte dentro de las
texturas proyectadas; los dedos no se articulan (el rig del juego no tiene
huesos de dedos) y quedan relajados en la pose de unión. La foto principal
muestra las mangas hasta la muñeca, pero el giro de cuatro vistas las muestra
subidas a mitad del antebrazo: se siguió el giro, que es la vista técnica.
