// Une el juego con los controles (cuerpo vía cámara + teclado).
import { Game } from './game.js';
import { PlaySession } from './session.js';
import { routeState } from './avenue-route.js';
import { Leaderboard } from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const actionEl = $('action');
const leaderboard = new Leaderboard(() => overlay.classList.remove('hidden'));
let actionTimer;

function flash(text, color = '#fff') {
  actionEl.textContent = text;
  actionEl.style.color = color;
  actionEl.classList.add('show');
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => actionEl.classList.remove('show'), 350);
}

const game = new Game($('game'), {
  onCharacterError() {
    $('subtitle').textContent = 'No se pudo cargar el personaje detallado. Puedes jugar y volver a cargar la página.';
  },
  onScore(score, coins) {
    $('score').textContent = score;
    $('coins').textContent = `🪙 ${coins}`;
  },
  onCoin() {},
  onStumble: () => flash('¡TROPIEZO! 👨‍🏫', '#ff5a5a'),
  onJetpack: () => flash('¡JETPACK! 🚀', '#ffb42e'),
  onPower(fraction) {
    $('power').classList.toggle('show', fraction > 0);
    $('power-fill').style.width = `${fraction * 100}%`;
  },
  onGameOver(score, coins, reason) {
    $('title').textContent = reason === 'caught' ? '¡Te atrapó el profesor! 👨‍🏫' : '¡Choque! 💥';
    $('subtitle').textContent = `Puntuación: ${score} · Monedas: ${coins} — jugá otra vez con el botón o levantando las dos manos`;
    $('howto').style.display = 'none';
    $('playBtn').textContent = '↻ Otra vez';
    leaderboard.offerScore(score, coins);
  },
});

const qualityDescriptions = {
  auto: 'Ajusta la resolución según el rendimiento del equipo.',
  low: 'Menos sombras y distancia; prioriza fluidez en equipos modestos.',
  balanced: 'Equilibrio entre nitidez, sombras y rendimiento.',
  high: 'Más resolución, sombras y detalle en personajes y escenario.',
  ultra: 'Máxima resolución, sombras y distancia de dibujado; requiere un equipo potente.',
};
const qualityInput = $('quality');
try {
  const savedQuality = localStorage.getItem('graphicsQuality');
  if (['auto', 'low', 'balanced', 'high', 'ultra'].includes(savedQuality)) qualityInput.value = savedQuality;
} catch {}
game.setQuality(qualityInput.value);
$('quality-description').textContent = qualityDescriptions[qualityInput.value];
qualityInput.addEventListener('change', event => {
  const quality = event.target.value;
  game.setQuality(quality);
  $('quality-description').textContent = qualityDescriptions[quality];
  try { localStorage.setItem('graphicsQuality', quality); } catch {}
});

let pose = null;
const pauseEl = $('pause');
function showPause(title, text = '', count = false) {
  pauseEl.classList.remove('hidden');
  $('pause-title').textContent = title;
  $('pause-title').classList.toggle('count', count);
  $('pause-text').textContent = text;
}
const session = new PlaySession(game, showPause, () => pauseEl.classList.add('hidden'));
function play() {
  if (leaderboard.blocking || game.state === 'playing' || session.pending || session.manual) return;
  overlay.classList.add('hidden');
  session.request();
}

const poseHandlers = {
  onArms: targets => { if (!session.keyboard) game.setArmTargets(targets); },
  onStatus: (text) => {
    $('pose-status').textContent = text;
    if (!session.keyboard && session.pending && !session.ready) $('pause-text').textContent = text;
  },
  onLost: () => {
    session.tracking(false);
    if (pose && !pose.running) $('retryCam').classList.remove('hidden');
  },
  onCalibrating: () => session.tracking(false),
  onCalibrated: () => {
    flash('¡Listo! 🙌', '#7dff9a');
    if (!session.keyboard) game.setLane(1);
    session.tracking(true);
  },
  onLane: (lane) => {
    if (session.keyboard) return;
    game.setLane(lane + 1);
    flash(['⬅', '⬆', '➡'][lane + 1]);
  },
  onJump: () => {
    if (session.keyboard) return;
    game.jump();
    flash('SALTO ⤒', '#ffd84a');
  },
  onDuck: () => {
    if (session.keyboard) return;
    game.roll();
    flash('AGACHADO ⤓', '#4ad0ff');
  },
  onDuckHold: () => { if (!session.keyboard) game.holdRoll(); },
  onDuckEnd: () => { if (!session.keyboard) game.releaseRoll(); },
  onHandsUp: () => { if (!session.keyboard) play(); },
};

async function activateCamera() {
  session.keyboard = false;
  const btn = $('camBtn');
  btn.disabled = true;
  btn.textContent = 'Cargando…';
  try {
    const { PoseController } = await import('./pose.js');
    pose ??= new PoseController($('video'), $('skeleton'), poseHandlers, sensitivity);
    session.tracking(false);
    await pose.start();
    btn.textContent = '📷 Cámara activa';
    $('retryCam').classList.add('hidden');
    $('subtitle').textContent = 'Quédate quieto para calibrar y luego levanta las dos manos para empezar';
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = '📷 Reintentar cámara';
    if (session.pending) $('retryCam').classList.remove('hidden');
    $('pose-status').textContent = `Error: ${err.message}`;
  }
}
$('camBtn').addEventListener('click', activateCamera);
$('retryCam').addEventListener('click', activateCamera);
$('playBtn').addEventListener('click', play);

// Sensibilidad del salto y de agacharse (se recuerda en este navegador)
let sensitivity = 1;
try {
  sensitivity = Number(localStorage.getItem('sensitivity')) || 1;
} catch {}
const sensInput = $('sens');
const showSens = () => ($('sens-value').textContent = `${Math.round(sensitivity * 100)}%`);
sensInput.value = sensitivity;
showSens();
sensInput.addEventListener('input', () => {
  sensitivity = Number(sensInput.value);
  if (pose) pose.sensitivity = sensitivity;
  showSens();
  try {
    localStorage.setItem('sensitivity', String(sensitivity));
  } catch {}
});

// --- Control por teclado ---
const editingField = target => target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
window.addEventListener('keyup', e => {
  if (leaderboard.blocking || editingField(e.target)) return;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') game.releaseRoll();
});
window.addEventListener('keydown', (e) => {
  if (leaderboard.blocking || editingField(e.target)) return;
  if (['Enter', 'Space'].includes(e.code) && e.target instanceof Element && e.target.closest('button, a')) return;
  if (e.code === 'KeyD' && !e.repeat && (!overlay.classList.contains('hidden') || session.pending)) {
    overlay.classList.add('hidden');
    $('retryCam').classList.add('hidden');
    session.startDebug();
    flash('DEBUG · ← → ↑ ↓', '#ffd84a');
    e.preventDefault();
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Enter'].includes(e.code)) {
    session.useKeyboard();
  }
  if (e.repeat && ['Space', 'KeyW', 'ArrowUp'].includes(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': game.left(); break;
    case 'ArrowRight': case 'KeyD': game.right(); break;
    case 'ArrowUp': case 'KeyW': case 'Space':
      if (game.state === 'playing') game.jump(); else play();
      break;
    case 'ArrowDown': case 'KeyS': game.roll(); break;
    case 'Enter': play(); break;
    case 'KeyC': pose?.recalibrate(); break;
    case 'KeyP':
      session.togglePause();
      break;
    default: return;
  }
  e.preventDefault();
});

// --- Bucle ---
let last = performance.now();
let fpsSampleStart = last;
let fpsFrames = 0;
const routeZone = $('route-zone');
function frame(now) {
  game.update((now - last) / 1000);
  fpsFrames++;
  const fpsElapsed = now - fpsSampleStart;
  if (fpsElapsed >= 500) {
    $('fps').textContent = String(Math.round(fpsFrames * 1000 / fpsElapsed));
    fpsFrames = 0;
    fpsSampleStart = now;
  }
  const route = routeState(game.distance);
  const label = `${route.zone} · Vuelta ${route.lap}`;
  if (routeZone.textContent !== label) routeZone.textContent = label;
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Consultar el permiso no abre un diálogo. Solo reconectamos automáticamente si ya está concedido.
navigator.permissions?.query({ name: 'camera' }).then(permission => {
  if (permission.state === 'granted' && !session.keyboard) activateCamera();
}).catch(() => {});
