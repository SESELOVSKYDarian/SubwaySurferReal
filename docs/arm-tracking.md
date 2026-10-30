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
- **Un solo detector de una persona en modo VIDEO** (`numPoses: 1`): después del primer cuadro MediaPipe
  sigue al jugador recortando su zona, sin volver a buscar en toda la imagen. Medido en una Intel UHD 617
  (inferencia sola): 38 ms por cuadro con el modelo completo, contra 64 ms buscando hasta 3 personas y
  65 ms (p90 102 ms) con el recorte analizado en modo IMAGE que se usaba antes.
- **Niveles que se miden en la máquina real:** completo GPU → ligero GPU → ligero CPU. Si la mediana de
  30 cuadros pasa de 45 ms se prueba el siguiente nivel y **solo se queda si es al menos 15 % más
  rápido**; si no, vuelve al anterior. La prueba se repite cada minuto como mucho, porque la carga cambia
  (por ejemplo, cuando empieza la partida). El nivel nuevo se carga en segundo plano mientras el actual
  sigue analizando: cambiar de modelo no frena el seguimiento. (Antes se bajaba a ciegas: en esta Mac,
  con el juego corriendo, terminaba en CPU a 2,5 cuadros por segundo y 664 ms por cuadro.)
- Se piden 30 fps a la cámara (60 fps pedidos suelen bajar la exposición) y a cada cuadro se le reduce el
  tamaño a 384×288 antes de enviarlo al worker.
- Los puntos de los brazos pasan por un filtro One Euro y el muñeco los sigue más rápido.
- Calibración por tiempo (~0,7 s quieto y al menos 4 cuadros, para cámaras lentas) con guía: acercarse,
  alejarse o centrarse.
- La barra de estado muestra fps, ms de inferencia y retraso cámara→resultado.

## Detección de gestos (`gestures.js`)

- Todo se mide en proporciones del cuerpo: lo vertical en largos de torso (T) y lo lateral en anchos de
  hombro, así funciona igual con un chico lejos o un adulto cerca.
- Sin filtros con retraso en la decisión: se usan los puntos como llegan y la velocidad se calcula con
  regresión sobre los últimos 2–4 cuadros.
- **Salto:** por posición (cadera y hombros suben 0,12 T) o por movimiento (suben al menos 0,06 T,
  ~3 cm, a más de 2 T/s: un salto despega a 3–6 T/s y trotar no pasa de ~0,8). Encoger o levantar los
  brazos sube solo los hombros y no cuenta. Después de bajar (el amague de un salto o una agachada), para
  saltar tienen que despegar los pies si se ven, o subir 0,17 T por encima de la altura de pie: el amague
  ya no frena el salto y pararse de golpe no cuenta como salto. Un cuadro que sube más rápido de lo que
  puede un cuerpo (8 T/s) se confirma con el siguiente.
- **Agachado:** por posición (hombros bajan 0,25 T, dos cuadros; 0,33 T alcanza uno) o por movimiento
  (bajan 0,17 T a más de 1,5 T/s, sin que la cadera suba). Inclinarse hacia la cámara también cuenta.
  Al levantarse rápido se suelta enseguida, y si queda parado más abajo que al calibrar se corrige solo.
- **Carril:** entra a 0,5 anchos de hombro; con el cuerpo en marcha se proyecta un cuadro hacia adelante
  (lo que tarda el siguiente resultado), siempre que ya se haya movido al menos 0,3. Vuelve al centro por
  debajo de 0,32. Cambiar de carril y saltar enseguida ya no pide un salto más alto.

## Compensación de latencia

La cámara y el detector tardan en reconocer un gesto (100–300 ms según el equipo). Al jugar con cámara,
un choque con un tablero, un banco o el frente de un colectivo queda en suspenso ese tiempo (el retraso
medido en el equipo más un cuadro, entre 0,1 y 0,35 s): si llega el gesto que lo evitaba (saltar,
agacharse o salir del carril) se perdona. Con teclado los choques son inmediatos como siempre.

## Medición de punta a punta

`gestos.y4m` es un video de cámara virtual con el número de cuadro codificado y gestos con tiempos
conocidos (salto con amague, salto sin amague, pasos laterales, agachado, agacharse y pararse rápido, paso
y salto). Se mide cuánto tarda el juego en reconocer cada gesto desde que empieza el movimiento.
Para repetirlo en otro equipo (por ejemplo, el de la Expo): `tools/latencia/` (instrucciones al
principio de `medir.cjs`).

| Medido en una Mac Intel i5 de 2 núcleos (UHD 617), muy cargada | Salto | Agachado | Carril |
|---|---|---|---|
| Antes (con el juego): 3 de 4 saltos y 2 pasos sin detectar | 433 ms | 600 ms | 834 ms |
| Ahora, con el juego corriendo | 400 ms | 517 ms | 467 ms |
| Ahora, solo cámara (inferencia sin competir con el juego) | 133 ms | 150 ms | 233 ms |

Con el juego corriendo, en esa máquina de dos núcleos el límite lo pone la CPU compartida (los tres
niveles rinden parecido): ahí actúa la compensación de latencia. En equipos más holgados los tiempos se
acercan a la fila "solo cámara".

## Jugador fijo entre mucha gente

- **Seguimiento de una persona:** MediaPipe sigue al jugador por su zona y no salta a quien pasa por
  detrás mientras el jugador siga a la vista. Si se pierde, vuelve a buscar en toda la imagen.
- **Identidad:** al calibrar se guarda la proporción hombros/torso; una persona que no coincide en
  posición, tamaño y proporción no se toma como jugador.
- **Perderse y volver:** si el jugador sale de cuadro un momento y vuelve con el mismo tamaño y lugar, se
  conserva la calibración (no pide quedarse quieto otra vez). Si hay duda, se recalibra.
- Con el jugador pegado a un borde lateral (centro de hombros a menos de 14 % del borde) o agachado
  alcanza con ver los hombros; de pie en el centro, caderas ocultas siguen contando como detección parcial.
