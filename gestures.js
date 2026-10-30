// Gestos del jugador (carril, salto, agachado, manos arriba) a partir de los 33 puntos de MediaPipe Pose.
// No toca la cámara ni la pantalla: recibe los puntos del jugador ya elegido y el tiempo, y avisa con
// los mismos callbacks que usa el juego (onLane, onJump, onDuck, onDuckHold, onDuckEnd, onHandsUp, onCalibrated).
//
// Cómo decide, en pocas palabras:
// - Todo se mide en proporciones del propio cuerpo: lo vertical en largos de torso (T, hombros→cadera)
//   y lo lateral en anchos de hombro. Así funciona igual con un chico lejos o un adulto cerca.
// - No hay filtros con retraso en el camino de la decisión: se usan los puntos tal como llegan y una
//   velocidad calculada con regresión sobre los últimos cuadros (estable y sin demora extra).
// - Cada gesto tiene dos formas de dispararse: por POSICIÓN (pasó un umbral claro) o por MOVIMIENTO
//   (umbral más chico pero con la velocidad típica del gesto). La de movimiento llega 1–3 cuadros antes.
// - El carril se anticipa: con el cuerpo ya en marcha hacia un costado se proyecta la posición un
//   cuadro hacia adelante (lo que tarda en llegar el siguiente resultado de la cámara).

const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24;
const L_ANKLE = 27, R_ANKLE = 28;

export const GESTURE = Object.freeze({
  // Carril (anchos de hombro respecto del punto calibrado)
  LANE_ENTER: 0.5,      // pasar al carril de al lado
  LANE_MIN: 0.3,        // desplazamiento real mínimo para aceptar la anticipación
  LANE_EXIT: 0.32,      // volver al centro (histéresis)
  LANE_SPEED: 1.5,      // anchos de hombro por segundo para anticipar
  // Salto (largos de torso; los umbrales se dividen por la sensibilidad)
  JUMP_UP: 0.12,        // subida clara de cadera y hombros
  JUMP_MIN: 0.06,       // subida mínima para el disparo por velocidad (~3 cm)
  JUMP_SPEED: 2.0,      // un salto despega a 3–6 T/s; trotar o respirar no pasa de ~0,8
  DIP: 0.1,             // bajó al menos esto (amague o agachada)…
  FROM_LOW_MS: 450,     // …hace menos de esto: para saltar tienen que despegar los pies (si se ven)…
  JUMP_AFTER_LOW: 0.17, // …o subir esto por encima de la altura de pie (levantarse no es saltar)
  FEET_OFF: 0.04,       // los pies despegaron del piso
  MAX_RISE_SPEED: 8,    // T/s: más rápido que esto en un solo cuadro es un error del detector
  // Agachado
  DUCK_DOWN: 0.25,      // bajada clara de hombros / encogimiento
  DUCK_SURE: 0.33,      // tan claro que alcanza un cuadro
  DUCK_MIN: 0.17,       // bajada mínima para el disparo por velocidad (más que el amague de un salto)
  DUCK_SPEED: 1.5,      // agacharse a propósito baja a 2–3 T/s
  DUCK_EXIT: 0.16,
  DUCK_LOWERED: 0.15,   // hombros así de bajos: las caderas pueden salir de cuadro
  DUCK_MAX_MS: 2500,
  DUCK_STILL_MS: 800,
  LANDING_MS: 380,      // después de un salto, la caída no es agacharse
  // Calibración
  CALIB_FRAMES: 20,
  CALIB_MS: 700,
  CALIB_MIN: 4,
});

const median = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Pendiente por mínimos cuadrados de (t, y) sobre los últimos cuadros recientes (unidades por segundo).
function slope(hist, key, now, window = 260) {
  const pts = [];
  for (let i = hist.length - 1; i >= 0 && pts.length < 4; i--) {
    const h = hist[i];
    if (now - h.t > window && pts.length >= 2) break;
    if (h[key] != null) pts.push(h);
  }
  if (pts.length < 2) return null;
  const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length, my = pts.reduce((a, p) => a + p[key], 0) / pts.length;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.t - mt) * (p[key] - my); den += (p.t - mt) ** 2; }
  return den > 0 ? (num / den) * 1000 : 0;
}

export class GestureDetector {
  constructor(handlers = {}, { sensitivity = 1 } = {}) {
    this.h = handlers;
    this.sensitivity = sensitivity;
    this.reset();
  }

  reset() {
    if (this.ducking) this.h.onDuckEnd?.();
    this.base = null;
    this.samples = [];
    this.hist = [];
    this.lane = 0;
    this.jumpArmed = true;
    this.ducking = false;
    this.duckFrames = 0;
    this.jumpFrames = 0;
    this.lastDip = 0;
    this.jumpCheck = false;
    this.lastJump = 0;
    this.lastDuckEnd = 0;
    this.still = null;
    this.rebased = null;
    this.handsUpSince = 0;
    this.lastHandsUp = 0;
    this.prevDx = null;
    this.meter = { jump: 0, duck: 0 };
    this.calibPct = 0;
    this.hint = '';
  }

  // Medidas del cuerpo en este cuadro (null si no se ve esa parte). Sin filtros: la decisión usa
  // la regresión sobre varios cuadros, que ya quita el temblor sin agregar retraso.
  measure(lm) {
    const vis = (i) => (lm[i].visibility ?? 1) > 0.5 && lm[i].y > 0.003 && lm[i].y < 0.997;
    const m = {};
    if (vis(L_SHOULDER) && vis(R_SHOULDER)) {
      m.x = 1 - (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2; // en espejo, como la vista de la cámara
      m.sy = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2;
      m.sw = Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y);
    }
    if (vis(NOSE)) m.ny = lm[NOSE].y;
    if (vis(L_HIP) && vis(R_HIP)) m.hy = (lm[L_HIP].y + lm[R_HIP].y) / 2;
    if (vis(L_ANKLE) && vis(R_ANKLE)) m.ay = Math.max(lm[L_ANKLE].y, lm[R_ANKLE].y);
    if (m.sy != null && m.hy != null) m.torso = m.hy - m.sy;
    return m;
  }

  // Devuelve false mientras no hay calibración (para que el controlador muestre la guía).
  update(lm, now, fps = 30) {
    const visible = (i) => (lm[i].visibility ?? 1) > 0.5;
    this.checkHandsUp(lm, visible, now);
    const m = this.measure(lm);
    if (!this.base) { this.calibrationStep(m, now); return false; }
    this.decide(m, now, fps);
    return true;
  }

  calibrationStep(m, now) {
    const G = GESTURE;
    if (m.sy == null || m.hy == null || m.sw < 0.06 || m.torso < 0.08) { this.samples = []; this.hint = 'Necesito ver tus hombros para calibrar'; return; }
    // (0,075: un chico a unos 2,5 m todavía entra; más chico que eso, el detector pierde precisión)
    if (m.sw < 0.075) { this.samples = []; this.hint = 'Acércate un poco a la cámara'; return; }
    if (m.sw > 0.42) { this.samples = []; this.hint = 'Aléjate un poco: tienen que verse tus caderas'; return; }
    if (Math.abs(m.x - 0.5) > 0.22) { this.samples = []; this.hint = m.x < 0.5 ? 'Muévete un poco a tu izquierda: al centro' : 'Muévete un poco a tu derecha: al centro'; return; }
    this.samples.push({ ...m, t: now });
    while (this.samples.length > 2 && now - this.samples[0].t > 1200) this.samples.shift();
    const pick = (k) => this.samples.map((p) => p[k]).filter((v) => v != null);
    const mean = (k) => { const v = pick(k); return v.length >= this.samples.length * 0.7 ? median(v) : null; };
    const mx = median(pick('x')), my = median(pick('sy')), sw = median(pick('sw'));
    const spread = Math.max(...this.samples.filter((p) => p.x != null).map((p) => Math.hypot(p.x - mx, p.sy - my)));
    if (spread > 0.25 * sw) this.samples = [{ ...m, t: now }];   // se movió: empieza de nuevo
    const span = now - this.samples[0].t, n = this.samples.length;
    this.calibPct = Math.min(100, Math.round(Math.max(Math.min(span / G.CALIB_MS, n / G.CALIB_MIN), n / G.CALIB_FRAMES) * 100));
    this.hint = `Calibrando… quédate quieto en el centro (${this.calibPct}%)`;
    if ((span >= G.CALIB_MS && n >= G.CALIB_MIN) || n >= G.CALIB_FRAMES) {
      const torso = mean('torso');
      this.base = { x: mx, sy: my, sw, ny: mean('ny'), hy: mean('hy'), ay: mean('ay'), torso: Math.max(torso ?? sw * 1.3, 0.05) };
      this.lane = 0;
      this.hist = [];
      this.identity = { ratio: this.base.sw / this.base.torso };
      this.h.onCalibrated?.();
    }
  }

  decide(m, now, fps) {
    const G = GESTURE, b = this.base, T = b.torso, sens = this.sensitivity;
    const slow = fps > 0 && fps < 18;
    // ---- Medidas relativas al cuerpo calibrado
    const dx = m.x != null ? (m.x - b.x) / b.sw : null;                         // + = a la derecha
    const riseH = m.hy != null && b.hy != null ? (b.hy - m.hy) / T : null;       // + = sube
    const riseS = m.sy != null ? (b.sy - m.sy) / T : null;
    const rise = riseH != null && riseS != null ? Math.min(riseH, riseS) : riseS;
    const shoulderDrop = riseS != null ? -riseS : null;
    const duckCues = [];
    if (shoulderDrop != null) duckCues.push(shoulderDrop);
    // Bajar solo la cabeza (mirar la pantalla) no es agacharse: la nariz ayuda si los hombros bajan.
    if (m.ny != null && b.ny != null && (shoulderDrop == null || shoulderDrop > 0.08)) duckCues.push(((m.ny - b.ny) / T) * 0.85);
    if (m.torso != null) duckCues.push((1 - m.torso / T) * 0.9);
    // Inclinarse hacia la cámara: hombros más anchos y torso más corto (acercarse caminando agranda los dos).
    const size = m.sw != null ? m.sw / b.sw : 1;
    const torsoRel = m.torso != null ? m.torso / T / size : null;
    const leaning = size > 1.06 && torsoRel != null && torsoRel < 0.88;
    if (leaning) duckCues.push((1 - torsoRel) * 1.5);
    const duck = duckCues.length ? Math.max(...duckCues) : null;

    // ---- Historia y velocidades (regresión sobre los últimos cuadros)
    const prevH = this.hist[this.hist.length - 1];
    this.hist.push({ t: now, dx, riseH, riseS, rise, drop: shoulderDrop });
    if (this.hist.length > 8) this.hist.shift();
    const vx = slope(this.hist, 'dx', now) ?? 0;                                 // anchos de hombro / s
    // Subida: la menor entre cadera y hombros (encoger los hombros sube solo los hombros)
    const vH = slope(this.hist, 'riseH', now), vS = slope(this.hist, 'riseS', now);
    const vUp = vH != null && vS != null ? Math.min(vH, vS) : (vS ?? 0);
    const vDown = slope(this.hist, 'drop', now) ?? 0;
    this.meter = { jump: Math.max(0, rise ?? 0), duck: Math.max(0, duck ?? 0) };

    this.decideLane(dx, vx, fps);

    // ---- Salto
    if (rise != null && rise < -G.DIP) this.lastDip = now;
    // Después de bajar (amague o agachada), subir rápido puede ser saltar o solo pararse de golpe:
    // lo distinguen los pies (en un salto despegan) o, si no se ven, cuánto pasa de la altura de pie.
    const afterDip = now - this.lastDip < G.FROM_LOW_MS;
    const feetRise = m.ay != null && b.ay != null ? (b.ay - m.ay) / T : null;
    const feetOff = feetRise != null && feetRise >= G.FEET_OFF / sens;
    const sideways = Math.abs(vx) > 4;
    // Un salto de un cuadro a otro más rápido de lo que puede subir un cuerpo es un error del detector:
    // se espera a ver si el cuadro siguiente lo confirma.
    const dtPrev = prevH ? (now - prevH.t) / 1000 : 0;
    const spike = prevH?.rise != null && rise != null && dtPrev > 0 && (rise - prevH.rise) / dtPrev > G.MAX_RISE_SPEED && fps >= 15;
    if (rise != null && this.jumpArmed && !leaning) {
      const up = (afterDip && !feetOff ? G.JUMP_AFTER_LOW : G.JUMP_UP) / sens;
      const byPos = rise >= up;
      // Por velocidad: cadera y hombros subiendo rápido a la vez
      // (con la cámara lenta, después de bajar, un cuadro con error y un salto se ven iguales: no se anticipa)
      const byMove = (!afterDip || (feetOff && !slow)) && rise >= (G.JUMP_MIN * (sideways ? 1.3 : 1)) / sens && vUp >= (G.JUMP_SPEED * (sideways ? 1.3 : 1)) / sens;
      this.jumpFrames = byPos ? this.jumpFrames + 1 : 0;
      // Un solo cuadro alcanza si la subida es indiscutible (con la cámara lenta y después de bajar, más todavía)
      const sure = rise >= (slow && afterDip ? (G.JUMP_AFTER_LOW / sens) * 1.5 : up * (slow ? 1.25 : 1.6));
      const confirmed = this.jumpCheck && rise >= G.JUMP_MIN / sens;
      this.jumpCheck = spike && (byMove || byPos);
      if (!this.jumpCheck && (confirmed || byMove || (byPos && (this.jumpFrames >= 2 || sure)))) {
        this.jumpArmed = false;
        this.jumpFrames = 0;
        this.lastJump = now;
        if (this.ducking) { this.ducking = false; this.lastDuckEnd = now; this.h.onDuckEnd?.(); }
        this.h.onJump?.();
      }
    }
    if (rise != null && (rise < (G.JUMP_MIN * 0.6) / sens || (now - this.lastJump > 600 && rise < (G.JUMP_UP * 0.5) / sens))) this.jumpArmed = true;

    // ---- Quietud (para reconocer una postura nueva que ya no cambia)
    if (m.sy != null && (!this.still || Math.abs(m.sy - this.still.sy) > 0.06 * T)) this.still = { sy: m.sy, t: now };
    const stillFor = this.still ? now - this.still.t : 0;

    // ---- Agachado
    const landing = now - this.lastJump < G.LANDING_MS;
    const hipsUp = riseH != null && riseH > 0.05;   // la cadera subiendo es un salto, no una agachada
    if (duck != null && !landing) {
      if (!this.ducking) {
        const byPos = duck >= G.DUCK_DOWN / sens;
        const byMove = !hipsUp && duck >= G.DUCK_MIN / sens && vDown >= G.DUCK_SPEED / sens;
        this.duckFrames = byPos ? this.duckFrames + 1 : 0;
        if (byMove || (byPos && (this.duckFrames >= 2 || slow || duck >= G.DUCK_SURE / sens))) {
          this.ducking = true;
          this.duckStart = now;
          this.duckPeak = duck;
          this.jumpFrames = 0;
          this.h.onDuck?.();
        }
      } else {
        // Para levantarse cuentan hombros y torso, no la nariz (al pararse se sigue mirando la pantalla).
        // La salida es relativa a lo hondo que bajó, y si se está levantando rápido se suelta antes.
        this.duckPeak = Math.max(this.duckPeak, duck);
        const body = [];
        if (shoulderDrop != null) body.push(shoulderDrop);
        if (m.torso != null) body.push((1 - m.torso / T) * 0.9);
        if (leaning) body.push((1 - torsoRel) * 1.5);
        const stand = body.length ? Math.max(...body) : duck;
        const exitAt = Math.min(G.DUCK_DOWN * 0.8, Math.max(G.DUCK_EXIT, this.duckPeak * 0.45)) / sens;
        const risingFast = vDown <= -G.DUCK_SPEED / sens && stand < Math.min(this.duckPeak * 0.65, G.DUCK_DOWN / sens);
        const stuck = now - this.duckStart > G.DUCK_MAX_MS && stillFor > G.DUCK_STILL_MS;
        if (stand < exitAt || risingFast || stuck) {
          this.ducking = false;
          this.duckFrames = 0;
          this.lastDuckEnd = now;
          this.h.onDuckEnd?.();
          if (stuck) this.rebaseVertical(m, now);
        } else {
          this.h.onDuckHold?.();
        }
      }
    }

    // ---- Tras corregir la referencia agachado: esperar a ver la postura de pie real
    if (this.rebased) {
      this.jumpArmed = false;
      const moved = m.sy != null && Math.abs(m.sy - this.rebased.sy) > 0.15 * T;
      if (!this.ducking && stillFor > G.DUCK_STILL_MS && (moved || now - this.rebased.t > 2000)) {
        if (moved) this.rebaseVertical(m, now);
        this.rebased = null;
        this.jumpArmed = true;
      }
    }

    // ---- Adaptación lenta (se acercó o alejó un poco, o cambió de postura y quedó quieto)
    const settledHere = !this.rebased && stillFor > 1500 && Math.abs(rise ?? 0) < (G.JUMP_UP * 0.6) / sens && Math.abs(duck ?? 0) < (G.DUCK_DOWN * 0.6) / sens;
    if (!this.ducking && ((Math.abs(rise ?? 0) < 0.04 && Math.abs(duck ?? 0) < 0.08) || settledHere)) {
      const k = settledHere ? 0.06 : 0.02;
      if (m.sy != null) b.sy += (m.sy - b.sy) * k;
      if (m.sw != null) b.sw += (m.sw - b.sw) * k;
      if (m.ny != null && b.ny != null) b.ny += (m.ny - b.ny) * k;
      if (m.hy != null && b.hy != null) b.hy += (m.hy - b.hy) * k;
      if (m.ay != null && b.ay != null) b.ay += (m.ay - b.ay) * k;
      if (m.torso != null) b.torso += (m.torso - b.torso) * k;
    }
  }

  decideLane(dx, vx, fps) {
    const G = GESTURE;
    if (dx == null) return;
    // Un salto enorme de un cuadro a otro (hombros confundidos por el detector) se confirma con el siguiente.
    const jumpy = this.prevDx != null && Math.abs(dx - this.prevDx) > 1.2 && fps >= 15;
    this.prevDx = dx;
    if (jumpy) return;
    // Anticipación: con el cuerpo en marcha, la posición dentro de un cuadro más (lo que tarda el resultado)
    const lead = Math.min(0.12, Math.max(0.03, 1 / Math.max(fps, 1)));
    const moving = Math.abs(vx) >= G.LANE_SPEED;
    const ahead = moving ? dx + vx * lead : dx;
    let lane = this.lane;
    const side = (d) => (d > 0 ? 1 : -1);
    if (lane === 0) {
      if (Math.abs(dx) >= G.LANE_ENTER || (Math.abs(ahead) >= G.LANE_ENTER && Math.abs(dx) >= G.LANE_MIN && side(ahead) === side(dx))) lane = side(dx);
    } else {
      const s = lane;
      if (dx * -s >= G.LANE_ENTER || (ahead * -s >= G.LANE_ENTER && dx * -s >= G.LANE_MIN)) lane = -s;   // cruzó al otro lado
      else if (dx * s <= G.LANE_EXIT || (moving && side(vx) === -s && ahead * s <= G.LANE_EXIT - 0.07)) lane = 0;
    }
    if (lane !== this.lane) {
      this.lane = lane;
      this.h.onLane?.(lane);
    }
  }

  // Toma la postura actual como referencia de altura, sin pausar ni pedir quedarse quieto.
  rebaseVertical(m, now) {
    const b = this.base;
    if (m.sy != null) b.sy = m.sy;
    if (m.ny != null) b.ny = m.ny;
    if (m.hy != null) b.hy = m.hy;
    if (m.ay != null) b.ay = m.ay;
    if (m.torso != null) b.torso = Math.max(m.torso, 0.05);
    this.hist = [];
    this.jumpFrames = 0;
    this.rebased = { sy: m.sy ?? b.sy, t: now };
  }

  // Mismo jugador ya calibrado que volvió a cuadro (tamaño y lugar parecidos): se sigue sin recalibrar.
  resumeIfSame(lm) {
    const b = this.base;
    if (!b || !lm) return false;
    const sw = Math.hypot(lm[L_SHOULDER].x - lm[R_SHOULDER].x, lm[L_SHOULDER].y - lm[R_SHOULDER].y);
    const x = 1 - (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2;
    if (Math.abs(Math.log(sw / b.sw)) < 0.3 && Math.abs(x - b.x) / b.sw < 1.6) {
      this.hist = []; this.jumpArmed = true; this.ducking = false;
      return true;
    }
    return false;
  }

  checkHandsUp(lm, visible, now) {
    const up = visible(L_WRIST) && visible(R_WRIST) && visible(NOSE) && lm[L_WRIST].y < lm[NOSE].y && lm[R_WRIST].y < lm[NOSE].y;
    if (!up) { this.handsUpSince = 0; return; }
    if (!this.handsUpSince) this.handsUpSince = now;
    if (now - this.handsUpSince > 400 && now - this.lastHandsUp > 2000) {
      this.lastHandsUp = now;
      this.h.onHandsUp?.();
    }
  }
}
