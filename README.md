# Subway Surfer REAL 🏃‍♂️📷

Un "Subway Surfers" que se juega **con el cuerpo**: la cámara detecta tu esqueleto
en tiempo real y el corredor hace lo mismo que tú.

| Tú haces…                          | En el juego…               |
|------------------------------------|----------------------------|
| Paso a la izquierda / derecha      | Cambia de carril           |
| Saltas                             | Salta las vallas bajas     |
| Te agachas                         | Pasa por debajo de barras  |
| Levantas las dos manos             | Empieza / reinicia         |

Los trenes no se pueden saltar: hay que cambiar de carril.

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
También se puede jugar con teclado: ← → / A D, ↑ / Espacio, ↓ / S.

## Cómo funciona

- **`pose.js`** – usa [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
  (33 puntos del cuerpo) y convierte el movimiento en gestos:
  - *Carril*: posición horizontal del centro de los hombros respecto a la calibración,
    medida en anchos de hombro (así da igual lo lejos que estés).
  - *Salto / agacharse*: subida o bajada brusca de los hombros, medida en largos de torso.
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
