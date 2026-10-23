# Técnica Run

Corredor en tercera persona ambientado alrededor de una escuela técnica. El alumno
lleva un guardapolvo azul inspirado en la referencia: cabeza descubierta, pelo
corto, solapas, botones y bolsillos. Un profesor lo persigue tras los tropiezos.
El profesor es **provisional**: su apariencia específica queda pendiente de la foto.
El entorno urbano y las vías se conservan, con carteles y grafitis de talleres,
electromecánica y laboratorios.

## Jugar

```bash
python3 -m http.server 8000
```

Abrir el servidor local en un navegador con WebGL. También se publica desde `main`
en GitHub Pages. Es una aplicación estática: no necesita compilación, Node ni
servicios externos para jugar con teclado.

- **← / → o A / D:** carriles.
- **↑ / W / Espacio:** saltar. La repetición automática de tecla no encadena saltos.
- **↓ / S:** agacharse; mantener prolonga la postura y soltar inicia la salida.
- **P:** pausar/reanudar; **C:** recalibrar la cámara.
- Con cámara: pasos laterales, salto, agachado y ambas manos arriba para iniciar.
- Inicio y reanudación con cuenta atrás 3–2–1. El seguimiento incompleto pausa la partida hasta recalibrar.
- La cámara se reutiliza entre partidas y se reconecta si el navegador conserva el permiso.

Hay rampas para subir a vagones, monedas y jetpack. El primer tropiezo acerca al
profesor; otro tropiezo durante la persecución termina la partida. Las barras
altas y los choques frontales con vagones también terminan la partida.

## Animación y colisiones

Agacharse sostiene una postura baja: no gira el cuerpo ni reinicia una voltereta
al recibir detecciones repetidas. Carrera, salto, agachado y vuelo se mezclan con
transiciones suavizadas. Las piernas usan dos eslabones y las posturas parten de
una base estable, sin acumulación de giros sobre la animación anterior.

La altura de colisión sigue el agachado visible. La trayectoria del salto usa
integración balística para reducir diferencias entre tasas de cuadros. Pausar
congela también las posturas, monedas, jetpack y cámara; no consume objetos.

La cámara permanece detrás del alumno, encuadra los tres carriles y se aleja en
pantallas verticales. El selector de calidad adapta resolución y distancia de
visualización. El rendimiento depende del equipo: no se garantizan 60 FPS.

## Cámara corporal

La cámara requiere un contexto seguro y permiso del navegador. MediaPipe se carga
solo al activarla: `pose-worker.js` analiza en un hilo aparte y `pose.js` sigue al
jugador, filtra los puntos y detecta gestos. El menú permite ajustar sensibilidad.
Si se pierde al jugador, la partida se pausa y recalibra antes de continuar.
MediaPipe y sus modelos aún se descargan de CDN/Google; los píxeles de cámara se
procesan en el navegador. Three.js y los personajes se sirven desde el repositorio.

## Modelo y fuentes

`assets/characters/technical-student.glb` contiene la anatomía CC0 de MakeHuman,
rig propio, guardapolvo y accesorios modelados para este juego. No es el modelo
militar recoloreado ni una reproducción exacta del rostro de la referencia.
Alumno y profesor tienen huesos y materiales independientes. La procedencia y
licencias están en [`assets/characters/ATTRIBUTION.md`](assets/characters/ATTRIBUTION.md).

Para reconstruir el GLB (opcional, no hace falta para jugar):

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/build_student.py
```

La fuente CC0 comprimida está incluida; la reconstrucción no descarga recursos.
El antiguo `runner.glb` se conserva para compatibilidad con versiones cacheadas,
pero la versión actual no lo carga. Three.js 0.160.0 está en `vendor/three` con su
licencia MIT. Las texturas urbanas siguen siendo procedurales.

## Pruebas

Node 20 o superior, solo para desarrollo:

```bash
npm ci
npx playwright install chromium
npm test
npm run benchmark
```

Puede usarse Chromium instalado mediante `CHROMIUM_PATH`. En el contenedor de
preparación, sin sandbox de Chromium y sin GPU física:

```bash
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm test
CHROMIUM_NO_SANDBOX=1 SOFTWARE_WEBGL=1 npm run benchmark
```

Las pruebas arrancan su propio servidor. Las capturas van en `test-results/`.
El benchmark espera trabajo gráfico terminado mediante lectura de píxel, en lugar
de contar solo comandos enviados al renderizador. Ver
[`docs/animation-fixes.md`](docs/animation-fixes.md) para la validación actual y
[`docs/rollback.md`](docs/rollback.md) para volver a una versión anterior.

Detalles de seguimiento y techo de vagones: [cámara y cuenta atrás](docs/camera-countdown.md).
