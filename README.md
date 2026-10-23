# Subway Surfer REAL 🏃‍♂️📷

Un "Subway Surfers" que se juega **con el cuerpo**: la cámara detecta tu esqueleto
en tiempo real y el corredor hace lo mismo que tú.

| Tú haces…                          | En el juego…               |
|------------------------------------|----------------------------|
| Paso a la izquierda / derecha      | Cambia de carril           |
| Saltas                             | Salta las vallas bajas     |
| Te agachas                         | Pasa por debajo de barras  |
| Levantas las dos manos             | Empieza / reinicia         |

Los vagones no se pueden saltar: hay que cambiar de carril… o subirse por una
**rampa** y correr por encima. De vez en cuando aparece un **🚀 jetpack**: cógelo
y vuelas unos segundos recogiendo monedas en el aire.

**¡Cuidado con el guardia y su perro!** Si tropiezas (te chocas de lado con un vagón
o con una valla baja) se te pegan detrás; si vuelves a tropezar antes de que se
cansen, te atrapan. Chocar de frente con un vagón o con una barra alta es fin de partida.

## Cómo jugar

La cámara del navegador solo funciona en `https://` o en `localhost`, así que no
basta con abrir `index.html` con doble clic. Sirve la carpeta:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

(o publícalo en GitHub Pages, que ya va por https).

1. Pulsa **📷 Activar cámara** y da permiso.
2. Ponte a unos 2 m, que se te vean al menos hombros y cadera, en el centro.
3. Quédate quieto ~1 s hasta que diga **¡Listo!** (eso calibra tu posición "neutra").
4. Levanta las dos manos para empezar.

Si te mueves de sitio o algo no responde bien, pulsa **C** para recalibrar.

**Si la cámara te pierde** (sales del cuadro o alguien se cruza delante), el juego se
pausa solo. Vuelve al centro, quédate quieto un segundo para recalibrar y el juego
sigue tras una cuenta atrás. Las personas que pasen por detrás se ven en gris junto
a la cámara pero no cuentan: el juego sigue siempre al jugador. **P** pausa a mano.
También se puede jugar con teclado: ← → / A D, ↑ / Espacio, ↓ / S.

## Cómo funciona

- **`pose-worker.js`** – ejecuta la red neuronal en un hilo aparte (Web Worker) para
  que el juego no se congele mientras analiza la cámara.
- **`pose.js`** – detecta hasta 3 personas y sigue siempre al jugador (la que continúa
  donde estaba; al empezar, la más cercana a la cámara). Filtra los puntos con un
  filtro *One Euro* (quita el temblor sin añadir retraso). Usa [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
  (33 puntos del cuerpo; modelo *full*, el más preciso, si hay GPU) y convierte el movimiento en gestos:
  - *Carril*: posición horizontal del centro de los hombros respecto a la calibración,
    medida en anchos de hombro (así da igual lo lejos que estés).
  - *Salto*: sube todo el cuerpo (cadera y hombros) y, si se ven, los dos pies. También se
    detecta por la velocidad del movimiento para reaccionar antes.
  - *Agacharse / hacerse bolita*: baja la cabeza o los hombros, o se encoge el torso (vale
    aunque al encogerte la cámara deje de ver bien los hombros). Mientras sigas agachado,
    el corredor sigue rodando. El pequeño amago que se hace antes de saltar no cuenta.
  - La barra junto a la cámara muestra en directo cuánto falta para que cuente un salto
    (arriba) o una agachada (abajo), y en el menú hay un control de **sensibilidad**.
  - Los umbrales están arriba del archivo (`LANE_ENTER`, `JUMP_UP`, `DUCK_DOWN`…) por si
    quieres hacerlo más o menos sensible.
- **`game.js`** – el juego con [Three.js](https://threejs.org): corredor animado,
  obstáculos (vallas, barras, vagones de metro), monedas, colisiones, luces y cámara.
- **`world.js`** – el escenario: vías con grava y traviesas, muros con grafitis y hiedra,
  vallas metálicas, farolas, árboles, edificios de ladrillo con escaleras de incendios,
  catenarias y rascacielos al fondo. Las piezas se reciclan para que el recorrido sea infinito.
- **`textures.js`** – todas las texturas (grafitis, ladrillo, ventanas, grava, tren,
  monedas, cielo…) se dibujan por código en un `<canvas>`, sin descargar imágenes.
- **`main.js`** – conecta los gestos y el teclado con el juego.

Si el ordenador no llega a ~45 FPS, el juego baja la resolución automáticamente (y en
último caso las sombras) para mantenerse fluido.

Todo corre en tu navegador; la imagen de la cámara no se envía a ningún sitio.

## Apariencia y rendimiento

La cámara permanece en tercera persona, detrás del corredor. Mantiene a la vista
el cuerpo completo y los tres carriles, y se aleja en pantallas verticales para
conservar el encuadre.

El corredor detallado es un modelo humano con texturas y animaciones esqueléticas
locales (`assets/characters/runner.glb`). Cambia entre reposo y carrera con una
transición; salto y rodada combinan la física del juego y poses aditivas. Si el
modelo no se puede cargar, el personaje procedural permite seguir jugando.
La procedencia y condiciones de uso están en
[`assets/characters/ATTRIBUTION.md`](assets/characters/ATTRIBUTION.md).

El escenario incorpora cielo atmosférico, reflejos de exterior, microrelieve,
volumen en alféizares y cornisas y sombra de contacto. El skyline y los bajos de
los trenes agrupan geometrías. El detalle lejano se oculta antes que el cercano.
Las texturas del entorno siguen siendo procedurales: esto es una mejora hacia
un estilo realista, no un escenario fotogramétrico ni un acabado equivalente a GTA.

El selector **Calidad** ofrece Automática, Alta y Equilibrada. Automática reduce
la resolución interna si los tiempos de cuadro empeoran; conserva las reglas y
los controles. Alta extiende la distancia de dibujo y aumenta el límite de
resolución. No se garantizan 60 FPS: dependen de GPU, resolución y uso de cámara.

Three.js 0.160.0 y los módulos usados se sirven desde `vendor/three`, con su licencia
MIT. El juego con teclado y el personaje no necesitan red externa durante la
partida. El control corporal todavía requiere MediaPipe y su modelo remoto.

## Verificar los cambios

Para jugar sigue bastando `python3 -m http.server 8000`; Node solo es necesario
para las pruebas de desarrollo (Node 20 o superior):

```bash
npm ci
npx playwright install chromium
npm test
npm run benchmark
```

Si ya tienes Chromium, puedes indicar `CHROMIUM_PATH=/ruta/a/chromium`.
Las pruebas arrancan y cierran su propio servidor local. La captura se guarda en
`test-results/realism.png`. El benchmark espera una lectura de píxel por cuadro
para no confundir comandos enviados a WebGL con trabajo gráfico terminado.
Los resultados corresponden al dispositivo y al escenario medidos; no garantizan
el rendimiento con cámara activa o durante una partida completa.

En el contenedor de desarrollo sin sandbox de navegador disponible, se ejecutó:

```bash
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run benchmark
```

Ver [`docs/validation.md`](docs/validation.md) para resultados y límites.

## Respaldo de main

La integración visual conserva las funciones de `main` y tiene un respaldo en
`backup/main-before-realism-c10fb4a`. Para deshacerla sin reescribir el historial,
ver [`docs/rollback.md`](docs/rollback.md).

## Policía, monedas y objetos

El policía usa un esqueleto y un mezclador de animaciones propios, con uniforme
azul táctico, identificación, placa, radio y cinturón. Comparte el archivo base
Vanguard con el corredor, pero no sus huesos ni materiales. Si no carga, se
conserva el guardia procedural. La persecución y la captura mantienen sus reglas.

Las monedas tienen bisel, canto estriado, denominación en relieve y pátina sobre
metal con reflejos; no usan emisión de luz para parecer doradas. Se dibujan en
lotes con `InstancedMesh`: detalle completo de cerca y volumen simplificado a
más de 28 m. La recogida y el contador usan las mismas posiciones de juego.

El perro tiene cuerpo, hocico, patas y cola de formas suaves; las barreras y los
vagones incorporan bordes redondeados. Son mejoras de modelado y materiales, no
escaneos fotográficos ni modelos policiales civiles a medida.
