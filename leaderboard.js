import { RankingStore, normalizeInitials, STORY_RANKING_KEY } from './ranking.js';

const $ = id => document.getElementById(id);

export class Leaderboard {
  constructor(onReturn) {
    this.stores = { infinite: new RankingStore(), story: new RankingStore(undefined, STORY_RANKING_KEY) };
    this.mode = 'infinite';
    this.onReturn = onReturn;
    this.pending = null;
    this.entryDialog = $('score-dialog');
    this.rankingDialog = $('ranking-dialog');
    this.form = $('score-form');
    this.initials = $('score-initials');
    this.submit = $('save-score');
    $('rankingBtn').addEventListener('click', () => this.openRanking(null, 'infinite'));
    $('rank-tab-infinite').addEventListener('click', () => this.openRanking(null, 'infinite'));
    $('rank-tab-story').addEventListener('click', () => this.openRanking(null, 'story'));
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
        const { mode } = this.pending;
        const entry = this.stores[mode].save(this.initials.value, this.pending.score, this.pending.coins);
        this.pending = null;
        this.entryDialog.close();
        this.openRanking(entry.id, mode);
      } catch {
        $('score-error').textContent = 'No se pudo guardar en este navegador. Podés reintentar u omitir el guardado.';
      }
    });
  }

  get blocking() {
    return !!this.pending || this.entryDialog.open || this.rankingDialog.open;
  }

  offerScore(score, coins, mode = 'infinite') {
    if (this.pending) return;
    this.pending = { score, coins, mode };
    this.form.reset();
    this.submit.disabled = true;
    $('score-error').textContent = '';
    $('final-score').textContent = mode === 'story'
      ? `${coins.toLocaleString('es-AR')} monedas en el modo historia`
      : `${score.toLocaleString('es-AR')} puntos · ${coins.toLocaleString('es-AR')} monedas`;
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

  openRanking(savedId = null, mode = this.mode) {
    this.mode = mode;
    const story = mode === 'story';
    $('ranking-title').textContent = story ? '🏆 Ranking · Modo historia' : '🏆 Ranking';
    $('rank-tab-infinite').setAttribute('aria-pressed', String(!story));
    $('rank-tab-story').setAttribute('aria-pressed', String(story));
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
  }
}
