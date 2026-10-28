# Técnica Run

Corredor en tercera persona ambientado alrededor de una escuela técnica. El alumno
lleva un guardapolvo azul inspirado en la referencia: cabeza descubierta, pelo
corto, solapas, botones y bolsillos. Un profesor lo persigue tras los tropiezos.
El profesor tiene un modelo propio inspirado en las fotos aportadas: contextura
más ancha, pelo y barba canosos, anteojos, suéter verde, pantalón oscuro y gorra
de policía. El parecido es una interpretación 3D, no un escaneo facial.
El entorno urbano tiene asfalto, carriles y colectivos argentinos, con grafitis de talleres,
electromecánica y laboratorios.

La ambientación recorre Juan B. Justo desde Av. de los Trabajadores hasta San Juan,
en un bucle fijo con comercios y fachadas inspirados en la avenida marplatense.
El recorrido está comprimido para el juego. [Criterio y referencias](docs/juan-b-justo.md).

## Jugar

```bash
python3 tools/serve.py
```

El servidor desactiva la caché: así el navegador no sigue usando archivos .js
viejos después de un cambio (con `python3 -m http.server` puede pasar).

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

Hay tableros de dibujo para saltar, bancos escolares rotos para pasar agachado,
rampas para subir a colectivos, monedas y jetpack. El primer tropiezo acerca a
Estanga, el profesor que persigue al alumno; otro tropiezo durante los siguientes
cinco segundos termina la partida.
Una barra muestra el tiempo restante y un aviso confirma cuando escapás. El
alumno reacciona inclinando el torso y levantando los brazos. Cada contacto se
cuenta una sola vez, sin dar inmunidad frente a otros obstáculos. Los bancos
y los choques frontales con colectivos también terminan la partida.

## Música

Para sumar temas, copiá archivos MP3 a `assets/audio` y recargá el juego. Se mezclan
al azar y se reproducen en bucle; con el servidor local se detectan sin reiniciarlo.
El volumen, el silencio y la pausa siguen funcionando igual.

Para que la lista publicada en GitHub se actualice al hacer commit, configurá una
sola vez por copia del repositorio:

```sh
python tools/audio_playlist.py --install-hook
```

Después solo agregá los MP3 al commit y subí los cambios. No hace falta editar
código ni escribir nombres de canciones. [Detalles](assets/audio/README.md).

## Animación y colisiones

Agacharse sostiene una postura baja: no gira el cuerpo ni reinicia una voltereta
al recibir detecciones repetidas. Carrera, salto, agachado y vuelo se mezclan con
transiciones suavizadas. Las piernas usan dos eslabones y las posturas parten de
una base estable, sin acumulación de giros sobre la animación anterior.

La altura de colisión sigue el agachado visible. La trayectoria del salto usa
integración balística para reducir diferencias entre tasas de cuadros. Pausar
congela también las posturas, monedas, jetpack y cámara; no consume objetos.

La cámara permanece detrás del alumno, encuadra los tres carriles y se aleja en
pantallas verticales. El selector ofrece calidad alta con resolución interna de
hasta 2×, sombras suaves de mayor detalle y más distancia de dibujado; el modo
automático ajusta la resolución entre 0,55× y 1,5× según el rendimiento.
La zona de sombras sigue el tramo visible y se recicla junto con edificios y
muros. Equilibrada prioriza la fluidez. El rendimiento depende del equipo: no
se garantizan 60 FPS.

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
Alumno y profesor usan archivos, huesos y materiales independientes. La procedencia y
licencias están en [`assets/characters/ATTRIBUTION.md`](assets/characters/ATTRIBUTION.md).

Para reconstruir el GLB (opcional, no hace falta para jugar):

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/build_student.py
python3 tools/build_student.py --low
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

El alumno acompaña brazos, codos y orientación aproximada de las manos captados por la cámara. [Detalles y límites](docs/arm-tracking.md).

Ambientación marplatense: colectivos 542 rojo, 720 verde/amarillo y 563 azul; pintadas de Aldosivi, Alvarado y SPOT. [Modelos, optimización y validación](docs/marplatense.md).

La cámara acompaña los cambios de carril, sube junto a colectivos y atenúa los
que obstruyen la vista. Los bancos son verdes y los murales tienen más contraste.
Carrera, salto y aterrizaje tienen posturas y apoyos diferenciados.
[Visibilidad, animaciones y capturas](docs/visibility-animation.md).

Perfil del profesor con gorra de policía: [modelo, referencias y comprobaciones](docs/photo-professor.md).

Profesor modelado en Blender: [modelo editable, materiales y reconstrucción](docs/realism-materials.md).
Incluye piel UV, barba, ropa y dos niveles de detalle animados. El rostro es una
aproximación con piel CC0; el parecido fotográfico exacto sigue pendiente.

Menú El Guardapolvo, sonido y cuatro personajes seleccionables: [detalles y límites](docs/menu-personajes.md).

Estanga, el perseguidor, se reconstruyó desde la hoja de personaje aportada:
siluetas medidas, rostro ajustado con 478 puntos faciales, texturas proyectadas,
suéter oliva, jean, botas de trekking, anteojos y reloj, con marcha, reposo,
mirada y agarre propios. [Proceso, validación y límites](docs/estanga.md).

Los cinco personajes usan un esqueleto detallado de 52 huesos (hombros, tres
vértebras y dedos) con carrera, salto, rodada y reposo nuevos; El técnico se
reconstruyó con guardapolvo real y los escaneos se riggearon ajustando un cuerpo
anatómico a cada uno. [Detalles](docs/personajes-detallados.md).

Escenario renovado: calzada con huellas y fisuras selladas, tapas y rejillas,
veredas de baldosa, paredones de hormigón encofrado con pilastras, farolas LED,
tanques de agua y antenas en los techos, torres al fondo y colectivos nuevos con
vidrios, puertas, cartel de LED y ruedas. [Detalles](docs/escenario.md).
