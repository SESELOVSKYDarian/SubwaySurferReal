// Detección del esqueleto en un hilo aparte: así el juego no se congela mientras
// MediaPipe analiza cada fotograma de la cámara.
// Es un worker "clásico" (no de módulo) porque MediaPipe carga su WASM con importScripts.
const BASE = new URL('./vendor/mediapipe/', self.location.href).href.replace(/\/$/, '');
const MODEL = kind => `${BASE}/models/pose_landmarker_${kind}.task`;

// Escalera de rendimiento: se empieza por el modelo más preciso y el controlador
// baja un peldaño si la máquina no da la talla (ver PoseController.adapt).
const TIERS = [
  { kind: 'full', delegate: 'GPU' },
  { kind: 'lite', delegate: 'GPU' },
  { kind: 'lite', delegate: 'CPU' },
];

// Dos detectores con el mismo modelo:
//  - búsqueda: cuadro completo, hasta 3 personas, para encontrar y elegir al jugador;
//  - seguimiento: recibe solo un recorte alrededor del jugador ya fijado y devuelve una
//    persona. Lo que pasa por detrás queda fuera del recorte, así que no puede
//    robarle el seguimiento, y además el modelo ve al jugador más grande (más preciso).
const SEARCH = { runningMode: 'VIDEO', numPoses: 3, minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.55 };
// Hasta 2 personas en el recorte: si alguien asoma por el borde, el controlador se queda con la que
// coincide con el jugador (posición, tamaño y proporciones) y descarta la otra.
const TRACK = { runningMode: 'IMAGE', numPoses: 2, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5 };

// Chrome exige que importScripts reciba un archivo con tipo MIME de JavaScript, y muchos
// servidores sirven .cjs como text/plain: ese error hacía caer el seguimiento al hilo
// principal (el juego se trababa). Se descarga el texto y se carga desde un Blob.
let FilesetResolver, PoseLandmarker;
async function boot() {
  if (PoseLandmarker) return;
  self.exports = {};
  const source = await (await fetch(`${BASE}/vision_bundle.cjs`)).text();
  importScripts(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  ({ FilesetResolver, PoseLandmarker } = self.exports);
}

let search = null, track = null;
let vision = null;
let createTrack = null;

// Calentamiento: la primera inferencia compila los shaders de la GPU (varios segundos).
// Hecha aquí, el primer fotograma real ya sale rápido y el vigilante no cree que se perdió.
async function warm(run) {
  const blank = new OffscreenCanvas(256, 256);
  blank.getContext('2d').fillRect(0, 0, 256, 256);
  const bitmap = await createImageBitmap(blank);
  try { run(bitmap); } finally { bitmap.close(); }
}

// Primero solo el detector de búsqueda: con él ya se puede calibrar y jugar. El de seguimiento
// (recorte alrededor del jugador) se carga después sin hacer esperar: en equipos lentos cargar y
// calentar los dos juntos superaba el tiempo de espera y el juego caía al hilo principal.
async function load(tier) {
  await boot();
  vision ??= await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  for (let index = tier; index < TIERS.length; index++) {
    const { kind, delegate } = TIERS[index];
    try {
      const create = options => PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL(kind), delegate },
        ...options,
        ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
      });
      const nextSearch = await create(SEARCH);
      await warm(bitmap => nextSearch.detectForVideo(bitmap, performance.now()));
      search?.close();
      track?.close();
      search = nextSearch;
      track = null;
      createTrack = () => create(TRACK);
      return { tier: index, delegate, kind };
    } catch (error) {
      if (index === TIERS.length - 1) throw error;
    }
  }
}

async function loadTrack() {
  const make = createTrack;
  try {
    const next = await make();
    await warm(bitmap => next.detect(bitmap));
    if (make !== createTrack) { next.close(); return; }   // mientras tanto se cambió de modelo
    track = next;
    self.postMessage({ type: 'track' });
  } catch {
    // Sin detector de recorte se sigue con el de cuadro completo.
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init' || data.type === 'tier') {
    try {
      const info = await load(data.tier ?? 0);
      self.postMessage({ type: data.type === 'init' ? 'ready' : 'tier', ...info });
      loadTrack();
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'frame') {
    let poses = [];
    const start = performance.now();
    try {
      // Un recorte que llega sin detector de recorte (justo al cambiar de modelo) se descarta:
      // sus coordenadas no son las del cuadro completo.
      if (data.crop) poses = track ? track.detect(data.bitmap).landmarks : [];
      else poses = search.detectForVideo(data.bitmap, data.ts).landmarks;
    } catch {
      // Un fotograma que falla no puede dejar al controlador esperando para siempre.
      poses = [];
    } finally {
      data.bitmap.close();
    }
    self.postMessage({ type: 'result', poses, ms: performance.now() - start, crop: data.crop || null });
  }
};
