import { RankingStore, normalizeInitials } from './ranking.js';

const $ = id => document.getElementById(id);

export class Leaderboard {
  constructor(onReturn) {
    this.store = new RankingStore();
    this.onReturn = onReturn;
    this.pending = null;
    this.entryDialog = $('score-dialog');
    this.rankingDialog = $('ranking-dialog');
    this.form = $('score-form');
    this.initials = $('score-initials');
    this.submit = $('save-score');
    $('rankingBtn').addEventListener('click', () => this.openRanking());
    $('close-ranking').addEventListener('click', () => this.rankingDialog.close());
    this.rankingDialog.addEventListener('close', () => this.onReturn());
    this.entryDialog.addEventListener('cancel', event => { event.preventDefault(); this.skip(); });
    $('skip-score').addEventListener('click', () => this.skip());
    this.initials.addEventListener('input', () => {
      this.initials.value = normalizeInitials(this.initials.value);
      this.submit.disabled = this.initials.value.length !== 3;
      $('score-error').textContent = '';
    });
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      if (!this.pending || !this.form.reportValidity()) return;
      try {
        const entry = this.store.save(this.initials.value, this.pending.score, this.pending.coins);
        this.pending = null;
        this.entryDialog.close();
        this.openRanking(entry.id);
      } catch {
        $('score-error').textContent = 'No se pudo guardar en este navegador. Podés reintentar u omitir el guardado.';
      }
    });
  }

  get blocking() {
    return !!this.pending || this.entryDialog.open || this.rankingDialog.open;
  }

  offerScore(score, coins) {
    if (this.pending) return;
    this.pending = { score, coins };
    this.form.reset();
    this.submit.disabled = true;
    $('score-error').textContent = '';
    $('final-score').textContent = `${score.toLocaleString('es-AR')} puntos · ${coins.toLocaleString('es-AR')} monedas`;
    this.timer = setTimeout(() => {
      this.entryDialog.showModal();
      this.initials.focus();
    }, 600);
  }

  skip() {
    clearTimeout(this.timer);
    this.pending = null;
    this.entryDialog.close();
    this.onReturn();
  }

  openRanking(savedId = null) {
    const body = $('ranking-rows');
    const status = $('ranking-status');
    body.replaceChildren();
    status.textContent = '';
    $('ranking-table').hidden = true;
    try {
      const entries = this.store.read();
      const top = entries.slice(0, 10);
      $('ranking-empty').hidden = top.length > 0;
      $('ranking-table').hidden = top.length === 0;
      for (const [index, entry] of top.entries()) {
        const row = document.createElement('tr');
        if (entry.id === savedId) row.classList.add('current-score');
        for (const value of [index + 1, entry.initials, entry.score.toLocaleString('es-AR'), entry.coins.toLocaleString('es-AR')]) {
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
  }
}
