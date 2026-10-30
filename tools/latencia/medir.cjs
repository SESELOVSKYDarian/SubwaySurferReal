// Mide la latencia del seguimiento con la cámara virtual de gestos (gestos.y4m).
// Uso (con el juego servido en http://127.0.0.1:8000):
//   python3 tools/latencia/make_gestures_y4m.py assets/characters/source/estanga/reference-sheet.png tools/latencia/gestos.y4m
//   node tools/latencia/medir.cjs 75 tools/latencia/resultado.json
//   python3 tools/latencia/analizar.py tools/latencia/gestos.y4m.json tools/latencia/resultado.json
// Variables opcionales: NOPLAY=1 (sin partida), TIER=0|1|2 (fija el nivel del detector).
const fs = require('node:fs');
const { chromium } = require('playwright');
const [SECS = '60', OUT = __dirname + '/resultado.json', URL = 'http://127.0.0.1:8000/'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${__dirname}/gestos.y4m`] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // Cada evento del seguimiento se anota con el cuadro que mostraba la cámara en ese instante.
  await p.route('**/main.js', async r => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()) + `
const __c = document.createElement('canvas'); __c.width = 180; __c.height = 30; const __x = __c.getContext('2d', { willReadFrequently: true });
window.__frame = () => { const v = document.getElementById('video'); if (!v.videoWidth) return -1; __x.drawImage(v, 0, 0, 180, 30, 0, 0, 180, 30); const d = __x.getImageData(0, 0, 180, 30).data; let n = 0; for (let b = 0; b < 10; b++) { const i = (12 * 180 + 12 + 16 * b) * 4; if (d[i] + d[i + 1] + d[i + 2] > 384) n |= 1 << b; } return n; };
window.__ev = [];
for (const k of ['onJump', 'onDuck', 'onDuckEnd', 'onLane', 'onLost', 'onCalibrated']) { const o = poseHandlers[k]; poseHandlers[k] = (...a) => { window.__ev.push([k, window.__frame(), Math.round(performance.now()), a[0] ?? '']); return o?.(...a); }; }
window.__pose = () => pose; window.__game = game;` .replace('if (overlay.classList.contains(\'hidden\')) game.update((now - last) / 1000);',
      process.env.CAP30 ? 'if (overlay.classList.contains(\'hidden\')) { if (now - (window.__lr || 0) >= 30) { game.update((now - (window.__lr || now)) / 1000); window.__lr = now; } }' : 'if (overlay.classList.contains(\'hidden\')) game.update((now - last) / 1000);') });
  });
  // Experimentos: se modifican los archivos solo en este navegador (el repo no cambia).
  const TIER = process.env.TIER, POSES = process.env.POSES, NOCROP = process.env.NOCROP;
  if (TIER || POSES || NOCROP) {
    await p.route('**/pose.js', async r => { const res = await r.fetch(); let t = await res.text();
      if (TIER) t = t.replace("worker.postMessage({ type: 'init', tier: 0 })", `worker.postMessage({ type: 'init', tier: ${TIER} })`).replace('const TIER_BUDGET_MS = 45;', 'const TIER_BUDGET_MS = 1e9;');
      if (NOCROP) t = t.replace('if (!this.trackReady || !this.track', 'if (true || !this.track');
      r.fulfill({ response: res, body: t }); });
    if (POSES) await p.route('**/pose-worker.js', async r => { const res = await r.fetch(); let t = await res.text();
      t = t.replace(/const SEARCH = \{ runningMode: 'VIDEO', numPoses: \d/, `const SEARCH = { runningMode: 'VIDEO', numPoses: ${POSES}`);
      r.fulfill({ response: res, body: t }); });
  }
  await p.goto(URL); await p.waitForSelector('#return-menu', { state: 'attached', timeout: 300000 });
  await p.evaluate(() => document.querySelector('#camBtn').click());
  if (!process.env.NOPLAY) await p.evaluate(() => document.querySelector('#playBtn').click());
  if (process.env.LOWGPU) await p.evaluate(() => { const g = window.__game; g.setQuality('balanced'); g.pixelRatio = 0.75; g.renderer.setPixelRatio(0.75); g.sun.castShadow = false; g.quality = 'manual'; });
  const t0 = Date.now();
  await p.waitForFunction(() => window.__ev.some(e => e[0] === 'onCalibrated'), null, { timeout: 300000 });
  console.log('calibrado a', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const stats = [];
  const end = Date.now() + Number(SECS) * 1000;
  while (Date.now() < end) { await p.waitForTimeout(2000); stats.push(await p.evaluate(() => { const s = window.__pose()?.stats || {}; return { fps: s.fps, ms: s.ms, lat: s.latency, mode: window.__pose()?.mode }; })); }
  const ev = await p.evaluate(() => window.__ev);
  fs.writeFileSync(OUT, JSON.stringify({ ev, stats, errs }, null, 1));
  console.log('eventos', ev.length, 'errores', errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
