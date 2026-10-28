// Modo historia: video de intro → corrida a casa → video de la entrada (agarra el
// guardapolvo, sin mostrar la casa) → vuelta a la Técnica como en el modo infinito →
// video de victoria. Si choca en la ida o en la vuelta: video de derrota y vuelve a casa.
// El puntaje es la cantidad de monedas juntadas en el recorrido completo.
const $ = id => document.getElementById(id);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ?storyHome=40&storySchool=120 acorta los tramos para probar el flujo completo.
const query = new URLSearchParams(globalThis.location?.search ?? '');

export const STORY = Object.freeze({
  homeAt: Number(query.get('storyHome')) || 650,         // metros hasta la casa (sobre Juan B. Justo)
  schoolAt: Number(query.get('storySchool')) || 2004,    // frente a la E.E.T. Nº 5, último lote del recorrido
  videos: Object.freeze({
    intro: 'assets/story/video/intro.mp4',
    pickup: 'assets/story/video/pickup.mp4',
    victory: 'assets/videos/final-victoria.mp4',
    defeat: 'assets/videos/final-derrota.mp4',
  }),
  titles: Object.freeze({
    intro: 'Intro', pickup: 'Agarrás el guardapolvo', victory: '¡Llegaste a tiempo!', defeat: 'No llegaste',
  }),
});

export class StoryMode {
  constructor({ game, session, leaderboard, showMenu, flash, sound }) {
    Object.assign(this, { game, session, leaderboard, showMenu, flash, sound });
    this.active = false;
    this.phase = null;
    this.token = 0;
    this.skipVideo = null;
    window.addEventListener('keydown', event => {
      if (!this.skipVideo) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (['Escape', 'Enter', 'Space'].includes(event.code)) this.skipVideo();
    }, true);
    $('story-skip').addEventListener('click', () => this.skipVideo?.());
  }

  get videoOpen() { return !!this.skipVideo; }

  alive(token) { return this.active && token === this.token; }

  // Reproduce un video a pantalla completa. Si el archivo todavía no existe muestra
  // un cartel y sigue, así el recorrido se puede probar antes de tener los videos.
  playVideo(name) {
    const root = $('story-video'), player = $('story-player'), note = $('story-missing');
    note.textContent = '';
    note.hidden = true;
    root.classList.remove('hidden');
    return new Promise(resolve => {
      let done = false, timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        player.onended = player.onerror = null;
        player.pause();
        player.removeAttribute('src');
        player.load();
        root.classList.add('hidden');
        this.skipVideo = null;
        resolve();
      };
      this.skipVideo = finish;
      player.onended = finish;
      player.onerror = () => {
        note.textContent = `${STORY.titles[name]} · falta el video ${STORY.videos[name]}`;
        note.hidden = false;
        timer = setTimeout(finish, 2400);
      };
      player.src = STORY.videos[name];
      player.currentTime = 0;
      player.play().catch(error => {
        if (error?.name === 'NotAllowedError') { player.muted = true; player.play().catch(() => {}); }
      });
    });
  }

  async fade(on) {
    $('story-fade').classList.toggle('on', on);
    await wait(on ? 700 : 500);
  }

  hud() {
    const show = this.active && ['ida', 'vuelta'].includes(this.phase);
    $('story-hud').classList.toggle('hidden', !show);
    if (show) $('story-label').textContent = this.phase === 'ida' ? 'CAMINO A CASA' : 'VOLVÉ A LA TÉCNICA';
  }

  updateHud() {
    if (!this.active || $('story-hud').classList.contains('hidden')) return;
    const start = this.phase === 'ida' ? 0 : STORY.homeAt;
    const end = this.phase === 'ida' ? STORY.homeAt : STORY.schoolAt;
    const fraction = Math.max(0, Math.min(1, (this.game.distance - start) / (end - start)));
    $('story-fill').style.width = `${fraction * 100}%`;
    $('story-coins').textContent = `🪙 ${this.game.coinCount}`;
  }

  async start() {
    const token = ++this.token;
    this.active = true;
    this.phase = 'intro';
    $('overlay').classList.add('hidden');
    this.game.reset();
    await this.playVideo('intro');
    if (!this.alive(token)) return;
    this.beginHomeLeg();
  }

  beginHomeLeg() {
    this.phase = 'ida';
    this.game.reset();
    this.game.legEnd = STORY.homeAt;
    this.hud();
    this.sound('start');
    this.session.request();
  }

  // Llegó al punto de la casa: no se muestra la casa, solo la entrada y el video.
  async onLegEnd() {
    const token = this.token;
    if (!this.active) return;
    if (this.phase === 'ida') {
      this.phase = 'pickup';
      this.hud();
      this.flash('¡LLEGASTE A CASA! 🏠', '#ffd84a');
      await wait(900);
      await this.fade(true);
      if (!this.alive(token)) return;
      await this.playVideo('pickup');
      if (!this.alive(token)) return;
      this.phase = 'vuelta';
      this.game.clearTrack();
      this.game.legEnd = STORY.schoolAt;
      this.hud();
      await this.fade(false);
      if (!this.alive(token)) return;
      this.flash('¡Tenés el guardapolvo! Volvé a la Técnica', '#7dff9a');
      this.game.start();
    } else if (this.phase === 'vuelta') {
      const coins = this.game.coinCount;
      this.phase = 'victory';
      this.hud();
      await this.fade(true);
      if (!this.alive(token)) return;
      await this.playVideo('victory');
      if (!this.alive(token)) return;
      this.active = false;
      await this.fade(false);
      this.game.reset();
      this.leaderboard.offerScore(coins, coins, 'story');
    }
  }

  // Chocó o lo atrapó el profesor: video de derrota y de vuelta a casa (monedas en cero).
  async onCrash() {
    const token = this.token;
    if (!this.active) return;
    this.game.legEnd = null;
    this.phase = 'defeat';
    this.hud();
    await wait(900);
    await this.fade(true);
    if (!this.alive(token)) return;
    await this.playVideo('defeat');
    if (!this.alive(token)) return;
    await this.fade(false);
    if (!this.alive(token)) return;
    this.beginHomeLeg();
  }

  cancel() {
    this.token++;
    this.active = false;
    this.phase = null;
    this.game.legEnd = null;
    this.skipVideo?.();
    $('story-fade').classList.remove('on');
    $('story-hud').classList.add('hidden');
  }
}
