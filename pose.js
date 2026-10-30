import { armTargets } from './arm-tracking.js';
import { GestureDetector, GESTURE } from './gestures.js';
// Cámara, detector de esqueleto (MediaPipe Pose en un Web Worker) y elección del jugador.
// Las decisiones de gestos (carril, salto, agachado) viven en gestures.js.
// Si el navegador no permite el worker, se usa el hilo principal como respaldo.

const BASE = new URL('./vendor/mediapipe/', import.meta.url).href.replace(/\/$/, '');
const MODEL = kind => `${BASE}/models/pose_landmarker_${kind}.task`;

// Índices de los puntos del esqueleto de MediaPipe
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12],
];

const LOST_FRAMES = 12;    // ~1/3 s sin ver al jugador = lo hemos perdido (se pausa)
const FORGET_FRAMES = 60;  // ~2 s sin verlo: se elige de nuevo a la persona más cercana
const MAX_JUMP_AWAY = 2.5; // cuánto puede "saltar" el jugador entre fotogramas (en anchos de hombro)
const TIER_BUDGET_MS = 45; // por encima de esto (mediana) se prueba un nivel más liviano…
const TIER_SAMPLE = 30;    // …medido con esta cantidad de cuadros, y se queda solo si es más rápido

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// Filtro "One Euro" para los brazos del muñeco: quita el temblor quieto y casi no retrasa en movimiento.
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
    this.h = handlers;
    this.g = new GestureDetector(handlers, { sensitivity });
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.busy = false;
    this.lastVideoTime = -1;
    this.track = null;   // posición y tamaño del jugador, para no confundirlo con otros
    this.missing = 0;
    this.lost = false;
    this.stats = { ms: 0, count: 0, fps: 0, latency: 0, last: 0 };
    this.tier = 0;
    this.switching = false;
    this.tierMs = [];      // tiempos de inferencia del nivel actual
    this.trial = null;     // prueba en curso de un nivel más liviano: { from, fromMs }
    this.triedAt = 0;      // cuándo terminó la última prueba (no se repite enseguida)
    this.recalibrate();
  }

  get sensitivity() { return this.g.sensitivity; }
  set sensitivity(value) { this.g.sensitivity = value; }
  get base() { return this.g.base; }

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
        // 30 fps estables rinden más que 60 fps pedidos: el modelo no llega a procesarlos y la cámara
        // baja la exposición (menos luz = más borroso) cuando se le piden demasiados.
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 60 }, facingMode: 'user' }, audio: false,
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
      }, 60000);   // en equipos lentos la primera carga del modelo con GPU puede pasar los 30 s
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(e.message || 'error en el worker'));
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          clearTimeout(timer);
          this.worker = worker;
          this.tier = data.tier ?? 0;
          this.mode = `worker ${data.delegate} ${data.kind}`;
          worker.onmessage = ({ data: d }) => {
            if (d.type === 'tier') {
              // Otro nivel cargado: se mide desde cero.
              this.tier = d.tier; this.mode = `worker ${d.delegate} ${d.kind}`;
              this.switching = false; this.tierMs = [];
              return;
            }
            if (d.type !== 'result') return;
            this.busy = false;
            this.process(d.poses, d.ms);
          };
          resolve();
        } else if (data.type === 'error') {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(data.message));
        }
      };
      worker.postMessage({ type: 'init', tier: 0 });
    });
  }

  async startMainThread() {
    const { FilesetResolver, PoseLandmarker } = await import(`${BASE}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const options = (kind, delegate) => ({
      baseOptions: { modelAssetPath: MODEL(kind), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
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
      this.video.requestVideoFrameCallback((now, meta) => this.onFrame(meta));
    } else {
      requestAnimationFrame(() => this.onFrame());
    }
  }

  async onFrame(meta) {
    const t = this.video.currentTime;
    if (t !== this.lastVideoTime && !this.busy && this.video.readyState >= 2) {
      this.lastVideoTime = t;
      const ts = performance.now();
      this.captureTime = meta?.captureTime ?? meta?.expectedDisplayTime ?? ts;
      if (this.worker) {
        this.busy = true;
        try {
          // El modelo trabaja a 256 px: no hace falta mandarle los 640×480 completos.
          const bitmap = await createImageBitmap(this.video, { resizeWidth: 384, resizeHeight: 288, resizeQuality: 'low' });
          this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
        } catch {
          this.busy = false;
        }
      } else {
        const result = this.landmarker.detectForVideo(this.video, ts);
        this.process(result.landmarks, performance.now() - ts);
      }
    }
    this.scheduleFrame();
  }

  recalibrate() {
    this.h.onArms?.(null);
    this.h.onCalibrating?.();
    this.g.reset();
    this.armFilters = {};
  }

  // De todas las personas detectadas, elige al jugador: la que sigue donde estaba
  // el jugador en el fotograma anterior. Si aún no hay jugador, la más grande
  // (la más cercana a la cámara) cerca del centro. Los demás se ignoran.
  selectPlayer(poses) {
    const cands = [];
    for (const lm of poses) {
      // Los puntos fuera del cuadro (caderas en una sentadilla honda) no sirven para reconocer a nadie.
      const v = (i) => (lm[i].visibility ?? 1) > 0.5 && lm[i].y > 0.003 && lm[i].y < 0.997;
      const pts = [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].filter(v);
      if (pts.length < 2) continue;
      const size = v(L_SHOULDER) && v(R_SHOULDER)
        ? Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y)
        : this.track?.size;
      if (!size) continue;
      const torsoLen = v(L_HIP) && v(R_HIP) && v(L_SHOULDER) && v(R_SHOULDER)
        ? Math.abs((lm[L_HIP].y + lm[R_HIP].y) / 2 - (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2) : 0;
      cands.push({ lm, size, ratio: torsoLen > 0.03 ? size / torsoLen : null, cx: avg(pts.map((i) => lm[i].x)), cy: avg(pts.map((i) => lm[i].y)) });
    }
    if (!cands.length) return null;

    let best;
    const t = this.track;
    if (t) {
      // Además de dónde está y qué tamaño tiene, se compara la forma del cuerpo (hombros / torso): dos personas
      // a distancias parecidas casi nunca tienen la misma proporción.
      const id = this.g.identity?.ratio;
      const score = (c) => Math.hypot(c.cx - t.cx, c.cy - t.cy) / t.size + Math.abs(Math.log(c.size / t.size)) * 2
        + (id && c.ratio ? Math.abs(Math.log(c.ratio / id)) * 1.5 : 0);
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
    if (!this.g.base) return;
    // Medidor: hacia arriba = salto, hacia abajo = agacharse. La raya blanca es el umbral.
    // (El canvas se ve en espejo, así que x = W - 30 aparece a la izquierda.)
    const x = W - 34, mid = H / 2, half = 110, w = 22;
    const up = Math.min(1.3, this.g.meter.jump / (GESTURE.JUMP_UP / this.sensitivity));
    const down = Math.min(1.3, this.g.meter.duck / (GESTURE.DUCK_DOWN / this.sensitivity));
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

  // Los brazos del muñeco usan los puntos filtrados (One Euro): sin temblor cuando estás quieto
  // y casi sin retraso cuando mueves los brazos rápido.
  smoothArms(lm, t) {
    const out = lm.map(point => ({ x: point.x, y: point.y, visibility: point.visibility }));
    for (let i = 11; i <= 24; i++) {
      const point = out[i];
      if ((point.visibility ?? 1) < 0.4) continue;
      const fx = (this.armFilters[`x${i}`] ??= new OneEuro(1.6, 14, 2));
      const fy = (this.armFilters[`y${i}`] ??= new OneEuro(1.6, 14, 2));
      point.x = fx.filter(point.x, t);
      point.y = fy.filter(point.y, t);
    }
    return out;
  }

  // Mide fps de resultados, tiempo de inferencia y retraso cámara→resultado. Si la inferencia es lenta
  // prueba el siguiente nivel (completo GPU → ligero GPU → ligero CPU) y SOLO se queda con él si en esta
  // máquina resulta más rápido; si no, vuelve al anterior. (Bajar a ciegas llevaba a la CPU a 2–3 fps
  // en equipos donde la GPU, aun ocupada con el juego, era más rápida.)
  trackStats(ms) {
    const now = performance.now(), s = this.stats;
    if (s.last) s.fps += (1000 / Math.max(1, now - s.last) - s.fps) * 0.15;
    s.last = now;
    if (ms != null) s.ms = s.count ? s.ms + (ms - s.ms) * 0.1 : ms;
    s.count++;
    if (this.captureTime) s.latency += (now - this.captureTime - s.latency) * 0.15;
    if (!this.worker || this.switching || ms == null) return;
    this.tierMs.push(ms);
    if (this.tierMs.length < TIER_SAMPLE) return;
    const sorted = [...this.tierMs].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
    this.tierMs = [];
    // El worker carga el otro nivel en segundo plano y sigue analizando con el actual: no se frena el juego.
    const go = tier => { this.switching = true; this.worker.postMessage({ type: 'tier', tier }); };
    if (this.trial) {
      const { from, fromMs } = this.trial;
      this.trial = null;
      this.triedAt = now;
      if (med < fromMs * 0.85) {
        // El más liviano rinde mejor aquí. Si todavía no alcanza, se prueba el siguiente.
        if (med > TIER_BUDGET_MS && this.tier < 2) { this.trial = { from: this.tier, fromMs: med }; go(this.tier + 1); }
      } else {
        go(from);
      }
      return;
    }
    // Una prueba cada tanto: la carga del equipo cambia (por ejemplo, cuando empieza la partida).
    if (med > TIER_BUDGET_MS && this.tier < 2 && now - this.triedAt > 60000) {
      this.trial = { from: this.tier, fromMs: med };
      go(this.tier + 1);
    } else if (med > TIER_BUDGET_MS * 1.6 && this.tier > 0 && now - this.triedAt > 60000) {
      // Muy lento incluso en el nivel liviano: quizás el anterior rinde mejor ahora.
      this.trial = { from: this.tier, fromMs: med };
      this.triedAt = now;
      go(this.tier - 1);
    }
  }

  process(poses, ms) {
    this.lastResult = performance.now();
    this.trackStats(ms);
    poses = poses || [];
    let lm = this.selectPlayer(poses);
    // Una cabeza aislada no sirve para controlar ni calibrar el cuerpo.
    // Ya calibrado, alcanza con ver los hombros: al llegar a un borde de la pantalla o al agacharse las
    // caderas pueden quedar fuera de cuadro y el carril se sigue leyendo igual.
    // (en los extremos laterales o con los hombros bajados, es decir agachado; de pie en el centro,
    // unas caderas que no se ven = detección parcial).
    const atSide = lm && (() => { const cx = (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2; return cx < 0.14 || cx > 0.86; })();
    const lowered = lm && this.base && ((lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2 - this.base.sy) / this.base.torso > GESTURE.DUCK_LOWERED;
    const required = this.base && (atSide || lowered) ? [L_SHOULDER, R_SHOULDER] : [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP];
    const inFrame = i => (lm[i].visibility ?? 1) > 0.5 && lm[i].x > 0.003 && lm[i].x < 0.997 && lm[i].y > 0.003 && lm[i].y < 0.997;
    // Sin calibrar, con los hombros a la vista pero sin caderas: suele ser alguien alto o muy cerca de la cámara.
    const tooClose = lm && !this.base && inFrame(L_SHOULDER) && inFrame(R_SHOULDER) && !(inFrame(L_HIP) && inFrame(R_HIP));
    if (lm && !required.every(inFrame)) lm = null;
    this.draw(lm, poses);
    if (!lm) {
      this.h.onArms?.(null);
      this.missing++;
      this.g.hist = [];
      if (!this.base) this.g.samples = [];
      if (this.missing === LOST_FRAMES && !this.lost) {
        this.lost = true;
        this.h.onLost?.();
      }
      if (this.missing > FORGET_FRAMES) this.track = null;
      this.status(
        this.lost
          ? '⏸ Te perdí — vuelve al centro y quédate quieto'
          : tooClose ? 'Aléjate un paso de la cámara: tienen que verse tus caderas'
          : poses.length ? 'Sigo buscándote…' : 'No te veo 👀 — ponte delante de la cámara',
      );
      return;
    }
    this.missing = 0;
    if (this.lost) {
      this.lost = false;
      this.h.onFound?.();
      if (this.g.resumeIfSame(lm)) {
        // Mismo jugador, mismo sitio: se sigue con la calibración que ya tenía (no se pide quedarse quieto)
        this.h.onCalibrated?.();
      } else {
        this.recalibrate();
      }
    }
    this.processPlayer(lm);
  }

  processPlayer(lm) {
    const now = performance.now();
    if (!this.g.update(lm, now, this.stats.fps)) { this.status(this.g.hint); return; }
    this.h.onArms?.(armTargets(this.smoothArms(lm, now / 1000), (this.video.videoWidth || 640) / (this.video.videoHeight || 480)));
    const laneName = ['izquierda', 'centro', 'derecha'][this.g.lane + 1];
    const feet = this.base.ay != null ? ' · pies ✓' : '';
    const { fps, ms, latency } = this.stats;
    const dim = fps && fps < 22 && ms < 25 ? ' · poca luz: la cámara va lenta' : '';
    this.status(`✅ ${laneName}${this.g.ducking ? ' · agachado' : ''}${feet} · ${this.mode} · ${Math.round(fps)} fps · ${Math.round(ms)} ms${latency > 0 && latency < 400 ? ` · ${Math.round(latency)} ms de retraso` : ''}${dim}`);
  }
}
