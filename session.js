// Única cuenta atrás para inicio, pausa y recuperación del seguimiento.
export class PlaySession {
  constructor(game, show, hide, timer = { set: (fn) => setTimeout(fn, 1000), clear: (id) => clearTimeout(id) }) {
    Object.assign(this, { game, show, hide, timer });
    this.camera = false; this.ready = false; this.pending = false; this.manual = false;
  }
  cancel() { this.timer.clear(this.tick); this.tick = null; }
  request() {
    if (this.game.state === 'playing' || this.pending) return;
    this.pending = true; this.manual = false;
    this.advance();
  }
  tracking(ready) {
    this.camera = true; this.ready = ready;
    if (!ready) {
      this.cancel();
      if (this.game.state === 'playing') { this.game.pause(); this.pending = true; }
      if (this.pending) this.show('⏸ Calibrando', 'Ponte en el centro y quédate quieto');
    } else if (this.pending && !this.manual) this.advance();
  }
  advance(n = 3) {
    this.cancel();
    if (this.camera && !this.ready) {
      this.show('⏸ Calibrando', 'Necesito ver tus hombros y cadera con claridad'); return;
    }
    if (!n) {
      this.pending = false; this.hide();
      if (this.game.state === 'paused') this.game.resume(); else this.game.start();
      return;
    }
    this.show(String(n), '¡Prepárate!', true);
    this.tick = this.timer.set(() => this.advance(n - 1));
  }
  togglePause() {
    if (this.manual) { this.manual = false; this.pending = true; this.advance(); }
    else if (this.game.state === 'playing' || this.pending) {
      this.cancel(); this.game.pause(); this.pending = false; this.manual = true;
      this.show('⏸ Pausa', 'Pulsa P para seguir');
    }
  }
}
