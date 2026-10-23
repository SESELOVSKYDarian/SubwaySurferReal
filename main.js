// Une el juego con los controles (cuerpo vía cámara + teclado).
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const actionEl = $('action');
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
    $('subtitle').textContent = `Puntuación: ${score} · Monedas: ${coins} — levanta las dos manos para volver a jugar`;
    $('howto').style.display = 'none';
    $('playBtn').textContent = '↻ Otra vez';
    setTimeout(() => game.state === 'over' && overlay.classList.remove('hidden'), 600);
  },
});

$('quality').addEventListener('change', event => game.setQuality(event.target.value));

function play() {
  if (game.state === 'playing' || game.state === 'paused') return;
  overlay.classList.add('hidden');
  game.start();
}

// --- Control por cuerpo (MediaPipe se carga solo al activar la cámara) ---
let pose = null;
// --- Pausa: si la cámara te pierde (sales del cuadro, alguien se cruza…) el juego
// se para, te recalibra cuando vuelves y sigue tras una cuenta atrás ---
const pauseEl = $('pause');
let pausedByLoss = false;
let countdownTimer = null;

function showPause(title, text = '', count = false) {
  pauseEl.classList.remove('hidden');
  $('pause-title').textContent = title;
  $('pause-title').classList.toggle('count', count);
  $('pause-text').textContent = text;
}

function hidePause() {
  pauseEl.classList.add('hidden');
}

function cancelCountdown() {
  clearTimeout(countdownTimer);
  countdownTimer = null;
}

function resumeWithCountdown(n = 3) {
  cancelCountdown();
  if (n === 0) {
    hidePause();
    pausedByLoss = false;
    game.resume();
    game.setLane(1); // te has recalibrado en el centro
    return;
  }
  showPause(String(n), '¡Prepárate!', true);
  countdownTimer = setTimeout(() => resumeWithCountdown(n - 1), 700);
}

const poseHandlers = {
  onStatus: (text) => {
    $('pose-status').textContent = text;
    if (pausedByLoss && !countdownTimer) $('pause-text').textContent = text;
  },
  onLost: () => {
    cancelCountdown();
    if (game.state === 'playing') {
      game.pause();
      pausedByLoss = true;
    }
    if (pausedByLoss) showPause('⏸ Te perdí de vista', 'Vuelve al centro y quédate quieto para recalibrar');
  },
  onFound: () => {
    if (pausedByLoss) showPause('👀 ¡Te veo!', 'Quédate quieto, calibrando…');
  },
  onCalibrated: () => {
    flash('¡Listo! 🙌', '#7dff9a');
    if (pausedByLoss) resumeWithCountdown();
  },
  onLane: (lane) => {
    game.setLane(lane + 1);
    flash(['⬅', '⬆', '➡'][lane + 1]);
  },
  onJump: () => {
    game.jump();
    flash('SALTO ⤒', '#ffd84a');
  },
  onDuck: () => {
    game.roll();
    flash('AGACHADO ⤓', '#4ad0ff');
  },
  onDuckHold: () => game.holdRoll(),
  onDuckEnd: () => game.releaseRoll(),
  onHandsUp: play,
};

$('camBtn').addEventListener('click', async () => {
  const btn = $('camBtn');
  btn.disabled = true;
  btn.textContent = 'Cargando…';
  try {
    const { PoseController } = await import('./pose.js');
    pose = new PoseController($('video'), $('skeleton'), poseHandlers, sensitivity);
    await pose.start();
    btn.textContent = '📷 Cámara activa';
    $('subtitle').textContent = 'Quédate quieto para calibrar y luego levanta las dos manos para empezar';
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = '📷 Reintentar cámara';
    $('pose-status').textContent = `Error: ${err.message}`;
  }
});
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
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') game.releaseRoll();
});
window.addEventListener('keydown', (e) => {
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
      if (game.state === 'playing') {
        game.pause();
        showPause('⏸ Pausa', 'Pulsa P para seguir');
      } else if (game.state === 'paused' && !pausedByLoss) {
        game.resume();
        hidePause();
      }
      break;
    default: return;
  }
  e.preventDefault();
});

// --- Bucle ---
let last = performance.now();
function frame(now) {
  game.update((now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
