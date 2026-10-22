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
- **`game.js`** – el mundo 3D con [Three.js](https://threejs.org): vías, edificios,
  corredor, obstáculos, monedas y colisiones.
- **`main.js`** – conecta los gestos y el teclado con el juego.

Todo corre en tu navegador; la imagen de la cámara no se envía a ningún sitio.
