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
