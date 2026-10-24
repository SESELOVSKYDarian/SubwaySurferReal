# Realismo del profesor · trabajo en curso

Estado: preparado en `work-professor-realism-uv`, pendiente de los archivos
originales de las fotos para terminar la textura facial del profesor. Esta
revisión usa una piel CC0 de referencia de un adulto; no contiene los píxeles de
la cara del profesor ni debe presentarse como una reconstrucción exacta suya.
No se ha sustituido por esta revisión la versión pública de `main`.

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
Se mantienen dos geometrías: 81.587 triángulos en alta y 33.065 en reducida,
un 59,5 % menos. Los materiales se mantienen al cambiar de geometría. El
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
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture:professor
```

Las fuentes están incluidas; la reconstrucción no requiere descargar el paquete
completo. El generador del alumno se comprobó byte por byte: no cambia sus GLB.

## Comprobación y límite pendiente

20 pruebas aprobadas con Chromium/SwiftShader: materiales y espacios de color,
UV, máscaras alfa, niveles de detalle, animación, respaldo si falla la carga,
y las regresiones existentes de física y cámara. Las capturas de frente, perfil,
cuerpo completo y carrera se revisaron para corregir deformaciones y superficies.
No se verificaron FPS en hardware físico.

El parecido exacto con el profesor no está resuelto. Para trabajar su albedo
facial se necesitan las fotos originales como archivos descargables (por ejemplo,
en un ZIP). Las vistas anteriores del chat permiten observar la referencia,
pero no están disponibles como ficheros en el entorno de modelado. Después hay
que ajustar la proyección UV y la escultura a esos archivos y volver a revisar
el resultado dentro del juego antes de publicarlo como el profesor terminado.
