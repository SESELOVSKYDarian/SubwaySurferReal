// Detección del esqueleto en un hilo aparte: así el juego no se congela mientras
// MediaPipe analiza cada fotograma de la cámara.
// Es un worker "clásico" (no de módulo) porque MediaPipe carga su WASM con importScripts.
const BASE = new URL('./vendor/mediapipe/', self.location.href).href.replace(/\/$/, '');
const MODEL = kind => `${BASE}/models/pose_landmarker_${kind}.task`;

// Niveles del más preciso al más liviano. El controlador mide cada uno en la máquina real y se queda
// con el más rápido (ver PoseController.trackStats): en algunos equipos la CPU gana a la GPU, en otros no.
const TIERS = [
  { kind: 'full', delegate: 'GPU' },
  { kind: 'lite', delegate: 'GPU' },
  { kind: 'lite', delegate: 'CPU' },
];

// Una sola persona en modo VIDEO: después del primer cuadro MediaPipe sigue al jugador recortando su
// zona en vez de volver a buscar personas en toda la imagen. Medido en una Intel UHD 617: 38 ms por
// cuadro contra 64 ms buscando hasta 3 personas, y 65 ms con un recorte analizado en modo IMAGE.
// Quien pasa por detrás no le roba el seguimiento mientras el jugador siga a la vista.
const OPTIONS = { runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 };

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

let vision = null;
const loaded = new Map();   // nivel → detector; se conservan para volver atrás sin recargar
let current = null;         // el que analiza los cuadros; se cambia recién cuando el otro está listo

// Calentamiento: la primera inferencia compila los shaders de la GPU (varios segundos).
// Hecha aquí, el primer fotograma real ya sale rápido y el vigilante no cree que se perdió.
async function warm(landmarker) {
  const blank = new OffscreenCanvas(256, 256);
  blank.getContext('2d').fillRect(0, 0, 256, 256);
  const bitmap = await createImageBitmap(blank);
  try { landmarker.detectForVideo(bitmap, performance.now()); } finally { bitmap.close(); }
}

async function load(tier) {
  await boot();
  vision ??= await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  for (let index = tier; index < TIERS.length; index++) {
    const { kind, delegate } = TIERS[index];
    try {
      let landmarker = loaded.get(index);
      if (!landmarker) {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL(kind), delegate },
          ...OPTIONS,
          ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
        });
        await warm(landmarker);
        loaded.set(index, landmarker);
      }
      current = landmarker;
      return { tier: index, delegate, kind };
    } catch (error) {
      if (index === TIERS.length - 1) throw error;
    }
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init' || data.type === 'tier') {
    try {
      const info = await load(data.tier ?? 0);
      self.postMessage({ type: data.type === 'init' ? 'ready' : 'tier', ...info });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'frame') {
    let poses = [];
    const start = performance.now();
    try {
      poses = current.detectForVideo(data.bitmap, data.ts).landmarks;
    } catch {
      // Un fotograma que falla no puede dejar al controlador esperando para siempre.
      poses = [];
    } finally {
      data.bitmap.close();
    }
    self.postMessage({ type: 'result', poses, ms: performance.now() - start });
  }
};
