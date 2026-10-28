# Menú y selección de personajes

El Guardapolvo conserva el runner de main d804ced e incorpora portada ilustrada,
menú de ajustes (cámara, sensibilidad, calidad y volumen), récords existentes,
logros locales por mejor puntuación y cuatro personajes seleccionables. La
selección se guarda en localStorage y recarga el menú con el modelo elegido.
El modo historia se identifica como próximo; no simula contenido inexistente.

Efectos sintetizados con Web Audio para botones, comienzo, moneda, salto,
agachado y tropiezo. El contexto de audio se abre por gesto del usuario y el
silencio y volumen persisten. La música instrumental de 8 bits elegida por el
usuario se carga localmente al jugar; sigue la pausa y se silencia durante videos
y al ocultar la pestaña. Comparte el volumen y el botón de sonido del menú.
La pista y sus créditos están en [assets/audio](../assets/audio/README.md).

Los personajes son el joven teen-boy, el técnico con guardapolvo, la chica de
buzo gris y la chica con teléfono. Las nuevas mallas estaban sin rig. Blender
une sus segmentos, suelda límites, reduce a unos 55k triángulos, transfiere pesos
al rig de 19 huesos y exporta un LOD de unos 20k. Los mapas de 1024 px se comparten
entre niveles de detalle. La adaptación conserva la pose de manos del teléfono;
no agrega dedos articulados ni un escaneo facial nuevo.

El adjunto hesitant_walk_to_class.glb no pudo descargarse: excede el límite de
32 MiB de transferencia del entorno. No se anuncia como opción disponible.

Reconstrucción de cada malla derivada, con el original descargado:

```sh
blender -b --python-exit-code 1 --python tools/adapt_uploaded_character.py -- /ruta/original.glb hoodie-student
python3 tools/share_professor_textures.py hoodie-student.glb hoodie-student-low.glb
```

Las capturas y pruebas usan el servidor local de Playwright. Se revisan menú
1600×900, móvil 390×844, modales, sonido, selección persistente y modelos animados.
Los originales subidos no se copian al repositorio; solo las mallas adaptadas.

El trabajo local anterior del rostro del profesor queda separado de esta revisión.

## Fondo y cámara local

El fondo actual es exactamente el JPG 1000239166.jpg aportado por el usuario.
MediaPipe 0.10.14, WASM SIMD/no-SIMD y modelos full/lite se sirven desde
vendor/mediapipe. Tanto el worker como el respaldo del hilo principal usan
URLs locales: activar cámara no depende de jsDelivr ni de Google Storage.
Se mantiene el stream al reintentar; los permisos siguen a cargo del navegador.
Pruebas: arranque con cámara virtual, descargas HTTPS externas bloqueadas y
worker forzado a fallar para comprobar el respaldo. No equivale a una prueba
de seguimiento de una persona en una cámara física.
