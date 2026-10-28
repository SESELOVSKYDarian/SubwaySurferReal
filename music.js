const TRACK = new URL('./assets/audio/mi-perro-dinamita-8bit.mp3', import.meta.url).href;

export class GameMusic {
  constructor(audio = new Audio(TRACK)) {
    this.audio = audio;
    audio.loop = true;
    audio.preload = 'none';
    this.state = 'ready';
    this.blocked = false;
    this.enabled = true;
    this.volume = .55;
    this.pending = false;
    this.needsInteraction = false;
  }

  setPreferences(enabled, volume) {
    this.enabled = !!enabled;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .55;
    this.audio.muted = !this.enabled;
    this.audio.volume = this.volume * .35;
    this.apply();
  }

  update(state, blocked = false) {
    if (state !== this.state && (state === 'ready' || state === 'over')) this.audio.currentTime = 0;
    this.state = state;
    this.blocked = blocked;
    this.apply();
  }

  unlock() {
    this.needsInteraction = false;
    this.apply();
  }

  shouldPlay() {
    return this.enabled && this.volume > 0 && this.state === 'playing' && !this.blocked;
  }

  apply() {
    if (!this.shouldPlay()) {
      if (!this.audio.paused) this.audio.pause();
      return;
    }
    if (!this.audio.paused || this.pending || this.needsInteraction) return;
    this.pending = true;
    try {
      Promise.resolve(this.audio.play()).catch(error => {
        if (error?.name !== 'AbortError') this.needsInteraction = true;
      }).finally(() => {
        this.pending = false;
        // Una pausa o un video pueden comenzar mientras play() sigue pendiente.
        if (!this.shouldPlay()) this.audio.pause();
      });
    } catch {
      this.pending = false;
      this.needsInteraction = true;
    }
  }
}
