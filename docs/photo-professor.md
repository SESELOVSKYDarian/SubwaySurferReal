# Profesor con gorra de policía, basado en las referencias

El perseguidor conserva su papel de profesor y su comportamiento de juego, con
una apariencia propia basada en las cuatro fotos aportadas. La interpretación
mantiene suéter verde oliva, pantalón oscuro y zapatos marrones. Se añadieron
cara y mandíbula más anchas, pelo y barba canosos, bigote, anteojos rectangulares
de marco negro, reloj de pulsera y gorra azul de policía con visera y distintivo
genérico. No se cambió la ropa por un uniforme completo: se siguió la indicación
de incorporar la gorra a la cara y al cuerpo de las referencias.

## Modelo independiente

El profesor ya no usa una copia recoloreada del alumno. Sus proporciones de
cabeza y cuerpo se construyen en `tools/build_student.py --professor` a partir
de la anatomía CC0 incluida. Suéter, terminaciones, anteojos, barba, reloj y gorra
son geometría propia. Los accesorios de cabeza están vinculados al hueso Head;
el reloj al antebrazo. La barba tiene una textura procedural de pelo corto con
borde suavizado. Las fotos se usan como referencia visual y no se publican como
texturas ni fondos. El resultado es una aproximación 3D, no un escaneo exacto.

Archivos locales:

- `assets/characters/professor-police.glb`: 54.835 triángulos, 2.268.284 bytes.
- `assets/characters/professor-police-low.glb`: 24.571 triángulos, 1.043.180 bytes.

Los dos niveles conservan el mismo rig de 19 huesos. La persecución, el alcance
al atrapar, las pausas y la selección automática de detalle usan el controlador
existente. Las mallas y materiales se reutilizan entre partidas. Una versión
simple de respaldo también lleva gorra, suéter verde y barba gris si falla la
carga del modelo. No se añaden servicios ni descargas de modelos externos.

Los archivos del alumno se reconstruyeron y compararon byte por byte: permanecen
idénticos a los anteriores. El cargador mantiene cachés separados por perfil y
nivel de detalle; animar al profesor no modifica al alumno.

## Reconstrucción y revisión

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/build_student.py --professor
python3 tools/build_student.py --professor --low
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run capture:professor
```

Las capturas en `test-results/` muestran cuerpo completo, cara de frente, perfil
y carrera con detalle bajo. Se revisaron el ajuste de la gorra, los marcos y
puente de los anteojos, la barba y las uniones del suéter. Las comprobaciones
verifican accesorios, presupuestos de geometría, aislamiento del alumno,
animación en ambos niveles, seguimiento de la gorra por la cabeza y respaldo
ante error de carga, además de las regresiones existentes del juego.

Validación final: 19 pruebas aprobadas con Chromium/SwiftShader. Las versiones
alta y baja se revisaron visualmente; la carga, la persecución y el respaldo no
requieren cámara física. No se midió la fluidez en una GPU o teléfono real.
