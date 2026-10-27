// Texturas de calle, paredones y veredas en escala real (canvas, sin descargas).
// Usan azar sembrado: el recorrido se ve igual en cada partida y en las pruebas.
import * as THREE from 'three';

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function colorTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

// Mapa de relieve (gris lineal) derivado del mismo dibujo.
function dataTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

function noise(g, w, h, amount, random) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Repite un trazo en los bordes: textura continua al repetirse.
function tiled(w, h, draw) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    draw(dx, dy);
  }
}

function blotches(g, w, h, random, count, size, colors) {
  for (let i = 0; i < count; i++) {
    const x = random() * w, y = random() * h, r = size * (.4 + random());
    const color = colors[Math.floor(random() * colors.length)];
    tiled(w, h, (dx, dy) => {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
}

const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// Paredón de hormigón encofrado: 6 m × 3,6 m por repetición (1024 × 512 px).
// Juntas de tongada cada 1,2 m, juntas de paño cada 3 m, pasadores cada 0,6 m,
// chorreaduras desde el coronamiento y base húmeda con verdín y salitre.
export function retainingWall() {
  return once('wall', () => {
    const W = 1024, H = 512, random = seeded(4471);
    const px = W / 6, py = H / 3.6;
    const [c, g] = canvas(W, H);
    const [b, bg] = canvas(W, H);
    g.fillStyle = '#b1ab9f';
    g.fillRect(0, 0, W, H);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, W, H);
    blotches(g, W, H, random, 26, 120, ['rgba(120,112,100,.18)', 'rgba(196,190,178,.2)', 'rgba(92,90,84,.14)']);
    // Vetas horizontales de las tablas del encofrado (0,15 m).
    for (let y = 0; y < H; y += py * .15) {
      g.fillStyle = `rgba(70,66,60,${.04 + random() * .05})`;
      g.fillRect(0, y, W, 1.5);
    }
    // Juntas de tongada y de paño.
    for (const m of [1.2, 2.4]) {
      const y = H - m * py;
      g.fillStyle = 'rgba(52,50,46,.55)';
      g.fillRect(0, y - 2, W, 3);
      g.fillStyle = 'rgba(225,220,208,.35)';
      g.fillRect(0, y + 1, W, 2);
      bg.fillStyle = '#3a3a3a';
      bg.fillRect(0, y - 2, W, 4);
    }
    for (const m of [0, 3]) {
      const x = m * px;
      for (const dx of [0, W]) {
        g.fillStyle = 'rgba(48,46,42,.6)';
        g.fillRect(x + dx - 2, 0, 3, H);
        bg.fillStyle = '#303030';
        bg.fillRect(x + dx - 2, 0, 4, H);
      }
    }
    // Pasadores de encofrado tapados con mortero.
    for (let mx = .3; mx < 6; mx += .6) for (let my = .6; my < 3.5; my += .6) {
      const x = mx * px, y = H - my * py;
      g.fillStyle = 'rgba(60,58,54,.7)';
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(210,205,194,.5)';
      g.beginPath(); g.arc(x - .8, y - .8, 1.6, 0, Math.PI * 2); g.fill();
      bg.fillStyle = '#4a4a4a';
      bg.beginPath(); bg.arc(x, y, 3.5, 0, Math.PI * 2); bg.fill();
    }
    // Chorreaduras de lluvia desde el coronamiento.
    for (let i = 0; i < 70; i++) {
      const x = random() * W, w = 3 + random() * 16, len = H * (.15 + random() * .75);
      const dark = random() < .78;
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, dark ? `rgba(62,58,50,${.08 + random() * .13})` : 'rgba(238,234,224,.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      tiled(W, 0, dx => g.fillRect(x + dx, 0, w, len));
    }
    // Base húmeda, verdín y salitre.
    const damp = g.createLinearGradient(0, H - .55 * py, 0, H);
    damp.addColorStop(0, 'rgba(60,62,48,0)');
    damp.addColorStop(1, 'rgba(48,52,38,.55)');
    g.fillStyle = damp;
    g.fillRect(0, H - .55 * py, W, .55 * py);
    blotches(g, W, H * .14, random, 22, 28, ['rgba(74,92,46,.35)', 'rgba(60,72,40,.3)']);
    g.save(); g.translate(0, H * .86);
    blotches(g, W, H * .14, random, 22, 28, ['rgba(74,92,46,.35)', 'rgba(60,72,40,.3)']);
    g.restore();
    for (let i = 0; i < 30; i++) {
      const x = random() * W, y = H - (.35 + random() * .25) * py;
      g.fillStyle = `rgba(232,230,222,${.12 + random() * .18})`;
      g.fillRect(x, y, 10 + random() * 40, 2 + random() * 4);
    }
    // Descascarados con el árido a la vista.
    for (let i = 0; i < 9; i++) {
      const x = random() * W, y = random() * H * .9, r = 6 + random() * 14;
      g.fillStyle = 'rgba(128,120,108,.55)';
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, rr = r * (.6 + random() * .5);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * .7);
      }
      g.fill();
      bg.fillStyle = '#5a5a5a';
      bg.beginPath(); bg.arc(x, y, r * .8, 0, Math.PI * 2); bg.fill();
    }
    noise(g, W, H, 18, random);
    noise(bg, W, H, 26, random);
    return { map: colorTexture(c), bump: dataTexture(b) };
  });
}

// Baldosa de vereda de 9 panes, 20 × 20 cm: 1 m × 1 m por repetición (512 px).
export function sidewalk() {
  return once('sidewalk', () => {
    const S = 512, random = seeded(907), tile = S / 5, pane = tile / 3;
    const [c, g] = canvas(S, S);
    const [b, bg] = canvas(S, S);
    g.fillStyle = '#6f6a62';
    g.fillRect(0, 0, S, S);
    bg.fillStyle = '#202020';
    bg.fillRect(0, 0, S, S);
    for (let ty = 0; ty < 5; ty++) for (let tx = 0; tx < 5; tx++) {
      const x0 = tx * tile, y0 = ty * tile;
      const tone = 150 + random() * 26, warm = random() * 8;
      const stained = random() < .12;
      for (let py = 0; py < 3; py++) for (let px = 0; px < 3; px++) {
        const x = x0 + px * pane + 3, y = y0 + py * pane + 3, w = pane - 6;
        const v = tone + (random() - .5) * 8 - (stained ? 28 : 0);
        const grd = g.createLinearGradient(x, y, x + w, y + w);
        grd.addColorStop(0, `rgb(${v + 14 + warm},${v + 12},${v + 4})`);
        grd.addColorStop(1, `rgb(${v - 16 + warm},${v - 17},${v - 22})`);
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(x, y, w, w, 5);
        g.fill();
        const bump = bg.createRadialGradient(x + w / 2, y + w / 2, 2, x + w / 2, y + w / 2, w * .7);
        bump.addColorStop(0, '#d8d8d8');
        bump.addColorStop(1, '#8a8a8a');
        bg.fillStyle = bump;
        bg.beginPath(); bg.roundRect(x, y, w, w, 5); bg.fill();
      }
      // Junta de la baldosa más marcada que la de los panes.
      g.strokeStyle = 'rgba(58,54,48,.85)';
      g.lineWidth = 3;
      g.strokeRect(x0 + 1.5, y0 + 1.5, tile - 3, tile - 3);
      if (random() < .1) {
        g.strokeStyle = 'rgba(40,38,34,.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        let x = x0 + random() * tile, y = y0;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (random() - .5) * 18; y += tile / 5; g.lineTo(x, y); }
        g.stroke();
      }
    }
    blotches(g, S, S, random, 14, 40, ['rgba(70,64,54,.16)', 'rgba(220,214,200,.12)']);
    noise(g, S, S, 12, random);
    return { map: colorTexture(c), bump: dataTexture(b) };
  });
}

// Calzada completa de 12,8 m de ancho por 8 m de largo (1024 × 640 px, 80 px/m).
// Huellas de rodadura por carril, juntas selladas con brea, cordón cuneta de
// hormigón junto a la vereda y polvo acumulado. Todo continuo al repetir en z.
export const ROAD_WIDTH = 12.8;
export const ROAD_PERIOD = 8;
export function roadSurface(laneCenters = [-2.2, 0, 2.2], gutter = 3.75) {
  return once('road', () => {
    const W = 1024, H = 640, m = W / ROAD_WIDTH, random = seeded(2203);
    const X = x => (x + ROAD_WIDTH / 2) * m;
    const [c, g] = canvas(W, H);
    const [r, rg] = canvas(W, H);
    g.fillStyle = '#3d3e40';
    g.fillRect(0, 0, W, H);
    rg.fillStyle = '#f0f0f0';
    rg.fillRect(0, 0, W, H);
    // Árido: granos claros y oscuros.
    for (let i = 0; i < 52000; i++) {
      const v = 30 + random() * 80;
      g.fillStyle = `rgba(${v},${v},${v + 2},${.25 + random() * .35})`;
      g.fillRect(random() * W, random() * H, .6 + random() * 1.6, .6 + random() * 1.6);
    }
    blotches(g, W, H, random, 40, 70, ['rgba(20,20,22,.18)', 'rgba(96,94,90,.12)']);
    // Huellas de rodadura: más oscuras y algo más lisas (brillan un poco).
    for (const lane of laneCenters) for (const side of [-.82, .82]) {
      const x = X(lane + side), w = .42 * m;
      const grd = g.createLinearGradient(x - w, 0, x + w, 0);
      grd.addColorStop(0, 'rgba(18,18,20,0)');
      grd.addColorStop(.5, 'rgba(18,18,20,.32)');
      grd.addColorStop(1, 'rgba(18,18,20,0)');
      g.fillStyle = grd;
      g.fillRect(x - w, 0, w * 2, H);
      const rough = rg.createLinearGradient(x - w, 0, x + w, 0);
      rough.addColorStop(0, 'rgba(150,150,150,0)');
      rough.addColorStop(.5, 'rgba(150,150,150,.8)');
      rough.addColorStop(1, 'rgba(150,150,150,0)');
      rg.fillStyle = rough;
      rg.fillRect(x - w, 0, w * 2, H);
    }
    // Manchas de aceite en el centro de cada carril.
    for (const lane of laneCenters) for (let i = 0; i < 2; i++) {
      const x = X(lane + (random() - .5) * .5), y = random() * H, rr = 10 + random() * 26;
      tiled(0, H, (dx, dy) => {
        const grd = g.createRadialGradient(x, y + dy, 0, x, y + dy, rr);
        grd.addColorStop(0, 'rgba(10,10,12,.16)');
        grd.addColorStop(1, 'rgba(10,10,12,0)');
        g.fillStyle = grd;
        g.fillRect(x - rr, y + dy - rr, rr * 2, rr * 2);
        rg.fillStyle = 'rgba(70,70,70,.5)';
        rg.beginPath(); rg.arc(x, y + dy, rr * .7, 0, Math.PI * 2); rg.fill();
      });
    }
    // Fisuras selladas con brea: brillantes y algo más anchas que una grieta.
    const seam = (x, y, steps, dxMax, dyStep, width) => {
      tiled(0, H, (dx, dy) => {
        g.strokeStyle = 'rgba(14,14,15,.8)';
        g.lineWidth = width;
        g.lineJoin = 'round';
        rg.strokeStyle = 'rgba(60,60,60,.9)';
        rg.lineWidth = width;
        const local = seeded(Math.floor(x * 97 + y));
        g.beginPath(); rg.beginPath();
        let px = x, py = y + dy;
        g.moveTo(px, py); rg.moveTo(px, py);
        for (let k = 0; k < steps; k++) {
          px += (local() - .5) * dxMax;
          py += dyStep * (.6 + local() * .8);
          g.lineTo(px, py); rg.lineTo(px, py);
        }
        g.stroke(); rg.stroke();
      });
    };
    for (let i = 0; i < 7; i++) seam(X(-5.6 + random() * 11.2), random() * H, 14, 16, 22, 2.5 + random() * 2.5);
    for (let i = 0; i < 2; i++) {
      const y = random() * H, x0 = X(-6 + random() * 3);
      g.strokeStyle = 'rgba(14,14,15,.75)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y);
      let x = x0, yy = y;
      for (let k = 0; k < 20; k++) { x += 20 + random() * 18; yy += (random() - .5) * 8; g.lineTo(x, yy); }
      g.stroke();
    }
    // Polvo y hojas cerca del cordón cuneta.
    for (const s of [-1, 1]) {
      const edge = X(s * gutter);
      const grd = g.createLinearGradient(edge - s * .9 * m, 0, edge, 0);
      grd.addColorStop(0, 'rgba(120,110,92,0)');
      grd.addColorStop(1, 'rgba(120,110,92,.35)');
      g.fillStyle = grd;
      g.fillRect(Math.min(edge, edge - s * .9 * m), 0, .9 * m, H);
      for (let i = 0; i < 160; i++) {
        const x = edge - s * random() * .5 * m, y = random() * H;
        g.fillStyle = random() < .3 ? `rgba(110,86,44,${.4 + random() * .4})` : `rgba(150,140,120,${.25 + random() * .3})`;
        g.fillRect(x, y, 1 + random() * 3, 1 + random() * 2);
      }
      // Cordón cuneta de hormigón (0,45 m) con juntas cada 3 m... cada 2 m en 8 m.
      const cx = X(s * (gutter - .225));
      g.fillStyle = '#8a857a';
      g.fillRect(cx - .225 * m, 0, .45 * m, H);
      rg.fillStyle = '#e8e8e8';
      rg.fillRect(cx - .225 * m, 0, .45 * m, H);
      for (let y = 0; y < H; y += 2 * m) {
        g.fillStyle = 'rgba(52,50,46,.8)';
        g.fillRect(cx - .225 * m, y, .45 * m, 2);
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(${60 + random() * 40},${58 + random() * 36},${50 + random() * 30},.35)`;
        g.fillRect(cx - .22 * m + random() * .44 * m, random() * H, 1 + random() * 4, 1 + random() * 6);
      }
    }
    noise(g, W, H, 10, random);
    return { map: colorTexture(c), roughness: dataTexture(r) };
  });
}

// Atlas de detalles de calzada (512 × 512): tapa de cloaca, rejilla pluvial,
// bacheo y mancha de aceite. Cada cuarto se usa en un plano con alfa recortado.
export const DECAL_RECTS = {
  manhole: [0, .5, .5, 1],
  grate: [.5, .5, 1, 1],
  patch: [0, 0, .5, .5],
  stain: [.5, 0, 1, .5],
};
export function roadDecals() {
  return once('decals', () => {
    const S = 512, h = S / 2, random = seeded(5531);
    const [c, g] = canvas(S, S);
    g.clearRect(0, 0, S, S);
    // Tapa de cloaca de hierro (arriba a la izquierda).
    const cx = h / 2, cy = h / 2;
    g.fillStyle = '#4a4a46';
    g.beginPath(); g.arc(cx, cy, 116, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2b29';
    g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#575651';
    g.lineWidth = 6;
    for (let r = 26; r < 104; r += 22) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
      g.lineTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100); g.stroke();
    }
    g.fillStyle = '#7a776e';
    g.font = 'bold 22px Arial';
    g.textAlign = 'center';
    g.fillText('OSSE', cx, cy + 8);
    // Rejilla pluvial (arriba a la derecha): barras de hierro sobre fondo oscuro.
    g.fillStyle = '#5b5a55';
    g.fillRect(h + 24, 70, h - 48, 116);
    g.fillStyle = '#0d0e0e';
    g.fillRect(h + 34, 80, h - 68, 96);
    g.fillStyle = '#4e4d48';
    for (let x = h + 40; x < S - 34; x += 18) g.fillRect(x, 80, 8, 96);
    g.fillRect(h + 34, 124, h - 68, 8);
    // Bacheo (abajo a la izquierda): asfalto más nuevo y más oscuro, borde sellado.
    g.save();
    g.beginPath();
    g.moveTo(30, 40 + h); g.lineTo(220, 28 + h); g.lineTo(232, 210 + h); g.lineTo(40, 222 + h); g.closePath();
    // Semitransparente: un poco más oscuro y liso que la calzada, sin recorte duro.
    g.fillStyle = 'rgba(34,35,37,.55)'; g.fill();
    g.clip();
    for (let i = 0; i < 4000; i++) {
      const v = 25 + random() * 45;
      g.fillStyle = `rgba(${v},${v},${v},.25)`;
      g.fillRect(random() * h, h + random() * h, 1.5, 1.5);
    }
    g.restore();
    g.strokeStyle = 'rgba(12,12,13,.55)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(30, 40 + h); g.lineTo(220, 28 + h); g.lineTo(232, 210 + h); g.lineTo(40, 222 + h); g.closePath(); g.stroke();
    // Mancha de aceite (abajo a la derecha).
    const grd = g.createRadialGradient(h + h / 2, h + h / 2, 4, h + h / 2, h + h / 2, 110);
    grd.addColorStop(0, 'rgba(8,8,10,.32)');
    grd.addColorStop(.6, 'rgba(14,14,18,.14)');
    grd.addColorStop(1, 'rgba(14,14,18,0)');
    g.fillStyle = grd;
    g.fillRect(h, h, h, h);
    const t = colorTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Medianera revocada y pintada, con manchas de humedad: se tiñe con el color
// del edificio y tolera el estiramiento de cada volumen.
export function partyWall() {
  return once('party', () => {
    const W = 256, H = 512, random = seeded(311);
    const [c, g] = canvas(W, H);
    g.fillStyle = '#e4e0d8';
    g.fillRect(0, 0, W, H);
    blotches(g, W, H, random, 30, 50, ['rgba(150,140,124,.18)', 'rgba(255,255,255,.2)', 'rgba(120,112,100,.12)']);
    for (let i = 0; i < 40; i++) {
      const x = random() * W, w = 2 + random() * 10, len = H * (.1 + random() * .5);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(90,84,74,${.08 + random() * .14})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, w, len);
    }
    const damp = g.createLinearGradient(0, H * .82, 0, H);
    damp.addColorStop(0, 'rgba(80,76,64,0)');
    damp.addColorStop(1, 'rgba(80,76,64,.35)');
    g.fillStyle = damp;
    g.fillRect(0, H * .82, W, H * .18);
    noise(g, W, H, 14, random);
    return colorTexture(c);
  });
}

// Fachada lejana de torre de departamentos: grilla de ventanas y balcones.
export function towerFacade() {
  return once('tower', () => {
    const W = 256, H = 256, random = seeded(77);
    const [c, g] = canvas(W, H);
    g.fillStyle = '#d6d2c9';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const lit = random();
      g.fillStyle = lit < .15 ? '#e8d3a0' : lit < .55 ? '#465462' : '#5d6c79';
      g.fillRect(x * 64 + 10, y * 64 + 14, 44, 30);
      g.fillStyle = 'rgba(70,66,60,.55)';
      g.fillRect(x * 64 + 4, y * 64 + 46, 56, 6);
    }
    noise(g, W, H, 10, random);
    return colorTexture(c);
  });
}

// Atlas de mobiliario urbano (1024 × 1024): ocho afiches pegados, cartel de
// parada con las tres líneas, señales de tránsito y muestras de color para el
// refugio, el banco y los cestos. Todo el mobiliario de un tramo usa este único
// material. Rectángulos en píxeles [x, y, ancho, alto].
export const ATLAS = {
  posters: Array.from({ length: 8 }, (_, i) => [(i % 4) * 256, Math.floor(i / 4) * 352, 256, 352]),
  stopSign: [0, 704, 256, 320],
  speed: [256, 704, 192, 192],
  noParking: [448, 704, 192, 192],
  adPanel: [640, 704, 256, 320],
  swatch: name => {
    const order = ['frame', 'roof', 'glass', 'wood', 'bin', 'binDark', 'pole', 'concrete'];
    const k = order.indexOf(name);
    return [896 + (k % 2) * 64, 704 + Math.floor(k / 2) * 64, 64, 64];
  },
};
const SWATCHES = { frame: '#3b4146', roof: '#d9dcd8', glass: '#5d7280', wood: '#8a6340', bin: '#2f6b3c', binDark: '#1d2a22', pole: '#7d8387', concrete: '#a8a39a' };
const POSTERS = [
  { bg: '#e9442f', fg: '#fff3d6', top: 'RECITAL', mid: 'EN EL PUERTO', foot: 'SÁBADO 21 H · ENTRADA LIBRE' },
  { bg: '#1e4f9c', fg: '#ffd84a', top: 'FERIA', mid: 'DE ARTESANOS', foot: 'PLAZA ROCHA · DOMINGOS' },
  { bg: '#f4e9cf', fg: '#202020', top: 'CLASES', mid: 'MATEMÁTICA · FÍSICA', foot: 'APOYO ESCOLAR · 223 555 0182' },
  { bg: '#ffd400', fg: '#151515', top: 'SE ALQUILA', mid: 'LOCAL', foot: 'JUAN B. JUSTO · 223 555 0147' },
  { bg: '#24865a', fg: '#ffffff', top: 'TALLER', mid: 'DE ROBÓTICA', foot: 'E.E.T. Nº 5 · INSCRIPCIÓN ABIERTA' },
  { bg: '#7a2a7f', fg: '#ffe7f4', top: 'MURGA', mid: 'LOS DEL BARRIO', foot: 'ENSAYOS · VIERNES 20 H' },
  { bg: '#121418', fg: '#ff7a1a', top: 'CUMBIA', mid: 'BAILE · DJ', foot: 'CLUB SOCIAL · SÁBADO' },
  { bg: '#e8e8e2', fg: '#c3262e', top: 'TORNERÍA', mid: 'REPUESTOS', foot: 'ENVÍOS · 223 555 0110' },
];

export function streetAtlas() {
  return once('atlas', () => {
    const S = 1024, random = seeded(8123);
    const [c, g] = canvas(S, S);
    g.clearRect(0, 0, S, S);
    const fit = (text, max, weight, family = 'Arial, sans-serif') => {
      let size = 80;
      do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > max && size > 12);
    };
    ATLAS.posters.forEach(([x, y, w, h], i) => {
      const p = POSTERS[i];
      g.save();
      g.beginPath();
      // Bordes rasgados y una esquina arrancada.
      g.moveTo(x + 6, y + 8);
      for (let k = 0; k <= 12; k++) g.lineTo(x + 6 + (w - 12) * k / 12, y + 6 + random() * 6);
      for (let k = 0; k <= 16; k++) g.lineTo(x + w - 6 - random() * 6, y + 6 + (h - 12) * k / 16);
      for (let k = 12; k >= 0; k--) g.lineTo(x + 6 + (w - 12) * k / 12, y + h - 6 - random() * 6 - (k < 4 && i % 3 === 0 ? 40 * (1 - k / 4) : 0));
      g.closePath();
      g.clip();
      g.fillStyle = p.bg;
      g.fillRect(x, y, w, h);
      g.fillStyle = p.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fit(p.top, w - 40, '900', '"Arial Black", Arial, sans-serif');
      g.fillText(p.top, x + w / 2, y + 78);
      fit(p.mid, w - 40, 'bold');
      g.fillText(p.mid, x + w / 2, y + 150);
      g.fillRect(x + 30, y + 196, w - 60, 6);
      g.font = 'bold 15px Arial, sans-serif';
      const words = p.foot.split(' · ');
      words.forEach((word, k) => g.fillText(word, x + w / 2, y + 236 + k * 24));
      // Papel envejecido: manchas, pliegues y goma.
      for (let k = 0; k < 18; k++) {
        g.fillStyle = `rgba(${random() < .5 ? '255,250,235' : '60,50,40'},${.04 + random() * .1})`;
        g.fillRect(x + random() * w, y + random() * h, 10 + random() * 60, 4 + random() * 40);
      }
      g.fillStyle = 'rgba(0,0,0,.08)';
      g.fillRect(x + w * .5, y, 2, h);
      g.restore();
    });
    // Cartel de parada: "PARADA" y las tres líneas con su color.
    {
      const [x, y, w, h] = ATLAS.stopSign;
      g.fillStyle = '#f3f3ee';
      g.fillRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = '#1d4f9c';
      g.fillRect(x + 8, y + 8, w - 16, 74);
      g.fillStyle = '#ffffff';
      g.font = '900 44px "Arial Black", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PARADA', x + w / 2, y + 46);
      [['542', '#b3202a'], ['720', '#1f7a3c'], ['563', '#1f56a6']].forEach(([line, color], k) => {
        g.fillStyle = color;
        g.beginPath(); g.roundRect(x + 30, y + 100 + k * 66, w - 60, 54, 10); g.fill();
        g.fillStyle = '#fff';
        g.font = '900 40px "Arial Black", Arial, sans-serif';
        g.fillText(line, x + w / 2, y + 128 + k * 66);
      });
      g.strokeStyle = '#3b4146';
      g.lineWidth = 6;
      g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    }
    // Velocidad máxima 40 y prohibido estacionar.
    const disc = ([x, y, w], draw) => {
      const cx = x + w / 2, cy = y + w / 2;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(cx, cy, w / 2 - 6, 0, Math.PI * 2); g.fill();
      draw(cx, cy, w / 2 - 6);
    };
    disc(ATLAS.speed, (cx, cy, r) => {
      g.strokeStyle = '#d0202a'; g.lineWidth = 22;
      g.beginPath(); g.arc(cx, cy, r - 11, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#141414'; g.font = '900 72px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('40', cx, cy + 4);
    });
    disc(ATLAS.noParking, (cx, cy, r) => {
      g.fillStyle = '#1f56a6';
      g.beginPath(); g.arc(cx, cy, r - 14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d0202a'; g.lineWidth = 22;
      g.beginPath(); g.arc(cx, cy, r - 11, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - r * .62, cy - r * .62); g.lineTo(cx + r * .62, cy + r * .62); g.stroke();
    });
    // Panel publicitario del refugio.
    {
      const [x, y, w, h] = ATLAS.adPanel;
      const grd = g.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, '#0c6fb1'); grd.addColorStop(1, '#0a2f55');
      g.fillStyle = grd; g.fillRect(x, y, w, h);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 46px "Arial Black", Arial, sans-serif'; g.fillText('MAR', x + w / 2, y + 90);
      g.fillText('DEL PLATA', x + w / 2, y + 140);
      g.font = 'bold 22px Arial, sans-serif'; g.fillText('TE ESPERA', x + w / 2, y + 190);
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x + w / 2, y + 255, 34, 0, Math.PI * 2); g.fill();
    }
    for (const [name, color] of Object.entries(SWATCHES)) {
      const [x, y, w, h] = ATLAS.swatch(name);
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    }
    const t = colorTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}
