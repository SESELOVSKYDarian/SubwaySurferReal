// Detección del esqueleto con MediaPipe Pose y traducción a gestos del juego.
// La red neuronal corre en un Web Worker (pose-worker.js); si el navegador no lo
// permite, se usa el hilo principal como respaldo.

const VERSION = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = (kind) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${kind}/float16/1/pose_landmarker_${kind}.task`;

// Índices de los puntos del esqueleto de MediaPipe
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24;
const L_ANKLE = 27, R_ANKLE = 28;
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12],
];

// Umbrales (en unidades relativas al cuerpo, así no dependen de la distancia a la cámara).
// Los de salto y agacharse se dividen por la sensibilidad elegida en el menú.
const LANE_ENTER = 0.6;    // anchos de hombro desplazado para cambiar de carril
const LANE_EXIT = 0.35;    // histéresis para volver al centro
const JUMP_UP = 0.11;      // subida del cuerpo (en largos de torso) para saltar
const JUMP_EARLY = 0.05;   // ...o una subida menor pero rápida
const JUMP_SPEED = 1.2;    // largos de torso por segundo
const DUCK_DOWN = 0.38;    // bajada/encogimiento para agacharse ("hacerse bolita")
const DUCK_DEEP = 0.6;     // tan agachado que no hace falta confirmar
const DUCK_EXIT = 0.2;     // por debajo de esto se considera que te levantaste
const CALIB_FRAMES = 20;   // frames quieto necesarios para calibrar
const LOST_FRAMES = 10;    // ~1/3 s sin ver al jugador = lo hemos perdido (se pausa)
const FORGET_FRAMES = 60;  // ~2 s sin verlo: se elige de nuevo a la persona más cercana
const MAX_JUMP_AWAY = 2.5; // cuánto puede "saltar" el jugador entre fotogramas (en anchos de hombro)

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// Filtro "One Euro": quita el temblor de los puntos cuando estás quieto pero casi no
// añade retraso cuando te mueves rápido (la suavidad depende de la velocidad).
class OneEuro {
  constructor(minCutoff = 2.5, beta = 6, dCutoff = 1.5) {
    Object.assign(this, { minCutoff, beta, dCutoff, x: null });
  }
  static alpha(cutoff, dt) {
    return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  }
  filter(x, t) {
    if (this.x == null || t - this.t > 0.3) {
      Object.assign(this, { x, dx: 0, t });
      return x;
    }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * ((x - this.x) / dt - this.dx);
    this.x += OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}

export class PoseController {
  constructor(video, canvas, handlers = {}, sensitivity = 1) {
    this.sensitivity = sensitivity;
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.running = false;
    this.busy = false;
    this.lastVideoTime = -1;
    this.track = null;   // posición y tamaño del jugador, para no confundirlo con otros
    this.missing = 0;
    this.lost = false;
    this.recalibrate();
  }

  status(text) {
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.h.onStatus?.(text);
    }
  }

  async start() {
    if (this.running) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.openCamera().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abre el juego por HTTPS para usar la cámara');
    this.status('Cargando cámara y esqueleto…');
    // Conservar el stream y el modelo: reintentar no vuelve a pedir acceso ni carga todo otra vez.
    if (!this.stream?.getVideoTracks().some(track => track.readyState === 'live')) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 60 }, facingMode: 'user' }, audio: false,
      });
      for (const track of this.stream.getVideoTracks()) track.onended = () => {
        this.running = false; this.recalibrate(); this.h.onLost?.();
      };
    }
    if (!this.worker && !this.landmarker) {
      await this.startWorker().catch(() => this.startMainThread());
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth; this.canvas.height = this.video.videoHeight;
    this.running = true; this.lastResult = performance.now();
    this.watchdog ??= setInterval(() => {
      if (this.running && performance.now() - this.lastResult > 1200 && !this.lost) {
        this.lost = true; this.recalibrate(); this.h.onLost?.();
      }
    }, 300);
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
            this.process(d.poses);
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
    const options = (kind, delegate) => ({
      baseOptions: { modelAssetPath: MODEL(kind), delegate },
      runningMode: 'VIDEO',
      numPoses: 3,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options('full', 'GPU'));
    } catch {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options('lite', 'CPU'));
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
        this.process(result.landmarks);
      }
    }
    this.scheduleFrame();
  }

  recalibrate() {
    this.h.onCalibrating?.();
    if (this.ducking) this.h.onDuckEnd?.();
    this.base = null;
    this.samples = [];
    this.lane = 0;
    this.jumpArmed = true;
    this.ducking = false;
    this.duckFrames = 0;
    this.handsUpSince = 0;
    this.lastHandsUp = 0;
    this.lastJump = 0;
    this.lastDuckEnd = 0;
    this.prev = null;
    this.meter = { jump: 0, duck: 0 };
    this.filters = {};
  }

  // De todas las personas detectadas, elige al jugador: la que sigue donde estaba
  // el jugador en el fotograma anterior. Si aún no hay jugador, la más grande
  // (la más cercana a la cámara) cerca del centro. Los demás se ignoran.
  selectPlayer(poses) {
    const cands = [];
    for (const lm of poses) {
      const v = (i) => (lm[i].visibility ?? 1) > 0.5;
      const pts = [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].filter(v);
      if (pts.length < 2) continue;
      const size = v(L_SHOULDER) && v(R_SHOULDER)
        ? Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y)
        : this.track?.size;
      if (!size) continue;
      cands.push({ lm, size, cx: avg(pts.map((i) => lm[i].x)), cy: avg(pts.map((i) => lm[i].y)) });
    }
    if (!cands.length) return null;

    let best;
    const t = this.track;
    if (t) {
      const score = (c) => Math.hypot(c.cx - t.cx, c.cy - t.cy) / t.size + Math.abs(Math.log(c.size / t.size)) * 2;
      best = cands.reduce((a, c) => (score(c) < score(a) ? c : a));
      if (score(best) > MAX_JUMP_AWAY) return null;
    } else {
      const central = cands.filter((c) => c.cx > 0.15 && c.cx < 0.85);
      best = (central.length ? central : cands).reduce((a, c) => (c.size > a.size ? c : a));
    }
    this.track = { cx: best.cx, cy: best.cy, size: t ? t.size + (best.size - t.size) * 0.3 : best.size };
    return best.lm;
  }

  draw(lm, poses = []) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // Las demás personas, en gris: se ven pero no cuentan
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(200,200,200,0.5)';
    ctx.beginPath();
    for (const other of poses) {
      if (other === lm) continue;
      for (const [a, b] of BONES) {
        ctx.moveTo(other[a].x * W, other[a].y * H);
        ctx.lineTo(other[b].x * W, other[b].y * H);
      }
    }
    ctx.stroke();
    if (lm) {
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
    if (!this.base) return;
    // Medidor: hacia arriba = salto, hacia abajo = agacharse. La raya blanca es el umbral.
    // (El canvas se ve en espejo, así que x = W - 30 aparece a la izquierda.)
    const x = W - 34, mid = H / 2, half = 110, w = 22;
    const up = Math.min(1.3, this.meter.jump / (JUMP_UP / this.sensitivity));
    const down = Math.min(1.3, this.meter.duck / (DUCK_DOWN / this.sensitivity));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, mid - half * 1.3, w, half * 2.6);
    ctx.fillStyle = up >= 1 ? '#7dff9a' : '#ffd84a';
    if (up > 0) ctx.fillRect(x, mid - up * half, w, up * half);
    ctx.fillStyle = down >= 1 ? '#7dff9a' : '#4ad0ff';
    if (down > 0) ctx.fillRect(x, mid, w, down * half);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 4, mid - half - 1, w + 8, 3);
    ctx.fillRect(x - 4, mid + half - 1, w + 8, 3);
    ctx.fillRect(x, mid - 1, w, 2);
  }

  // Medidas del cuerpo en este fotograma (null si no se ve esa parte)
  measure(lm, t) {
    const vis = (i) => (lm[i].visibility ?? 1) > 0.5;
    const m = {};
    if (vis(L_SHOULDER) && vis(R_SHOULDER)) {
      // x en espejo: moverte a tu derecha = moverte a la derecha en pantalla
      m.x = 1 - (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2;
      m.sy = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2;
      m.sw = Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y);
    }
    if (vis(NOSE)) m.ny = lm[NOSE].y;
    if (vis(L_HIP) && vis(R_HIP)) m.hy = (lm[L_HIP].y + lm[R_HIP].y) / 2;
    // Para el salto cuentan los dos pies: el que esté más abajo
    if (vis(L_ANKLE) && vis(R_ANKLE)) m.ay = Math.max(lm[L_ANKLE].y, lm[R_ANKLE].y);
    if (m.sy != null && m.hy != null) m.torso = m.hy - m.sy;
    for (const k of Object.keys(m)) {
      // Lo horizontal se suaviza más (carriles estables); lo vertical casi sin retraso (saltos)
      this.filters[k] ??= k === 'x' || k === 'sw' ? new OneEuro(1.5, 4) : new OneEuro(4, 20);
      m[k] = this.filters[k].filter(m[k], t);
    }
    return m;
  }

  process(poses) {
    this.lastResult = performance.now();
    poses = poses || [];
    let lm = this.selectPlayer(poses);
    // Una cabeza aislada no sirve para controlar ni calibrar el cuerpo.
    if (lm && ![L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].every(i =>
      (lm[i].visibility ?? 1) > 0.5 && lm[i].x > 0.01 && lm[i].x < 0.99 && lm[i].y > 0.01 && lm[i].y < 0.99)) lm = null;
    this.draw(lm, poses);
    if (!lm) {
      this.missing++;
      this.prev = null;
      if (!this.base) this.samples = [];
      if (this.missing === LOST_FRAMES && !this.lost) {
        this.lost = true;
        this.h.onLost?.();
      }
      if (this.missing > FORGET_FRAMES) this.track = null;
      this.status(
        this.lost
          ? '⏸ Te perdí — vuelve al centro y quédate quieto'
          : poses.length ? 'Sigo buscándote…' : 'No te veo 👀 — ponte delante de la cámara',
      );
      return;
    }
    this.missing = 0;
    if (this.lost) {
      // Has vuelto: recalibramos por si ya no estás en el mismo sitio
      this.lost = false;
      this.recalibrate();
      this.h.onFound?.();
    }
    this.processPlayer(lm);
  }

  processPlayer(lm) {
    const visible = (i) => (lm[i].visibility ?? 1) > 0.5;
    const now = performance.now();
    this.checkHandsUp(lm, visible, now);
    const m = this.measure(lm, now / 1000);

    if (!this.base) {
      if (m.sy == null || m.hy == null || m.sw < 0.06 || m.torso < 0.08) {
        this.samples = [];
        this.status('Necesito ver tus hombros para calibrar');
        return;
      }
      this.calibrate(m);
      return;
    }

    const b = this.base;
    const T = b.torso;
    const sens = this.sensitivity;

    // --- Carril (absoluto respecto al punto calibrado, con histéresis) ---
    if (m.x != null) {
      const dx = (m.x - b.x) / b.sw; // + = a la derecha
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
    }

    // --- Salto: sube todo el cuerpo (cadera y hombros) y, si se ven, los dos pies ---
    const bodyRise = [];
    if (m.hy != null && b.hy != null) bodyRise.push((b.hy - m.hy) / T);
    if (m.sy != null) bodyRise.push((b.sy - m.sy) / T);
    let jump = bodyRise.length ? avg(bodyRise) : null;
    if (jump != null && m.ay != null && b.ay != null) jump = (jump + (b.ay - m.ay) / T) / 2;

    // --- Agacharse / hacerse bolita: baja la cabeza o los hombros, o se encoge el torso ---
    const duckCues = [];
    if (m.sy != null) duckCues.push((m.sy - b.sy) / T);
    if (m.ny != null && b.ny != null) duckCues.push(((m.ny - b.ny) / T) * 0.85);
    if (m.torso != null) duckCues.push((1 - m.torso / T) * 0.9);
    const duck = duckCues.length ? Math.max(...duckCues) : null;

    // Velocidad vertical del cuerpo (largos de torso por segundo, + = subiendo)
    let vUp = 0;
    if (jump != null) {
      if (this.prev && now > this.prev.t) vUp = ((jump - this.prev.jump) * 1000) / (now - this.prev.t);
      this.prev = { jump, t: now };
    }
    this.meter = { jump: Math.max(0, jump ?? 0), duck: Math.max(0, duck ?? 0) };

    if (jump != null && this.jumpArmed && !this.ducking) {
      const big = jump > JUMP_UP / sens;
      // La detección temprana por velocidad no vale justo al levantarse de agacharse
      const early = jump > JUMP_EARLY / sens && vUp > JUMP_SPEED && now - this.lastDuckEnd > 300;
      if (big || early) {
        this.jumpArmed = false;
        this.lastJump = now;
        this.h.onJump?.();
      }
    }
    if (jump != null && jump < JUMP_EARLY / 2) this.jumpArmed = true;

    // Agacharse: hay que mantenerlo 2 fotogramas (así el pequeño amago antes de
    // saltar no cuenta), salvo que sea muy profundo. Se ignora el aterrizaje.
    if (duck != null && now - this.lastJump > 500) {
      if (!this.ducking) {
        this.duckFrames = duck > DUCK_DOWN / sens ? this.duckFrames + 1 : 0;
        if (this.duckFrames >= 2 || duck > DUCK_DEEP / sens) {
          this.ducking = true;
          this.h.onDuck?.();
        }
      } else if (duck < DUCK_EXIT / sens) {
        this.ducking = false;
        this.h.onDuckEnd?.();
        this.duckFrames = 0;
        this.lastDuckEnd = now;
      } else {
        this.h.onDuckHold?.(); // sigues agachado: el corredor sigue rodando
      }
    }

    // Adaptación lenta por si te acercas/alejas un poco de la cámara
    if (!this.ducking && Math.abs(jump ?? 0) < 0.04 && Math.abs(duck ?? 0) < 0.08) {
      const k = 0.02;
      if (m.sy != null) b.sy += (m.sy - b.sy) * k;
      if (m.sw != null) b.sw += (m.sw - b.sw) * k;
      if (m.ny != null && b.ny != null) b.ny += (m.ny - b.ny) * k;
      if (m.hy != null && b.hy != null) b.hy += (m.hy - b.hy) * k;
      if (m.ay != null && b.ay != null) b.ay += (m.ay - b.ay) * k;
      if (m.torso != null) b.torso += (m.torso - b.torso) * k;
    }

    const laneName = ['izquierda', 'centro', 'derecha'][this.lane + 1];
    const feet = b.ay != null ? ' · pies ✓' : '';
    this.status(`✅ ${laneName}${this.ducking ? ' · agachado' : ''}${feet} · ${this.mode}`);
  }

  calibrate(m) {
    this.samples.push(m);
    if (this.samples.length > CALIB_FRAMES) this.samples.shift();

    const pick = (k) => this.samples.map((p) => p[k]).filter((v) => v != null);
    const mean = (k) => {
      const v = pick(k);
      // Solo se usa una parte del cuerpo si se ha visto en la mayoría de los fotogramas
      return v.length >= this.samples.length * 0.7 ? avg(v) : null;
    };
    const mx = avg(pick('x')), my = avg(pick('sy'));
    const sw = avg(pick('sw'));
    const spread = Math.max(...this.samples.filter((p) => p.x != null).map((p) => Math.hypot(p.x - mx, p.sy - my)));

    // Hay que estar quieto: si te mueves mucho, se reinicia la cuenta
    if (spread > 0.25 * sw) this.samples = [m];
    const pct = Math.round((this.samples.length / CALIB_FRAMES) * 100);
    this.status(`Calibrando… quédate quieto en el centro (${pct}%)`);

    if (this.samples.length >= CALIB_FRAMES) {
      const torso = mean('torso');
      this.base = {
        x: mx, sy: my, sw,
        ny: mean('ny'), hy: mean('hy'), ay: mean('ay'),
        torso: Math.max(torso ?? sw * 1.3, 0.05),
      };
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
