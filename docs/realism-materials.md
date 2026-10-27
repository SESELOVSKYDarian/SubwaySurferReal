# Profesor: modelado en Blender y materiales UV

> Reemplazado: el perseguidor actual es Estanga, reconstruido desde la hoja de
> referencia sin gorra ([docs/estanga.md](estanga.md)). Este modelo queda como
> fuente histórica y el juego ya no lo carga.

Modelo editado y exportado con Blender 4.3.2, integrado como malla esquelética
en el juego. El archivo editable está en `assets/characters/blender/professor.blend`,
con texturas empaquetadas, rig y luces de estudio.

El rostro sigue siendo una aproximación visual: usa piel anatómica CC0, no píxeles
de las fotos del profesor. No es un escaneo ni una reproducción fotorrealista exacta.

## Cambios concretos

- Anatomía de adulto con mezcla de deformaciones de edad y volumen de MakeHuman.
- UV de piel originales preservadas durante subdivisión y separación de costuras.
- Albedo de piel de 2048², normal de microrelieve y rugosidad de 1024².
  El normal y la rugosidad son aproximaciones calculadas del albedo, no mapas
  capturados mediante escaneo.
- Ojos con malla y textura de iris/esclerótica del sistema MakeHuman. Se conserva
  el alfa de la córnea; convertir esta imagen a JPEG ocultaba el iris.
- Pelo gris con tarjetas de mechones, máscara alfa y mapa normal, ajustado bajo
  la gorra.
- Suéter continuo construido a partir de la superficie anatómica, con holgura,
  pequeñas arrugas y bordes recortados en cuello, cintura y mangas.
- Pesos anatómicos originales transferidos al rig de 19 huesos, interpolados al
  recortar y subdividir. Se eliminó la asignación por proximidad que hacía que
  un brazo deformara el abdomen.
- Lana mate con microrelieve de bucles de punto, sin el mapa de rugosidad que
  volvía plástica la tela.
- Zapatos de cuero con malla, cordones, suela, albedo y normal de MakeHuman.

El personaje sigue siendo una malla 3D animada en el juego. No es una imagen
plana ni un render colocado frente a la cámara. Los recursos se sirven localmente.
Se mantienen dos geometrías: 82.123 triángulos en alta y 33.547 en reducida,
un 59,1 % menos. Los materiales se mantienen al cambiar de geometría. El
presupuesto subió respecto a la versión anterior para conservar hombros, dedos,
ropa y accesorios; no se atribuye realismo al número de triángulos por sí solo.

## Procedencia

Los recursos anatómicos, pesos, pelo `short02`, ojos marrones y zapatos `shoes01`
pertenecen al paquete de recursos de sistema MakeHuman, bajo CC0. La fuente,
los titulares y hashes están en `assets/characters/source/realism/SOURCES.json`.
Los archivos de material y malla incluyen sus avisos de licencia. No se usan
modelos descargados sin licencia ni fotografías de otra persona presentadas
como fotos del profesor. La textura de piel es una referencia genérica declarada.

## Reconstrucción

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/prepare_professor_textures.py
python3 tools/build_student.py --professor
python3 tools/build_student.py --professor --low
blender -b --python-exit-code 1 --python tools/sculpt_professor_blender.py
python3 tools/share_professor_textures.py
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture:professor
```

Las fuentes están incluidas; la reconstrucción no requiere descargar el paquete
completo. El generador del alumno se comprobó byte por byte: no cambia sus GLB.

## Edición de Blender

- Ajuste de mejillas y mandíbula preservando UV y pesos.
- Soldadura de costuras geométricas y normales suaves, manteniendo UV por esquina.
- Suéter relajado, cuello redondo modelado y pesos del cuello independientes de los brazos.
- Pantalón extendido, anteojos y reloj proporcionados; eliminación de piel que atravesaba hombros.
- Barba con textura RGBA compartida por Blender y el juego.
- Exportación de ambos LOD con el mismo orden de 19 huesos.
- GLB de 2.784.736 y 1.189.444 bytes. Nueve texturas externas compartidas: cambiar
  el detalle no implica descargar de nuevo los mismos mapas.

El script de Blender debe ejecutarse sobre las dos bases recién generadas, como
indica la secuencia anterior; aplicar la escultura repetidamente al resultado
acumularía las deformaciones. El `.blend` conserva los materiales de estudio;
el juego reproduce el microrelieve de lana con su material de punto.

## Comprobación y límite pendiente

21 pruebas aprobadas con Chromium/SwiftShader: materiales y espacios de color,
UV, máscaras alfa, niveles de detalle, animación, respaldo si falla la carga,
y las regresiones existentes de física y cámara. Las capturas de frente, perfil,
cuerpo completo y carrera se revisaron para corregir deformaciones y superficies.
No se verificaron FPS en hardware físico.

El parecido exacto con el profesor no está resuelto. Para trabajar su albedo
facial se necesitan las fotos originales como archivos descargables (por ejemplo,
en un ZIP). Las vistas anteriores del chat permiten observar la referencia,
pero no están disponibles como ficheros en el entorno de modelado. Después hay
que ajustar la proyección UV y la escultura a esos archivos y volver a revisar
el resultado dentro del juego para seguir mejorando el parecido; la versión actual se identifica como aproximación.
