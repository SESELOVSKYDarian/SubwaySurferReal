# Brazos y manos desde la cámara

Se aprovechan los puntos de MediaPipe Pose existentes: hombros, codos, muñecas,
índices y meñiques. No se descarga otro modelo ni se abre otra cámara.
Las direcciones se reflejan igual que la previsualización y se corrigen según
la relación de aspecto del vídeo. Cada brazo se controla de forma independiente.
Las rotaciones se convierten al espacio local de cada hueso para que la flexión
del codo siga funcionando al levantar el hombro. Se suavizan según el tiempo
transcurrido, sin acumular giros.

Solo se usan segmentos con extremos visibles y longitud suficiente. Al perderlos,
se vuelve suavemente a la animación de carrera; datos de más de 350 ms dejan de
usarse. La pausa congela el personaje. El agachado tiene prioridad sobre los
brazos para conservar su silueta y sus colisiones. El profesor mantiene su
animación propia.

El seguimiento es una aproximación en el plano de la cámara. La mano acompaña
la muñeca y su dirección visible; este rig no tiene huesos individuales para
reproducir dedos, puños o gestos finos. No se envía vídeo fuera del navegador.

Pruebas: direcciones reflejadas, confianza por articulación, posturas distintas
en ambos brazos, flexión de codo, suavizado, pausa, pérdida de datos y agachado.
La validación usa puntos simulados; hace falta probar la captura física en el
dispositivo del jugador.

## Rendimiento de la cámara

- El detector corre en `pose-worker.js`. `vision_bundle.cjs` se descarga como texto y se carga desde un
  Blob: Chrome rechaza `importScripts` de archivos servidos como `text/plain` (pasaba con servidores
  simples) y entonces el seguimiento caía al hilo principal y trababa el juego.
- Una sola persona (`numPoses: 1`): MediaPipe reutiliza el seguimiento en vez de detectar en cada cuadro.
- Escalera automática de modelos: completo GPU → ligero GPU → ligero CPU. Si la inferencia media supera
  34 ms (después de 45 cuadros) el controlador baja un peldaño. El modelo se calienta dentro del worker
  antes de avisar `ready`, así el primer cuadro real no tarda segundos.
- Se piden 30 fps a la cámara (60 fps pedidos suelen bajar la exposición) y a cada cuadro se le reduce el
  tamaño a 384×288 antes de enviarlo al worker.
- Los puntos de los brazos pasan por un filtro One Euro y el muñeco los sigue más rápido.
- Calibración por tiempo (~0,7 s quieto, mediana en vez de media) con guía: acercarse, alejarse o centrarse.
- La barra de estado muestra fps, ms de inferencia y retraso cámara→resultado.

## Jugador fijo entre mucha gente

- **Búsqueda y seguimiento:** el worker tiene dos detectores. Mientras no hay jugador fijado se busca en el
  cuadro completo (hasta 3 personas, se elige la más grande cerca del centro). Una vez fijado, cada cuadro
  se recorta alrededor de la caja del jugador (estrecha a los costados, con margen para saltos) y solo ese
  recorte pasa al detector: lo que se mueve detrás queda fuera y el modelo ve al jugador más grande.
- **Identidad:** al calibrar se guarda la proporción hombros/torso. Si en el recorte asoma otra persona, gana
  la que coincide en posición, tamaño y proporción.
- **Perderse y volver:** si el jugador sale de cuadro un momento y vuelve con el mismo tamaño y lugar, se
  conserva la calibración (no pide quedarse quieto otra vez). Si hay duda, se recalibra.
- **Latencia:** filtro horizontal más ágil y umbrales de carril y salto algo menores.
- Prueba sintética (canvas como cámara, dos personas cruzando detrás): calibra en ~2 s, 30 fps, ~20 ms por
  cuadro, carril y salto detectados y ningún "te perdí".

## Moverse por toda la pantalla

- El recorte sigue al jugador con predicción: se adelanta según su velocidad (el resultado llega ~2
  cuadros tarde) y se ensancha cuanto más rápido se mueve, así no se queda atrás en un cruce de lado a lado.
- Con el jugador pegado a un borde lateral (centro de hombros a menos de 14 % del borde) alcanza con ver los
  hombros; en el centro, caderas ocultas siguen contando como detección parcial.
- Al desplazarse de lado a más de 3,5 anchos de hombro por segundo el salto pide 1,7 veces más altura y no
  se usa la detección temprana: cruzar rápido no dispara saltos falsos.
- Prueba sintética de estrés (3 vueltas: cruce completo ida y vuelta, salto y agachada, con dos personas
  pasando por detrás): 96 % de los cuadros con jugador, 30 fps, ~23 ms, sin "te perdí". Quedó algún
  salto falso aislado cuando el cuerpo toca el borde izquierdo a toda velocidad.
