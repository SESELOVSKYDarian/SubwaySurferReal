import { armTargets } from './arm-tracking.js';
// Detección del esqueleto con MediaPipe Pose y traducción a gestos del juego.
// La red neuronal corre en un Web Worker (pose-worker.js); si el navegador no lo
// permite, se usa el hilo principal como respaldo.

const BASE = new URL('./vendor/mediapipe/', import.meta.url).href.replace(/\/$/, '');
const MODEL = kind => `${BASE}/models/pose_landmarker_${kind}.task`;

// Índices de los puntos del esqueleto de MediaPipe
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24;
const L_ANKLE = 27, R_ANKLE = 28;
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12],
];

// Umbrales (en unidades relativas al cuerpo, así no dependen de la distancia a la cámara).
// Los de salto y agacharse se dividen por la sensibilidad elegida en el menú.
const LANE_ENTER = 0.52;   // anchos de hombro desplazado para cambiar de carril
const LANE_EXIT = 0.35;    // histéresis para volver al centro
// Un salto real sube unos 15–40 cm (0,3–0,8 torsos); trotar en el lugar o respirar mueve ~5 cm.
const JUMP_UP = 0.14;      // subida del cuerpo (en largos de torso) para saltar
const JUMP_EARLY = 0.07;   // ...o una subida menor pero rápida
const JUMP_SPEED = 1.1;    // largos de torso por segundo
const JUMP_FRAMES = 2;     // fotogramas seguidos por encima del umbral (un solo cuadro con ruido no salta)
const SLOW_FPS = 18;       // con menos resultados por segundo un salto dura 1–2 cuadros: alcanza con uno alto
const DUCK_DOWN = 0.27;    // bajada/encogimiento para agacharse ("hacerse bolita")
const LOW_RISE = 0.08;     // cuerpo por debajo de la altura de reposo (largos de torso)
const FROM_LOW_MS = 600;   // tras estar abajo, este tiempo sin salto por velocidad y con umbral más alto
const DUCK_DEEP = 0.5;     // tan agachado que no hace falta confirmar
const DUCK_EXIT = 0.16;    // por debajo de esto se considera que te levantaste
const DUCK_LOWERED = 0.15; // hombros así de bajos: agachándose, las caderas pueden salir de cuadro
const DUCK_MAX_MS = 2500;  // agachado más tiempo que esto y quieto = quedó parado más abajo, no esquivando
const DUCK_STILL_MS = 800; // tiempo sin subir ni bajar para dar por buena una postura nueva
const CALIB_FRAMES = 20;   // frames quieto necesarios para calibrar
const LOST_FRAMES = 12;    // ~1/3 s sin ver al jugador = lo hemos perdido (se pausa)
const FORGET_FRAMES = 60;  // ~2 s sin verlo: se elige de nuevo a la persona más cercana
const MAX_JUMP_AWAY = 2.5;
const SLOW_MS = 34;        // inferencia más lenta que esto (media) = bajar al siguiente modelo
const CALIB_MS = 700;      // tiempo quieto necesario para calibrar
const CALIB_MIN = 4;       // cuadros mínimos dentro de ese tiempo (cámaras lentas de 5 fps)
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }; // cuánto puede "saltar" el jugador entre fotogramas (en anchos de hombro)

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
    this.stats = { ms: 0, count: 0, fps: 0, latency: 0, last: 0 };
    this.box = null;       // caja del jugador (relativa al cuadro): de ahí sale el recorte
    this.cropMiss = 0;     // cuadros seguidos sin ver al jugador dentro del recorte
    this.tier = 0;
    this.switching = false;
    this.trackReady = false; // el detector de recorte se carga después del de búsqueda
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
          this.mode = `worker ${data.delegate}`;
          worker.onmessage = ({ data: d }) => {
            if (d.type === 'track') { this.trackReady = true; return; }
            if (d.type === 'tier') {
              // Modelo más ligero cargado: se reanuda con medias limpias.
              this.trackReady = false;
              this.tier = d.tier; this.mode = `worker ${d.delegate} ${d.kind}`;
              this.switching = false; this.busy = false; this.stats.ms = 0; this.stats.count = 0;
              return;
            }
            if (d.type !== 'result') return;
            this.busy = false;
            this.process(d.poses, d.ms, d.crop);
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
          const crop = this.cropForPlayer();
          const bitmap = crop
            ? await createImageBitmap(this.video, crop.x, crop.y, crop.w, crop.h, { resizeWidth: crop.outW, resizeHeight: crop.outH, resizeQuality: 'low' })
            : await createImageBitmap(this.video, { resizeWidth: 384, resizeHeight: 288, resizeQuality: 'low' });
          this.worker.postMessage({ type: 'frame', bitmap, ts, crop }, [bitmap]);
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
    if (this.ducking) this.h.onDuckEnd?.();
    this.base = null;
    this.samples = [];
    this.lane = 0;
    this.jumpArmed = true;
    this.ducking = false;
    this.duckFrames = 0;
    this.jumpFrames = 0;
    this.lastLow = 0;
    this.still = null;
    this.rebased = null;
    this.handsUpSince = 0;
    this.lastHandsUp = 0;
    this.lastJump = 0;
    this.lastDuckEnd = 0;
    this.prev = null;
    this.prevX = null;
    this.sideSpeed = null;
    this.meter = { jump: 0, duck: 0 };
    this.filters = {};
    this.armFilters = {};
    this.identity = null;
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
      const id = this.identity?.ratio;
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

  // Medidas del cuerpo en este fotograma (null si no se ve esa parte)
  measure(lm, t) {
    // Un punto fuera del cuadro (caderas al agacharse, pies al acercarse) es una estimación: no se usa.
    const vis = (i) => (lm[i].visibility ?? 1) > 0.5 && lm[i].y > 0.003 && lm[i].y < 0.997;
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
      this.filters[k] ??= k === 'x' || k === 'sw' ? new OneEuro(2.4, 9) : new OneEuro(4, 22);
      m[k] = this.filters[k].filter(m[k], t);
    }
    return m;
  }

  // Mide fps de resultados, tiempo de inferencia y retraso cámara→resultado, y si la máquina
  // no llega a ~30 fps baja a un modelo más ligero (completo GPU → ligero GPU → ligero CPU).
  track_stats(ms) {
    const now = performance.now(), s = this.stats;
    if (s.last) s.fps += (1000 / Math.max(1, now - s.last) - s.fps) * 0.15;
    s.last = now;
    if (ms != null) s.ms = s.count ? s.ms + (ms - s.ms) * 0.1 : ms;
    s.count++;
    if (this.captureTime) s.latency += (now - this.captureTime - s.latency) * 0.15;
    if (this.worker && !this.switching && this.tier < 2 && s.count > 45 && s.ms > SLOW_MS) {
      this.switching = true; this.busy = true;
      this.worker.postMessage({ type: 'tier', tier: this.tier + 1 });
    }
  }

  // Recorte cuadrado alrededor del jugador (con margen para saltos y agachadas). Solo hay
  // recorte cuando ya está fijado quién es el jugador; si se pierde, se vuelve a buscar en
  // el cuadro completo.
  cropForPlayer() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!this.trackReady || !this.track || !this.box || this.cropMiss >= 3 || !vw || !vh) return null;
    const { x0, y0, x1, y1 } = this.box;
    // Recorte ajustado al cuerpo: estrecho a los costados (así quien pasa por detrás queda fuera) y con
    // margen para brazos, saltos y agachadas.
    // El jugador recorre todo el ancho de la pantalla: el recorte se adelanta según la velocidad con que se
    // mueve (el resultado llega ~2 cuadros tarde) y se ensancha cuanto más rápido va.
    const { vx = 0, vy = 0 } = this.boxVelocity || {};
    const w = Math.round(Math.min(vw, Math.max(0.34 * vw, (x1 - x0) * vw * 1.5 + 0.06 * vw + Math.abs(vx) * vw * 6)));
    const h = Math.round(Math.min(vh, Math.max(0.5 * vh, (y1 - y0) * vh * 1.25 + Math.abs(vy) * vh * 6)));
    const x = Math.round(Math.max(0, Math.min(vw - w, ((x0 + x1) / 2 + vx * 2.5) * vw - w / 2)));
    const y = Math.round(Math.max(0, Math.min(vh - h, ((y0 + y1) / 2 + vy * 2.5) * vh - h / 2)));
    const scale = 288 / Math.max(w, h);
    return { x, y, w, h, vw, vh, outW: Math.round(w * scale), outH: Math.round(h * scale) };
  }

  // La caja del jugador crece al instante y se encoge despacio (así un salto no se sale del recorte).
  updateBox(lm) {
    const pts = lm.filter(p => (p.visibility ?? 1) > 0.4);
    if (pts.length < 4) return;
    const next = {
      x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
      y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)),
    };
    // Velocidad del centro de la caja (fracción del cuadro por resultado), suavizada.
    const cx = (next.x0 + next.x1) / 2, cy = (next.y0 + next.y1) / 2;
    if (this.lastBoxCenter) {
      const v = this.boxVelocity ??= { vx: 0, vy: 0 };
      v.vx += ((cx - this.lastBoxCenter.cx) - v.vx) * 0.6;
      v.vy += ((cy - this.lastBoxCenter.cy) - v.vy) * 0.6;
    }
    this.lastBoxCenter = { cx, cy };
    const b = this.box;
    if (!b) { this.box = next; return; }
    const k = 0.25;
    b.x0 = next.x0 < b.x0 ? next.x0 : b.x0 + (next.x0 - b.x0) * k;
    b.y0 = next.y0 < b.y0 ? next.y0 : b.y0 + (next.y0 - b.y0) * k;
    b.x1 = next.x1 > b.x1 ? next.x1 : b.x1 + (next.x1 - b.x1) * k;
    b.y1 = next.y1 > b.y1 ? next.y1 : b.y1 + (next.y1 - b.y1) * k;
  }

  // ¿Quien volvió a cuadro es el mismo jugador ya calibrado? (mismo tamaño y lugar aproximados)
  matchesBase(lm) {
    const b = this.base;
    if (!b || !lm) return false;
    const sw = Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y);
    const x = 1 - (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2;
    return Math.abs(Math.log(sw / b.sw)) < 0.3 && Math.abs(x - b.x) / b.sw < 1.6;
  }

  process(poses, ms, crop) {
    this.lastResult = performance.now();
    this.track_stats(ms);
    poses = poses || [];
    if (crop) {
      // Los puntos vienen relativos al recorte: se llevan al cuadro completo.
      poses = poses.map(pose => pose.map(p => ({ ...p, x: (crop.x + p.x * crop.w) / crop.vw, y: (crop.y + p.y * crop.h) / crop.vh })));
    }
    let lm = this.selectPlayer(poses);
    // Una cabeza aislada no sirve para controlar ni calibrar el cuerpo.
    // Ya calibrado, alcanza con ver los hombros: al llegar a un borde de la pantalla o al agacharse las
    // caderas pueden quedar fuera de cuadro y el carril se sigue leyendo igual.
    // (en los extremos laterales o con los hombros bajados, es decir agachado; de pie en el centro,
    // unas caderas que no se ven = detección parcial).
    const atSide = lm && (() => { const cx = (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2; return cx < 0.14 || cx > 0.86; })();
    const lowered = lm && this.base && ((lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2 - this.base.sy) / this.base.torso > DUCK_LOWERED;
    const required = this.base && (atSide || lowered) ? [L_SHOULDER, R_SHOULDER] : [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP];
    const inFrame = i => (lm[i].visibility ?? 1) > 0.5 && lm[i].x > 0.003 && lm[i].x < 0.997 && lm[i].y > 0.003 && lm[i].y < 0.997;
    // Sin calibrar, con los hombros a la vista pero sin caderas: suele ser alguien alto o muy cerca de la cámara.
    const tooClose = lm && !this.base && inFrame(L_SHOULDER) && inFrame(R_SHOULDER) && !(inFrame(L_HIP) && inFrame(R_HIP));
    if (lm && !required.every(inFrame)) lm = null;
    this.draw(lm, poses);
    if (crop) this.cropMiss = lm ? 0 : this.cropMiss + 1; else if (lm) this.cropMiss = 0;
    if (lm) this.updateBox(lm);
    if (!lm) {
      this.h.onArms?.(null);
      this.missing++;
      this.prev = null;
      if (!this.base) this.samples = [];
      if (this.missing === LOST_FRAMES && !this.lost) {
        this.lost = true;
        this.h.onLost?.();
      }
      if (this.missing > FORGET_FRAMES) { this.track = null; this.box = null; this.lastBoxCenter = this.boxVelocity = null; }
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
      if (this.matchesBase(lm)) {
        // Mismo jugador, mismo sitio: se sigue con la calibración que ya tenía (no se pide quedarse quieto)
        this.prev = null; this.jumpArmed = true; this.ducking = false;
        this.h.onCalibrated?.();
      } else {
        this.recalibrate();
      }
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
      // Guía para encuadrarse bien antes de contar el tiempo quieto
      // (0,075: un chico a unos 2,5 m todavía entra; más chico que eso, el detector pierde precisión)
      if (m.sw < 0.075) { this.samples = []; this.status('Acércate un poco a la cámara'); return; }
      if (m.sw > 0.42) { this.samples = []; this.status('Aléjate un poco: tienen que verse tus caderas'); return; }
      if (Math.abs(m.x - 0.5) > 0.22) { this.samples = []; this.status(m.x < 0.5 ? 'Muévete un poco a tu izquierda: al centro' : 'Muévete un poco a tu derecha: al centro'); return; }
      this.calibrate(m);
      return;
    }

    this.h.onArms?.(armTargets(this.smoothArms(lm, now / 1000), (this.video.videoWidth || 640) / (this.video.videoHeight || 480)));
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

    // --- Salto: sube todo el cuerpo a la vez ---
    // Encoger o levantar los brazos sube solo los hombros; trotar en el lugar no despega los pies.
    // Por eso cuenta la menor subida entre cadera y hombros y, si se ven los pies, la mediana con
    // ellos: tienen que subir al menos dos de las tres partes.
    const rises = [];
    if (m.hy != null && b.hy != null) rises.push((b.hy - m.hy) / T);
    if (m.sy != null) rises.push((b.sy - m.sy) / T);
    let jump = rises.length ? Math.min(...rises) : null;
    if (jump != null && m.ay != null && b.ay != null) jump = median([...rises, (b.ay - m.ay) / T]);

    // --- Agacharse / hacerse bolita: baja la cabeza o los hombros, o se encoge el torso ---
    const duckCues = [];
    const shoulderDrop = m.sy != null ? (m.sy - b.sy) / T : null;
    if (shoulderDrop != null) duckCues.push(shoulderDrop);
    // Bajar solo la cabeza (mirar la pantalla) no es agacharse: la nariz ayuda si los hombros
    // también empezaron a bajar.
    if (m.ny != null && b.ny != null && (shoulderDrop == null || shoulderDrop > 0.08)) duckCues.push(((m.ny - b.ny) / T) * 0.85);
    if (m.torso != null) duckCues.push((1 - m.torso / T) * 0.9);
    // Inclinarse hacia la cámara ("hacerse bolita"): los hombros se ven más anchos pero el torso más
    // corto. Acercarse caminando agranda las dos medidas por igual y no cuenta.
    const size = m.sw != null ? m.sw / b.sw : 1;
    const torsoRel = m.torso != null ? m.torso / T / size : null;
    const leaning = size > 1.06 && torsoRel != null && torsoRel < 0.88;
    if (leaning) duckCues.push((1 - torsoRel) * 1.5);
    const duck = duckCues.length ? Math.max(...duckCues) : null;

    // Velocidad vertical del cuerpo (largos de torso por segundo, + = subiendo)
    let vUp = 0;
    if (jump != null) {
      if (this.prev && now > this.prev.t) vUp = ((jump - this.prev.jump) * 1000) / (now - this.prev.t);
      this.prev = { jump, t: now };
    }
    this.meter = { jump: Math.max(0, jump ?? 0), duck: Math.max(0, duck ?? 0) };

    // Velocidad lateral (anchos de hombro por segundo): al cruzar la pantalla rápido el cuerpo se inclina y los
    // puntos suben y bajan un poco; eso no es un salto, así que en pleno desplazamiento se pide más altura.
    let sideSpeed = 0;
    if (m.x != null) {
      if (this.prevX && now > this.prevX.t) sideSpeed = Math.abs(((m.x - this.prevX.x) * 1000) / (now - this.prevX.t)) / b.sw;
      this.prevX = { x: m.x, t: now };
    }
    this.sideSpeed = this.sideSpeed == null ? sideSpeed : this.sideSpeed + (sideSpeed - this.sideSpeed) * 0.4;
    const sliding = this.sideSpeed > 3.5;

    // ¿Venía de abajo? Al levantarse de una agachada (aunque no haya llegado a contar como agachado)
    // el cuerpo sube rápido y pasa la altura de reposo: eso no es un salto.
    if ((jump != null && jump < -LOW_RISE) || (duck != null && duck > (DUCK_DOWN / sens) * 0.5)) this.lastLow = now;
    const fromLow = now - this.lastLow < FROM_LOW_MS;
    // Si se ven los pies, en un salto tienen que despegar del piso; al levantarse de agachado no se mueven.
    const feetRise = m.ay != null && b.ay != null ? (b.ay - m.ay) / T : null;

    if (jump != null && this.jumpArmed && !this.ducking) {
      const up = (JUMP_UP / sens) * (sliding ? 1.7 : 1) * (fromLow ? 1.4 : 1);
      // Al levantarse de agacharse el cuerpo pasa rápido por la altura de reposo: no es un salto.
      const feetOff = feetRise == null || feetRise > up * 0.5;
      const settled = now - this.lastDuckEnd > 350 && feetOff;
      const early = !sliding && !fromLow && jump > JUMP_EARLY / sens && vUp > JUMP_SPEED;
      this.jumpFrames = settled && !leaning && (jump > up || early) ? this.jumpFrames + 1 : 0;
      // Dos fotogramas seguidos. Con la cámara lenta un salto puede durar uno solo: se acepta si sube
      // bastante más que el umbral (un cuadro con error del detector no llega).
      const slow = this.stats.fps && this.stats.fps < SLOW_FPS;
      if (this.jumpFrames >= JUMP_FRAMES || (settled && !leaning && jump > up * (slow ? 1.3 : 2))) {
        this.jumpArmed = false;
        this.jumpFrames = 0;
        this.lastJump = now;
        this.h.onJump?.();
      }
    }
    // Para el próximo salto hay que volver al piso. Si después de aterrizar quedó un poco más arriba
    // o más abajo que al calibrar, alcanza con haber bajado de la mitad del umbral.
    if (jump != null && (jump < JUMP_EARLY / 2 || (now - this.lastJump > 700 && jump < (JUMP_UP / sens) * 0.5))) this.jumpArmed = true;

    // ¿Cuánto hace que el cuerpo no sube ni baja? (para reconocer una postura nueva que ya no cambia)
    if (m.sy != null && (!this.still || Math.abs(m.sy - this.still.sy) > 0.06 * T)) this.still = { sy: m.sy, t: now };
    const stillFor = this.still ? now - this.still.t : 0;

    // Agacharse: hay que mantenerlo 2 fotogramas (así el pequeño amago antes de
    // saltar no cuenta), salvo que sea muy profundo. Se ignora el aterrizaje.
    if (duck != null && now - this.lastJump > 400) {
      if (!this.ducking) {
        this.duckFrames = duck > DUCK_DOWN / sens ? this.duckFrames + 1 : 0;
        if (this.duckFrames >= 2 || duck > DUCK_DEEP / sens) {
          this.ducking = true;
          this.duckStart = now;
          this.duckPeak = duck;
          this.h.onDuck?.();
        }
      } else {
        // Para levantarse cuentan los hombros y el torso, no la nariz: al pararse es común seguir
        // con la cabeza gacha mirando la pantalla. La salida es relativa a lo profundo que bajó:
        // tras una sentadilla honda, volver a menos de la mitad ya es estar de pie.
        this.duckPeak = Math.max(this.duckPeak, duck);
        const body = [];
        if (m.sy != null) body.push((m.sy - b.sy) / T);
        if (m.torso != null) body.push((1 - m.torso / T) * 0.9);
        if (leaning) body.push((1 - torsoRel) * 1.5);
        const stand = body.length ? Math.max(...body) : duck;
        const exitAt = Math.min(DUCK_DOWN * 0.8, Math.max(DUCK_EXIT, this.duckPeak * 0.45)) / sens;
        // Nadie esquiva agachado tanto tiempo: si la postura lleva un rato sin cambiar, el jugador quedó
        // parado más abajo que al calibrar (se acercó o se movió). Esa postura pasa a ser la de referencia.
        const stuck = now - this.duckStart > DUCK_MAX_MS && stillFor > DUCK_STILL_MS;
        if (stand < exitAt || stuck) {
          this.ducking = false;
          this.h.onDuckEnd?.();
          this.duckFrames = 0;
          this.lastDuckEnd = now;
          if (stuck) this.rebaseVertical(m, now);
        } else {
          this.h.onDuckHold?.(); // sigues agachado: el corredor sigue rodando
        }
      }
    }

    // Tras corregir la referencia agachado: si después se para y queda quieto en otra altura,
    // esa es la postura de pie real. Mientras tanto no hay saltos (subir de la sentadilla no lo es).
    if (this.rebased) {
      this.jumpArmed = false;
      const moved = m.sy != null && Math.abs(m.sy - this.rebased.sy) > 0.15 * T;
      if (!this.ducking && stillFor > DUCK_STILL_MS && (moved || now - this.rebased.t > 2000)) {
        if (moved) this.rebaseVertical(m, now);
        this.rebased = null;
        this.jumpArmed = true;
      }
    }

    // Adaptación lenta por si te acercas/alejas un poco de la cámara. También si quedaste quieto un rato
    // a otra altura (cambiaste la postura de pie): esa pasa a ser la referencia y el salto sigue igual.
    const settledHere = !this.rebased && stillFor > 1500 && Math.abs(jump ?? 0) < (JUMP_UP / sens) * 0.6 && Math.abs(duck ?? 0) < (DUCK_DOWN / sens) * 0.6;
    if (!this.ducking && ((Math.abs(jump ?? 0) < 0.04 && Math.abs(duck ?? 0) < 0.08) || settledHere)) {
      const k = settledHere ? 0.06 : 0.02;
      if (m.sy != null) b.sy += (m.sy - b.sy) * k;
      if (m.sw != null) b.sw += (m.sw - b.sw) * k;
      if (m.ny != null && b.ny != null) b.ny += (m.ny - b.ny) * k;
      if (m.hy != null && b.hy != null) b.hy += (m.hy - b.hy) * k;
      if (m.ay != null && b.ay != null) b.ay += (m.ay - b.ay) * k;
      if (m.torso != null) b.torso += (m.torso - b.torso) * k;
    }

    const laneName = ['izquierda', 'centro', 'derecha'][this.lane + 1];
    const feet = b.ay != null ? ' · pies ✓' : '';
    const { fps, ms, latency } = this.stats;
    const dim = fps && fps < 22 && ms < 25 ? ' · poca luz: la cámara va lenta' : '';
    this.status(`✅ ${laneName}${this.ducking ? ' · agachado' : ''}${feet} · ${this.mode} · ${Math.round(fps)} fps · ${Math.round(ms)} ms${latency > 0 && latency < 400 ? ` · ${Math.round(latency)} ms de retraso` : ''}${dim}`);
  }

  // Toma la postura actual como referencia de altura (hombros, nariz, cadera y pies), sin pedir
  // quedarse quieto ni pausar: el carril y el tamaño calibrados se conservan.
  rebaseVertical(m, now) {
    const b = this.base;
    if (m.sy != null) b.sy = m.sy;
    if (m.ny != null) b.ny = m.ny;
    if (m.hy != null) b.hy = m.hy;
    if (m.ay != null) b.ay = m.ay;
    if (m.torso != null) b.torso = Math.max(m.torso, 0.05);
    this.prev = null;
    this.jumpFrames = 0;
    this.rebased = { sy: m.sy ?? b.sy, t: now };
  }

  calibrate(m) {
    const now = performance.now();
    this.samples.push({ ...m, t: now });
    // Ventana de ~1,2 s: la calibración dura lo mismo con cualquier fps de cámara
    while (this.samples.length > 2 && now - this.samples[0].t > 1200) this.samples.shift();

    const pick = (k) => this.samples.map((p) => p[k]).filter((v) => v != null);
    const mean = (k) => {
      const v = pick(k);
      // Solo se usa una parte del cuerpo si se ha visto en la mayoría de los fotogramas
      return v.length >= this.samples.length * 0.7 ? median(v) : null;
    };
    const mx = median(pick('x')), my = median(pick('sy'));
    const sw = median(pick('sw'));
    const spread = Math.max(...this.samples.filter((p) => p.x != null).map((p) => Math.hypot(p.x - mx, p.sy - my)));

    // Hay que estar quieto: si te mueves mucho, se reinicia la cuenta
    if (spread > 0.25 * sw) this.samples = [{ ...m, t: now }];
    const span = now - this.samples[0].t;
    // El porcentaje muestra lo mismo que decide: tiempo quieto y cantidad mínima de cuadros.
    const n = this.samples.length;
    const pct = Math.min(100, Math.round(Math.max(Math.min(span / CALIB_MS, n / CALIB_MIN), n / CALIB_FRAMES) * 100));
    this.status(`Calibrando… quédate quieto en el centro (${pct}%)`);

    // Listo tras ~0,7 s quieto, o tras 20 fotogramas seguidos si la cámara va muy rápida. Con la
    // cámara lenta (5–7 fps) la ventana de 1,2 s no junta 8 cuadros: alcanza con CALIB_MIN.
    if ((span >= CALIB_MS && n >= CALIB_MIN) || n >= CALIB_FRAMES) {
      const torso = mean('torso');
      this.base = {
        x: mx, sy: my, sw,
        ny: mean('ny'), hy: mean('hy'), ay: mean('ay'),
        torso: Math.max(torso ?? sw * 1.3, 0.05),
      };
      this.lane = 0;
      this.identity = { ratio: this.base.sw / this.base.torso };
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
