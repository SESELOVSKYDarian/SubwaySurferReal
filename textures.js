// Texturas procedurales dibujadas en <canvas>: así no hace falta descargar imágenes.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Dibuja algo repitiéndolo en los bordes para que la textura sea "tileable"
function wrapped(w, h, x, y, r, draw) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const px = x + dx, py = y + dy;
      if (px > -r && px < w + r && py > -r && py < h + r) draw(px, py);
    }
  }
}

export function asphalt() {
  const [c,g]=makeCanvas(512,512);
  g.fillStyle='#34383a';g.fillRect(0,0,512,512);
  for(let i=0;i<18000;i++) {
    const value=Math.floor(rand(35,100));g.fillStyle=`rgba(${value},${value},${value},.45)`;
    g.fillRect(rand(0,512),rand(0,512),rand(.5,2),rand(.5,2));
  }
  g.strokeStyle='rgba(14,17,18,.55)';g.lineWidth=1.4;
  for(let i=0;i<7;i++) {g.beginPath();let x=rand(0,512),y=rand(0,512);g.moveTo(x,y);for(let k=0;k<5;k++){x+=rand(-17,17);y+=rand(5,23);g.lineTo(x,y);}g.stroke();}
  return toTexture(c);
}

export function gravel() {
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#4e463e';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = rand(2.5, 7), rot = Math.random() * Math.PI;
    const hue = rand(20, 45), sat = rand(4, 14), l = rand(30, 62);
    wrapped(S, S, x, y, r + 3, (px, py) => {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(px + 1.5, py + 1.8, r, r * 0.75, rot, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `hsl(${hue},${sat}%,${l}%)`;
      g.beginPath();
      g.ellipse(px, py, r, r * 0.75, rot, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `hsla(${hue},${sat}%,${l + 18}%,0.6)`;
      g.beginPath();
      g.ellipse(px - r * 0.3, py - r * 0.3, r * 0.4, r * 0.3, rot, 0, Math.PI * 2);
      g.fill();
    });
  }
  grain(g, S, S, 16);
  return toTexture(c);
}

export function wood() {
  const [c, g] = makeCanvas(256, 64);
  g.fillStyle = '#5a4030';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${pick(['30,18,10', '110,85,60', '70,50,35'])},${rand(0.2, 0.5)})`;
    g.lineWidth = rand(0.5, 2.5);
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + rand(-2, 2));
    g.stroke();
  }
  grain(g, 256, 64, 25);
  return toTexture(c);
}

function concreteBase(g, w, h, base = '#9d978c') {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rand(20, 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.6;
    grd.addColorStop(0, dark ? 'rgba(40,35,30,0.12)' : 'rgba(255,255,250,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function concrete() {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  concreteBase(g, S, S);
  grain(g, S, S, 22);
  return toTexture(c);
}

const WORDS = ['MAR DEL PLATA', 'LA FELIZ', 'BARRIO', 'PUERTO', 'TÉCNICA', 'TALLER', 'ELECTRO', 'MECÁNICA', 'PROMO', 'DISEÑO', 'ROBOT', 'ET', 'TORNO', 'LAB'];
const PALETTES = [
  ['#2fb8ff', '#1b4fd8', '#bff3ff'],
  ['#ff4fa3', '#8a1fd1', '#ffd1ec'],
  ['#ffcf2e', '#ff5a1f', '#fff3b0'],
  ['#5df27a', '#0f9a6a', '#d9ffe0'],
  ['#c77dff', '#5a18c9', '#f0d9ff'],
  ['#ff3b3b', '#a30f3a', '#ffd0d0'],
];

function graffitiPiece(g, x, y, size, label, palette) {
  const word = label || pick(WORDS);
  const [c1, c2, light] = palette || pick(PALETTES);
  g.save();
  g.translate(x, y);
  g.rotate(rand(-0.12, 0.12));
  g.font = `900 ${size}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const w = g.measureText(word).width;

  // Nube de fondo
  g.fillStyle = pick(['#1b1b2b', '#2a1b3d', '#0e2a3a']);
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const bx = rand(-w / 2, w / 2), by = rand(-size * 0.4, size * 0.4), br = rand(size * 0.35, size * 0.6);
    g.moveTo(bx + br, by);
    g.arc(bx, by, br, 0, Math.PI * 2);
  }
  g.globalAlpha = 0.85;
  g.fill();
  g.globalAlpha = 1;

  g.lineWidth = size * 0.28;
  g.strokeStyle = '#111';
  g.strokeText(word, 0, 0);
  g.lineWidth = size * 0.14;
  g.strokeStyle = light;
  g.strokeText(word, 0, 0);
  const grd = g.createLinearGradient(0, -size / 2, 0, size / 2);
  grd.addColorStop(0, c1);
  grd.addColorStop(1, c2);
  g.fillStyle = grd;
  g.fillText(word, 0, 0);

  // Brillos y goteos de pintura
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(rand(-w / 2, w / 2), rand(-size * 0.3, -size * 0.1), rand(3, 8), rand(2, 4), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = c2;
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const dx = rand(-w / 2, w / 2);
    g.beginPath();
    g.moveTo(dx, size * 0.35);
    g.lineTo(dx, size * 0.35 + rand(10, 45));
    g.stroke();
  }
  g.restore();
}

// Muro de hormigón con grafitis (y a veces hiedra colgando)
export function graffitiWall(theme = 'mdp') {
  const W = 1024, H = 240;
  const [c, g] = makeCanvas(W*2, H*2);
  g.scale(2,2);
  concreteBase(g, W, H, '#a49d90');
  // Juntas de los paneles
  for (let x = 0; x <= W; x += 256) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x - 2, 0, 3, H);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(x + 1, 0, 2, H);
  }
  // Manchas de agua
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * W;
    const grd = g.createLinearGradient(0, 0, 0, rand(60, 200));
    grd.addColorStop(0, 'rgba(40,35,25,0.3)');
    grd.addColorStop(1, 'rgba(40,35,25,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, rand(4, 20), H);
  }
  if (theme === 'spot') {
    // Letras blancas inclinadas y O naranja con órbita, como la referencia SPOT.
    g.save();g.translate(130,65);g.transform(1,0,-.20,1,0,0);
    g.fillStyle='#101113';g.fillRect(-25,-20,790,125);
    g.font='italic 900 110px Arial';g.textBaseline='top';
    g.fillStyle='#f4f4ee';g.fillText('SP',0,0);g.fillText('T',270,0);
    g.fillStyle='#ff791e';g.fillText('O',175,0);
    g.strokeStyle='#ff791e';g.lineWidth=5;g.beginPath();g.ellipse(219,54,60,38,-.8,0,Math.PI*2);g.stroke();
    g.restore();
    graffitiPiece(g,865,123,53,'MDP',['#fb8b32','#c73e16','#ffe0a9']);
  } else if (theme === 'aldosivi' || theme === 'alvarado') {
    const aldo=theme==='aldosivi';
    const palette=aldo?['#f2d332','#197346','#fff1a2']:['#e9edf0','#2054a2','#ffffff'];
    graffitiPiece(g,500,115,108,aldo?'ALDOSIVI':'ALVARADO',palette);
    g.font='italic bold 25px sans-serif';g.fillStyle=aldo?'#f4d733':'#e5edf6';
    g.fillText(aldo?'EL TIBURÓN · PUERTO':'EL TORITO · MAR DEL PLATA',95,207);
  } else {
    graffitiPiece(g,310,120,66,'MAR DEL PLATA',['#54c3d2','#185a9b','#d8f0f0']);
    graffitiPiece(g,790,125,77,'LA FELIZ',['#ffd04b','#ec632e','#ffedc3']);
  }
  // Firmas pequeñas
  g.font = 'italic bold 26px "Comic Sans MS", cursive, sans-serif';
  for (let i = 0; i < 3; i++) {
    g.fillStyle = pick(['#111', '#fff', '#e33', '#36f']);
    g.fillText(pick(WORDS).toLowerCase(), rand(0, W - 60), rand(221, 237));
  }
  // Suciedad abajo
  const dirt = g.createLinearGradient(0, H - 60, 0, H);
  dirt.addColorStop(0, 'rgba(50,40,30,0)');
  dirt.addColorStop(1, 'rgba(50,40,30,0.25)');
  g.fillStyle = dirt;
  g.fillRect(0, H - 60, W, 60);
  // Hiedra
  if (Math.random() < 0.35) {
    const start = rand(0, W * 0.6), len = rand(150, 450);
    for (let x = start; x < start + len; x += rand(4, 10)) {
      const hang = rand(8, 40) * Math.sin(((x - start) / len) * Math.PI);
      for (let y = 0; y < hang; y += rand(5, 9)) {
        g.fillStyle = `hsl(${rand(85, 125)},${rand(35, 60)}%,${rand(18, 38)}%)`;
        g.beginPath();
        g.ellipse(x + rand(-6, 6), y, rand(4, 8), rand(3, 6), rand(0, 3), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Conservar el contraste de la pintura; el muro ya aporta ruido y desgaste.
  return toTexture(c);
}

export function chainLink() {
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  g.strokeStyle = 'rgba(165,170,175,1)';
  g.lineWidth = 2.2;
  const step = S / 4;
  for (let i = -S; i <= 2 * S; i += step) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.moveTo(i, 0);
    g.lineTo(i - S, S);
    g.stroke();
  }
  return toTexture(c);
}

// Fachadas: cada textura son 2x2 módulos (ventana + muro) de 4 m x 3.2 m
export const FACADE_STYLES = ['brickRed', 'brickBrown', 'stone', 'modern'];

export function facade(style) {
  const S = 512, B = 256;
  const [c, g] = makeCanvas(S, S);
  const brick = style.startsWith('brick');
  const baseCol = { brickRed: '#8a3a2a', brickBrown: '#6b4532', stone: '#c9b896', modern: '#7d838b' }[style];
  g.fillStyle = baseCol;
  g.fillRect(0, 0, S, S);

  if (brick) {
    g.fillStyle = '#a89a8a';
    g.fillRect(0, 0, S, S);
    const bw = 32, bh = 12;
    for (let row = 0; row * bh < S; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S + bw; x += bw) {
        const l = rand(-10, 8);
        g.fillStyle = shade(baseCol, l);
        g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
  } else {
    for (let y = 0; y < S; y += 64) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, S, 2);
    }
  }

  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const x0 = bx * B, y0 = by * B;
      const modern = style === 'modern';
      const wx = x0 + (modern ? 30 : 64), wy = y0 + (modern ? 40 : 56);
      const ww = modern ? 196 : 128, wh = modern ? 176 : 150;
      // Dintel y alféizar
      g.fillStyle = modern ? '#555b63' : '#d8cdb8';
      g.fillRect(wx - 8, wy - 12, ww + 16, 12);
      g.fillRect(wx - 10, wy + wh, ww + 20, 10);
      // Cristal
      const lit = Math.random() < 0.15;
      const glass = g.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
      if (lit) {
        glass.addColorStop(0, '#ffe2a8');
        glass.addColorStop(1, '#d8904a');
      } else {
        glass.addColorStop(0, '#9fc3e0');
        glass.addColorStop(0.45, '#4d6f8f');
        glass.addColorStop(1, '#1e2a38');
      }
      g.fillStyle = glass;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(wx + ww * 0.15, wy);
      g.lineTo(wx + ww * 0.4, wy);
      g.lineTo(wx + ww * 0.05, wy + wh);
      g.lineTo(wx, wy + wh);
      g.lineTo(wx, wy + wh * 0.6);
      g.fill();
      // Marco
      g.strokeStyle = modern ? '#2d3238' : '#eee6d6';
      g.lineWidth = 6;
      g.strokeRect(wx, wy, ww, wh);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(wx + ww / 2, wy);
      g.lineTo(wx + ww / 2, wy + wh);
      g.moveTo(wx, wy + wh * 0.45);
      g.lineTo(wx + ww, wy + wh * 0.45);
      g.stroke();
    }
  }
  grain(g, S, S, 14);
  return toTexture(c);
}

function shade(hex, l) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + l * 2.55));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function billboard() {
  const [c, g] = makeCanvas(512, 256);
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, '#d61f3c');
  grd.addColorStop(1, '#7a0f2a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffd84a';
  g.font = '900 64px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.font = '900 48px Arial';
  g.fillText('ESCUELA', 256, 90);
  g.fillStyle = '#fff';
  g.fillText('TÉCNICA', 256, 155);
  g.font = 'bold 26px sans-serif';
  g.font = 'bold 24px sans-serif';
  g.fillText('TALLERES · LABORATORIOS', 256, 218);
  g.strokeStyle = '#222';
  g.lineWidth = 14;
  g.strokeRect(0, 0, 512, 256);
  return toTexture(c);
}

export function sky() {
  const W = 1024, H = 512;
  const [c, g] = makeCanvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#526d87');
  grd.addColorStop(0.45, '#91a2ad');
  grd.addColorStop(0.75, '#c9bba6');
  grd.addColorStop(1, '#e5c39a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const cx = rand(0, W), cy = rand(30, 230), size = rand(40, 90);
    for (let j = 0; j < 14; j++) {
      const x = cx + rand(-size * 1.6, size * 1.6), y = cy + rand(-size * 0.3, size * 0.4), r = rand(size * 0.4, size);
      const puff = g.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, 'rgba(255,255,255,0.75)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = puff;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function stripes(a, b) {
  const [c, g] = makeCanvas(256, 64);
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = b;
  for (let x = -64; x < 320; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 64);
    g.lineTo(x + 64, 0);
    g.lineTo(x + 32, 0);
    g.fill();
  }
  grain(g, 256, 64, 18);
  return toTexture(c);
}

// Lateral de un vagón de metro (10 m de largo)
export function trainSide(color, line = '542', stripe = '#e8e2cf') {
  const W = 1024, H = 256;
  const [c, g] = makeCanvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, shade(color, 12));
  grd.addColorStop(1, shade(color, -12));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = stripe;
  g.fillRect(0, 168, W, 10);
  g.fillStyle = '#2b2b2b';
  g.fillRect(0, H - 28, W, 28);
  const glass = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#9cc0d8');
    gr.addColorStop(0.5, '#2b3d4d');
    gr.addColorStop(1, '#141c24');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#d9d9d9';
    g.lineWidth = 4;
    g.strokeRect(x, y, w, h);
  };
  for (const dx of [250, 750]) {
    g.fillStyle = shade(color, -18);
    g.fillRect(dx - 60, 40, 120, H - 70);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 3;
    g.strokeRect(dx - 60, 40, 120, H - 70);
    g.beginPath();
    g.moveTo(dx, 40);
    g.lineTo(dx, H - 30);
    g.stroke();
    glass(dx - 50, 55, 40, 80);
    glass(dx + 10, 55, 40, 80);
  }
  for (const x of [40, 400, 560, 900]) glass(x, 50, 90, 90);
  g.fillStyle='#e7e1cf';g.font='bold 36px Arial';g.textAlign='center';
  g.fillText(line,510,216);
  g.font='bold 15px Arial';g.fillText('MAR DEL PLATA',510,241);
  g.strokeStyle='#555c5e';g.lineWidth=2;
  for(const x of [120,450,830]){g.strokeRect(x,192,86,34);g.fillStyle='#14191b';g.fillRect(x+9,208,15,4);}
  // Pasarruedas pintados, juntas y señalización de transporte argentino.
  for(const x of [165,842]){g.fillStyle='#161a1b';g.beginPath();g.ellipse(x,255,39,32,0,Math.PI,2*Math.PI);g.fill();}
  g.fillStyle='#d49d28';for(const x of [25,500,995])g.fillRect(x,228,8,5);

  for (let i = 0; i < 20; i++) {
    g.fillStyle = `rgba(40,30,20,${rand(0.05, 0.2)})`;
    g.fillRect(rand(0, W), rand(150, H), rand(20, 120), rand(4, 30));
  }
  grain(g, W, H, 12);
  const texture=toTexture(c);texture.name=`Colectivo-${line}`;return texture;
}

export function trainFront(color, line = '542', stripe = '#e8e2cf', rear = false) {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#1d2830';
  g.fillRect(20, 40, 216, 90);
  const gr = g.createLinearGradient(20, 40, 120, 130);
  gr.addColorStop(0, 'rgba(180,210,230,0.7)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(20, 40, 216, 90);
  g.fillStyle = '#c9c9c9';
  g.fillRect(124, 40, 8, 90);
  g.fillStyle = '#111';
  g.fillRect(12, 5, 232, 32);
  g.fillStyle = '#ffb42e';
  g.font = 'bold 22px monospace';
  g.textAlign = 'center';
  g.fillText(`${line} · ${rear ? 'MDP' : 'CENTRO'}`, 128, 29);
  g.fillStyle = stripe;
  g.fillRect(0, 168, S, 10);
  g.fillStyle = '#2b2b2b';
  g.fillRect(0, 220, S, 36);
  // Parabrisas con limpiaparabrisas, ópticas y patente argentina.
  g.strokeStyle='#14191d';g.lineWidth=3;
  for(const x of [63,165]){g.beginPath();g.moveTo(x,125);g.lineTo(x+25,96);g.lineTo(x+46,101);g.stroke();}
  g.fillStyle=rear?'#a32320':'#e2ddc5';g.fillRect(13,188,32,15);g.fillRect(211,188,32,15);
  g.fillStyle='#121619';for(let y=186;y<218;y+=6)g.fillRect(70,y,116,2);
  g.fillStyle='#dcded7';g.fillRect(101,230,54,15);g.fillStyle='#3388ac';g.fillRect(101,230,54,3);
  g.font='bold 8px monospace';g.fillStyle='#242a30';g.fillText(`MDP ${line}`,128,242);
  grain(g, S, S, 10);
  const texture=toTexture(c);texture.name=`Colectivo-${line}`;return texture;
}

export function coinFace() {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  const grd = g.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#fff1a0');
  grd.addColorStop(0.6, '#f2b723');
  grd.addColorStop(1, '#b0700c');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#a5650a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? S * 0.12 : S * 0.29;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
  }
  g.closePath();
  const star = g.createLinearGradient(0, S * 0.2, 0, S * 0.8);
  star.addColorStop(0, '#fff6c0');
  star.addColorStop(1, '#e09a10');
  g.fillStyle = star;
  g.fill();
  g.lineWidth = 6;
  g.stroke();
  return toTexture(c);
}

// Racimos con huecos y nervaduras: silueta de hojas en lugar de polígonos sólidos.
export function foliage() {
  const [canvas, ctx] = makeCanvas(256, 256);
  for (let i = 0; i < 150; i++) {
    const angle = rand(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * 102;
    const x = 128 + Math.cos(angle) * radius;
    const y = 128 + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand(0, Math.PI));
    const length = rand(7, 17);
    ctx.fillStyle = `hsl(${rand(70, 100)},${rand(18, 34)}%,${rand(20, 43)}%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 0.42, length, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,190,117,0.3)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();ctx.moveTo(0, -length);ctx.lineTo(0, length);ctx.stroke();
    ctx.restore();
  }
  return toTexture(canvas);
}
