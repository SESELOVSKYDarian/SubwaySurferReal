// Detección del esqueleto en un hilo aparte: así el juego no se congela mientras
// MediaPipe analiza cada fotograma de la cámara.
// Es un worker "clásico" (no de módulo) porque MediaPipe carga su WASM con importScripts.
const BASE = new URL('./vendor/mediapipe/', self.location.href).href.replace(/\/$/, '');
const MODEL = kind => `${BASE}/models/pose_landmarker_${kind}.task`;

// Detectamos varias personas para poder quedarnos con el jugador e ignorar
// a quien pase por detrás
const OPTIONS = {
  runningMode: 'VIDEO',
  numPoses: 3,
  minPoseDetectionConfidence: 0.6,
  minPosePresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
};

self.exports = {};
importScripts(`${BASE}/vision_bundle.cjs`);
const { FilesetResolver, PoseLandmarker } = self.exports;

let landmarker = null;

async function init() {
  const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  const create = (kind, delegate, extra = {}) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL(kind), delegate },
      ...OPTIONS,
      ...extra,
    });
  try {
    landmarker = await create('full', 'GPU', { canvas: new OffscreenCanvas(1, 1) });
    return 'GPU';
  } catch {
    landmarker = await create('lite', 'CPU');
    return 'CPU';
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const delegate = await init();
      self.postMessage({ type: 'ready', delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'frame') {
    let poses = [];
    try {
      poses = landmarker.detectForVideo(data.bitmap, data.ts).landmarks;
    } finally {
      data.bitmap.close();
    }
    self.postMessage({ type: 'result', poses });
  }
};
