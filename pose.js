// Detección del esqueleto con MediaPipe Pose y traducción a gestos del juego.
// La red neuronal corre en un Web Worker (pose-worker.js); si el navegador no lo
// permite, se usa el hilo principal como respaldo.

const VERSION = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Índices de los puntos del esqueleto de MediaPipe
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24;
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12],
];

// Umbrales (en unidades relativas al cuerpo, así no dependen de la distancia a la cámara)
const LANE_ENTER = 0.6;    // anchos de hombro desplazado para cambiar de carril
const LANE_EXIT = 0.35;    // histéresis para volver al centro
const JUMP_UP = 0.15;      // subida de hombros (en largos de torso) para saltar
const JUMP_EARLY = 0.07;   // ...o una subida menor pero rápida
const JUMP_SPEED = 1.4;    // largos de torso por segundo
const DUCK_DOWN = 0.32;    // bajada de hombros para agacharse
const DUCK_EARLY = 0.16;
const DUCK_SPEED = 1.6;
const REARM = 0.08;        // zona neutra para volver a armar los gestos
const CALIB_FRAMES = 20;   // frames quieto necesarios para calibrar

export class PoseController {
  constructor(video, canvas, handlers = {}) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.running = false;
    this.busy = false;
    this.lastVideoTime = -1;
    this.recalibrate();
  }

  status(text) {
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.h.onStatus?.(text);
    }
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('el navegador bloquea la cámara: abre el juego por https:// o http://localhost');
    }
    this.status('Cargando modelo de esqueleto…');
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 60 }, facingMode: 'user' },
        audio: false,
      }),
      this.startWorker().catch((err) => {
        console.warn('Worker no disponible, uso el hilo principal:', err);
        return this.startMainThread();
      }),
    ]);
    this.video.srcObject = stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;

    this.running = true;
    this.scheduleFrame();
  }

  startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./pose-worker.js', import.meta.url));
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('el worker tardó demasiado'));
      }, 30000);
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(e.message || 'error en el worker'));
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          clearTimeout(timer);
          this.worker = worker;
          this.mode = `worker ${data.delegate}`;
          worker.onmessage = ({ data: d }) => {
            if (d.type !== 'result') return;
            this.busy = false;
            this.process(d.landmarks);
          };
          resolve();
        } else if (data.type === 'error') {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(data.message));
        }
      };
      worker.postMessage({ type: 'init' });
    });
  }

  async startMainThread() {
    const { FilesetResolver, PoseLandmarker } = await import(`${BASE}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options('GPU'));
    } catch {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options('CPU'));
    }
    this.mode = 'hilo principal';
  }

  // Procesa cada fotograma nuevo de la cámara en cuanto llega
  scheduleFrame() {
    if (!this.running) return;
    if (this.video.requestVideoFrameCallback) {
      this.video.requestVideoFrameCallback(() => this.onFrame());
    } else {
      requestAnimationFrame(() => this.onFrame());
    }
  }

  async onFrame() {
    const t = this.video.currentTime;
    if (t !== this.lastVideoTime && !this.busy && this.video.readyState >= 2) {
      this.lastVideoTime = t;
      const ts = performance.now();
      if (this.worker) {
        this.busy = true;
        try {
          const bitmap = await createImageBitmap(this.video);
          this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
        } catch {
          this.busy = false;
        }
      } else {
        const result = this.landmarker.detectForVideo(this.video, ts);
        this.process(result.landmarks[0]);
      }
    }
    this.scheduleFrame();
  }

  recalibrate() {
    this.base = null;
    this.samples = [];
    this.lane = 0;
    this.jumpArmed = true;
    this.duckArmed = true;
    this.handsUpSince = 0;
    this.lastHandsUp = 0;
    this.lastJump = 0;
    this.prev = null;
  }

  draw(lm) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!lm) return;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4ad0ff';
    ctx.beginPath();
    for (const [a, b] of BONES) {
      if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      if ((lm[i].visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.arc(lm[i].x * W, lm[i].y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  process(lm) {
    this.draw(lm);
    if (!lm) {
      this.status('No te veo 👀 — ponte delante de la cámara');
      this.prev = null;
      return;
    }

    const visible = (i) => (lm[i].visibility ?? 1) > 0.5;
    if (!visible(L_SHOULDER) || !visible(R_SHOULDER)) {
      this.status('Necesito ver tus hombros');
      return;
    }

    // x en espejo: moverte a tu derecha = moverte a la derecha en pantalla
    const sx = 1 - (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2;
    const sy = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2;
    const sw = Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y);
    const hipsVisible = visible(L_HIP) && visible(R_HIP);
    const torso = hipsVisible ? (lm[L_HIP].y + lm[R_HIP].y) / 2 - sy : sw * 1.3;

    const now = performance.now();
    this.checkHandsUp(lm, visible, now);

    if (!this.base) {
      this.calibrate(sx, sy, sw, torso);
      return;
    }

    const b = this.base;
    const dx = (sx - b.x) / b.sw;       // + = a la derecha
    const dy = (sy - b.y) / b.torso;    // + = más abajo

    // Velocidad vertical (largos de torso por segundo) para reaccionar antes
    let vy = 0;
    if (this.prev && now > this.prev.t) vy = ((dy - this.prev.dy) * 1000) / (now - this.prev.t);
    this.prev = { dy, t: now };

    // Carril (absoluto respecto al punto calibrado, con histéresis)
    let lane = this.lane;
    if (lane === 0) {
      if (dx < -LANE_ENTER) lane = -1;
      else if (dx > LANE_ENTER) lane = 1;
    } else if (Math.abs(dx) < LANE_EXIT) {
      lane = 0;
    } else if (lane === -1 && dx > LANE_ENTER) {
      lane = 1;
    } else if (lane === 1 && dx < -LANE_ENTER) {
      lane = -1;
    }
    if (lane !== this.lane) {
      this.lane = lane;
      this.h.onLane?.(lane);
    }

    // Salto: los hombros suben de golpe
    if (this.jumpArmed && (dy < -JUMP_UP || (dy < -JUMP_EARLY && vy < -JUMP_SPEED))) {
      this.jumpArmed = false;
      this.lastJump = now;
      this.h.onJump?.();
    }
    // Agacharse: los hombros bajan (ignoramos el aterrizaje justo después de saltar)
    const ducking = dy > DUCK_DOWN || (dy > DUCK_EARLY && vy > DUCK_SPEED);
    if (this.duckArmed && ducking && now - this.lastJump > 600) {
      this.duckArmed = false;
      this.h.onDuck?.();
    }
    if (Math.abs(dy) < REARM) {
      this.jumpArmed = true;
      this.duckArmed = true;
      // Adaptación lenta por si te acercas/alejas un poco de la cámara
      b.y += (sy - b.y) * 0.02;
      b.sw += (sw - b.sw) * 0.02;
      if (hipsVisible) b.torso += (torso - b.torso) * 0.02;
    }

    const laneName = ['izquierda', 'centro', 'derecha'][lane + 1];
    this.status(`✅ ${laneName} · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)} · ${this.mode}`);
  }

  calibrate(sx, sy, sw, torso) {
    this.samples.push({ x: sx, y: sy, sw, torso });
    if (this.samples.length > CALIB_FRAMES) this.samples.shift();

    const n = this.samples.length;
    const mean = (k) => this.samples.reduce((s, p) => s + p[k], 0) / n;
    const mx = mean('x'), my = mean('y');
    const spread = Math.max(...this.samples.map((p) => Math.hypot(p.x - mx, p.y - my)));

    // Hay que estar quieto: si te mueves mucho, se reinicia la cuenta
    if (spread > 0.25 * mean('sw')) {
      this.samples = [this.samples[n - 1]];
    }
    const pct = Math.round((this.samples.length / CALIB_FRAMES) * 100);
    this.status(`Calibrando… quédate quieto en el centro (${pct}%)`);

    if (this.samples.length >= CALIB_FRAMES) {
      this.base = { x: mx, y: my, sw: mean('sw'), torso: Math.max(mean('torso'), 0.05) };
      this.lane = 0;
      this.h.onCalibrated?.();
    }
  }

  checkHandsUp(lm, visible, now) {
    const up =
      visible(L_WRIST) && visible(R_WRIST) && visible(NOSE) &&
      lm[L_WRIST].y < lm[NOSE].y && lm[R_WRIST].y < lm[NOSE].y;
    if (!up) {
      this.handsUpSince = 0;
      return;
    }
    if (!this.handsUpSince) this.handsUpSince = now;
    if (now - this.handsUpSince > 400 && now - this.lastHandsUp > 2000) {
      this.lastHandsUp = now;
      this.h.onHandsUp?.();
    }
  }
}
