// Detección del esqueleto con MediaPipe Pose y traducción a gestos del juego.
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Índices de los puntos del esqueleto de MediaPipe
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24;

// Umbrales (en unidades relativas al cuerpo, así no dependen de la distancia a la cámara)
const LANE_ENTER = 0.75;   // anchos de hombro desplazado para cambiar de carril
const LANE_EXIT = 0.45;    // histéresis para volver al centro
const JUMP_UP = 0.16;      // subida de hombros (en largos de torso) para saltar
const DUCK_DOWN = 0.35;    // bajada de hombros para agacharse
const REARM = 0.08;        // zona neutra para volver a armar los gestos
const CALIB_FRAMES = 25;   // frames quieto necesarios para calibrar

export class PoseController {
  constructor(video, canvas, handlers = {}) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.running = false;
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
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
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

    this.status('Pidiendo permiso de cámara…');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.drawer = new DrawingUtils(this.ctx);

    this.running = true;
    this.loop();
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
  }

  loop = () => {
    if (!this.running) return;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      this.process(result.landmarks[0]);
    }
    requestAnimationFrame(this.loop);
  };

  process(lm) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!lm) {
      this.status('No te veo 👀 — ponte delante de la cámara');
      return;
    }

    this.drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#4ad0ff', lineWidth: 4 });
    this.drawer.drawLandmarks(lm, { color: '#ffd84a', fillColor: '#ff5a5a', radius: 4 });

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
    if (this.jumpArmed && dy < -JUMP_UP) {
      this.jumpArmed = false;
      this.lastJump = now;
      this.h.onJump?.();
    }
    // Agacharse: los hombros bajan (ignoramos el aterrizaje justo después de saltar)
    if (this.duckArmed && dy > DUCK_DOWN && now - this.lastJump > 600) {
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
    this.status(`✅ Carril: ${laneName} · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)}`);
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
