const AUDIO_ROOT = new URL('./assets/audio/', import.meta.url);

function resolveTracks(names) {
  if (!Array.isArray(names)) return [];
  return [...new Set(names.filter(name => typeof name === 'string').flatMap(name => {
    try {
      const url = new URL(name, AUDIO_ROOT);
      return url.protocol === AUDIO_ROOT.protocol && url.origin === AUDIO_ROOT.origin &&
        url.pathname.startsWith(AUDIO_ROOT.pathname) && /\.mp3$/i.test(url.pathname) ? [url.href] : [];
    } catch { return []; }
  }))];
}

async function loadPlaylist() {
  const response = await fetch(new URL('playlist.json', AUDIO_ROOT), { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar la lista de música');
  return (await response.json()).tracks;
}

export class GameMusic {
  constructor(audio = new Audio(), { tracks = null, loader = loadPlaylist, random = Math.random } = {}) {
    this.audio = audio;
    this.tracks = resolveTracks(tracks);
    this.loaded = tracks !== null;
    this.loader = loader;
    this.random = random;
    this.loading = null;
    this.bag = [];
    this.failed = new Set();
    this.current = null;
    this.newRun = true;
    audio.loop = false;
    audio.preload = 'none';
    this.state = 'ready';
    this.blocked = false;
    this.enabled = true;
    this.volume = .55;
    this.pending = false;
    this.needsInteraction = false;
    audio.addEventListener?.('ended', () => {
      this.pickNext();
      this.apply();
    });
    audio.addEventListener?.('error', () => {
      if (audio.error?.code >= 2) this.failTrack(this.current);
    });
  }

  setPreferences(enabled, volume) {
    this.enabled = !!enabled;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .55;
    this.audio.muted = !this.enabled;
    this.audio.volume = this.volume * .35;
    this.apply();
  }

  update(state, blocked = false) {
    if (state !== this.state && (state === 'ready' || state === 'over')) {
      this.audio.currentTime = 0;
      this.newRun = true;
    }
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

  pickNext() {
    this.bag = this.bag.filter(track => !this.failed.has(track));
    if (!this.bag.length) {
      this.bag = this.tracks.filter(track => !this.failed.has(track));
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      const last = this.bag.length - 1;
      if (last > 0 && this.bag[last] === this.current) [this.bag[0], this.bag[last]] = [this.bag[last], this.bag[0]];
    }
    this.audio.pause();
    this.current = this.bag.pop() ?? null;
    if (this.current) {
      this.audio.src = this.current;
      this.audio.currentTime = 0;
      this.audio.loop = this.tracks.length - this.failed.size === 1;
    }
  }

  failTrack(track) {
    if (!track || track !== this.current || this.failed.has(track)) return;
    this.failed.add(track);
    this.pickNext();
    this.apply();
  }

  ensurePlaylist() {
    if (this.loading) return;
    this.loading = Promise.resolve().then(() => this.loader()).then(names => {
      this.tracks = resolveTracks(names);
    }).catch(() => {
      this.tracks = [];
    }).finally(() => {
      this.loaded = true;
      this.loading = null;
      this.apply();
    });
  }

  apply() {
    if (!this.shouldPlay()) {
      if (!this.audio.paused) this.audio.pause();
      return;
    }
    if (!this.loaded) { this.ensurePlaylist(); return; }
    if (this.tracks.length === this.failed.size) return;
    if (this.newRun || !this.current) {
      this.newRun = false;
      this.pickNext();
    }
    // El final puede llegar antes que el evento ended; esperar al cambio de tema.
    if (this.audio.ended || !this.audio.paused || this.pending || this.needsInteraction) return;
    this.pending = true;
    const track = this.current;
    try {
      Promise.resolve(this.audio.play()).catch(error => {
        if (track !== this.current || error?.name === 'AbortError') return;
        if (error?.name === 'NotAllowedError') this.needsInteraction = true;
        else this.failTrack(track);
      }).finally(() => {
        this.pending = false;
        this.apply();
      });
    } catch {
      this.pending = false;
      this.needsInteraction = true;
    }
  }
}
