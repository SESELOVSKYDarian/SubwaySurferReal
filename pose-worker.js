// Detección del esqueleto en un hilo aparte: así el juego no se congela mientras
// MediaPipe analiza cada fotograma de la cámara.
// Es un worker "clásico" (no de módulo) porque MediaPipe carga su WASM con importScripts.
const VERSION = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

self.exports = {};
importScripts(`${BASE}/vision_bundle.cjs`);
const { FilesetResolver, PoseLandmarker } = self.exports;

let landmarker = null;

async function init() {
  const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  const create = (delegate, extra = {}) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      ...extra,
    });
  try {
    landmarker = await create('GPU', { canvas: new OffscreenCanvas(1, 1) });
    return 'GPU';
  } catch {
    landmarker = await create('CPU');
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
    let landmarks = null;
    try {
      const result = landmarker.detectForVideo(data.bitmap, data.ts);
      landmarks = result.landmarks[0] || null;
    } finally {
      data.bitmap.close();
    }
    self.postMessage({ type: 'result', landmarks });
  }
};
