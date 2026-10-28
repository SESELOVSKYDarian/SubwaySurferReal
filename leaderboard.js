import { RankingStore, normalizeInitials, STORY_RANKING_KEY } from './ranking.js';

const $ = id => document.getElementById(id);

// Títulos de la pantalla de fin de partida según cómo terminó.
const RESULTS = {
  caught: ['ESTANGA TE AGARRÓ', '¡TE ATRAPÓ!'],
  crash: ['TE COMISTE UN OBSTÁCULO', '¡CHOQUE!'],
  victory: ['CON GUARDAPOLVO Y TODO', '¡LLEGASTE A TIEMPO!'],
  late: ['TE QUEDASTE AFUERA', 'NO LLEGASTE'],
};

export class Leaderboard {
  // onReturn: al cerrar el ranking abierto desde el menú o la pausa.
  // onMenu / onReplay: las dos salidas de la pantalla de fin de partida.
  constructor(onReturn, { onMenu = onReturn, onReplay = () => {} } = {}) {
    this.stores = { infinite: new RankingStore(), story: new RankingStore(undefined, STORY_RANKING_KEY) };
    this.mode = 'infinite';
    this.onReturn = onReturn;
    this.onMenu = onMenu;
    this.onReplay = onReplay;
    this.pending = null;
    this.result = null;    // última partida terminada, mientras sus pantallas siguen abiertas
    this.entryDialog = $('score-dialog');
    this.rankingDialog = $('ranking-dialog');
    this.form = $('score-form');
    this.initials = $('score-initials');
    this.submit = $('save-score');
    $('rankingBtn').addEventListener('click', () => this.openRanking(null, 'infinite'));
    $('rank-tab-infinite').addEventListener('click', () => this.openRanking(null, 'infinite'));
    $('rank-tab-story').addEventListener('click', () => this.openRanking(null, 'story'));
    // Después de una partida, salir del ranking va al menú en el mismo turno (el evento
    // close llega más tarde y podría pisar una partida nueva).
    $('close-ranking').addEventListener('click', () => { if (this.result) this.toMenu(); else this.rankingDialog.close(); });
    this.rankingDialog.addEventListener('cancel', event => { if (this.result) { event.preventDefault(); this.toMenu(); } });
    $('ranking-replay').addEventListener('click', () => this.replay());
    $('replay-score').addEventListener('click', () => this.replay());
    this.rankingDialog.addEventListener('close', () => {
      // El evento llega después de close(): el cierre silencioso se marca en el diálogo.
      if (this.rankingDialog.dataset.quiet) { delete this.rankingDialog.dataset.quiet; return; }
      if (this.result) this.toMenu(); else this.onReturn();
    });
    this.entryDialog.addEventListener('cancel', event => { event.preventDefault(); this.skip(); });
    $('skip-score').addEventListener('click', () => this.skip());
    this.initials.addEventListener('input', () => {
      this.initials.value = normalizeInitials(this.initials.value);
      this.submit.disabled = this.initials.value.length !== 3;
      $('score-error').textContent = '';
    });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      if (!this.pending?.save || !this.form.reportValidity()) return;
      try {
        const { mode } = this.pending;
        const entry = this.stores[mode].save(this.initials.value, this.pending.score, this.pending.coins);
        this.pending = null;
        this.close(this.entryDialog);
        this.openRanking(entry.id, mode);
      } catch {
        $('score-error').textContent = 'No se pudo guardar en este navegador. Podés reintentar o seguir sin guardar.';
      }
    });
  }

  get blocking() {
    return !!this.pending || this.entryDialog.open || this.rankingDialog.open;
  }

  // Muestra el resultado. Con save=false (derrota en historia) no se piden iniciales.
  offerScore(score, coins, mode = 'infinite', reason = null, { save = true, replay = null } = {}) {
    if (this.pending) return;
    this.pending = { score, coins, mode, save };
    this.result = { mode, replay };
    this.form.reset();
    this.form.hidden = !save;
    this.submit.disabled = true;
    $('score-error').textContent = '';
    const story = mode === 'story';
    const [eyebrow, title] = RESULTS[reason ?? (story ? 'victory' : 'caught')] || RESULTS.caught;
    $('gameover-eyebrow').textContent = eyebrow;
    $('score-dialog-title').textContent = title;
    $('gameover-points').hidden = story;
    $('gameover-score').textContent = score.toLocaleString('es-AR');
    $('gameover-coins').textContent = coins.toLocaleString('es-AR');
    let best = 0;
    try { best = this.stores[mode].read()[0]?.score ?? 0; } catch {}
    $('gameover-best').textContent = best.toLocaleString('es-AR');
    const value = story ? coins : score;
    $('final-score').textContent = !save
      ? 'Las monedas vuelven a cero. Intentá de nuevo desde la Técnica.'
      : value > best ? '¡Nuevo récord en este navegador!'
      : value === best ? (value ? '¡Igualaste el récord!' : '')
      : `Te faltaron ${(best - value).toLocaleString('es-AR')} para el récord.`;
    $('replay-score').lastChild.textContent = story && !save ? 'VOLVER A INTENTAR' : 'VOLVER A JUGAR';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.entryDialog.showModal();
      (save ? this.initials : $('replay-score')).focus();
    }, 600);
  }

  // Cierra un diálogo sin disparar la vuelta al menú.
  close(dialog) {
    if (!dialog.open) return;
    if (dialog === this.rankingDialog) dialog.dataset.quiet = '1';
    dialog.close();
  }

  finish() {
    clearTimeout(this.timer);
    this.pending = null;
    const result = this.result;
    this.result = null;
    this.close(this.entryDialog);
    this.close(this.rankingDialog);
    return result;
  }

  replay() {
    const result = this.finish();
    if (result) this.onReplay(result);
  }

  toMenu() {
    if (this.finish()) this.onMenu();
  }

  skip() {
    if (this.result) this.toMenu();
    else { this.finish(); this.onReturn(); }
  }

  openRanking(savedId = null, mode = this.mode) {
    this.mode = mode;
    const story = mode === 'story';
    $('ranking-title').textContent = story ? '🏆 Ranking · Modo historia' : '🏆 Ranking';
    $('rank-tab-infinite').setAttribute('aria-pressed', String(!story));
    $('rank-tab-story').setAttribute('aria-pressed', String(story));
    $('ranking-replay').hidden = !this.result;
    const heads = document.querySelectorAll('#ranking-table thead th');
    heads[2].textContent = story ? 'Monedas' : 'Puntos';
    heads[3].hidden = story;
    const body = $('ranking-rows');
    const status = $('ranking-status');
    body.replaceChildren();
    status.textContent = '';
    $('ranking-table').hidden = true;
    try {
      const entries = this.stores[mode].read();
      const top = entries.slice(0, 10);
      $('ranking-empty').hidden = top.length > 0;
      $('ranking-table').hidden = top.length === 0;
      for (const [index, entry] of top.entries()) {
        const row = document.createElement('tr');
        if (entry.id === savedId) row.classList.add('current-score');
        const values = [index + 1, entry.initials, entry.score.toLocaleString('es-AR'), entry.coins.toLocaleString('es-AR')];
        for (const value of story ? values.slice(0, 3) : values) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        body.append(row);
      }
      if (savedId) {
        const place = entries.findIndex(entry => entry.id === savedId) + 1;
        status.textContent = `Partida guardada. Puesto ${place} de ${entries.length}.`;
      }
    } catch {
      $('ranking-empty').hidden = true;
      status.textContent = 'No se pudo leer el ranking guardado en este navegador.';
    }
    if (!this.rankingDialog.open) this.rankingDialog.showModal();
    if (this.result) $('ranking-replay').focus();
  }
}
