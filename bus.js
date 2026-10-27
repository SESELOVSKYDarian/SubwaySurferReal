// Colectivo urbano marplatense: carrocería con libreas por línea, vidrios con
// reflejo, puertas del lado de la vereda, ópticas, cartel de línea iluminado,
// paragolpes, espejos y ruedas. Medidas de juego intactas: caja de 2,1 × 2,6 ×
// 10 m apoyada a 0,55 m, techo transitable a 3,3 m, frente hacia +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BUS_LINES = [
  { line: '542', color: '#b3202a', accent: '#f1ebdc', trim: '#2a2a2a', route: 'CENTRO · PUERTO' },
  { line: '720', color: '#1f7a3c', accent: '#f4cf28', trim: '#163f22', route: 'BATÁN · TERMINAL' },
  { line: '563', color: '#1f56a6', accent: '#e9e9e2', trim: '#14305e', route: 'FARO · CENTRO' },
];

const HALF_W = 1.05, BOTTOM = .55, TOP = 3.15, HALF_L = 5;
const BAND = [1.6, 2.86];         // banda de ventanas
const WHEELS = [2.55, -3.2];      // ejes delantero y trasero (z)
const TIRE_R = .48;

// Paños vidriados de cada lado: [z0, z1, y0, y1]. El lado de la vereda (-x)
// tiene puerta delantera y central; el del conductor (+x), su ventanilla.
function panes(from, to, width = 1.3, gap = .07) {
  const count = Math.max(1, Math.round((to - from) / width));
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, i) => [from + i * step + gap / 2, from + (i + 1) * step - gap / 2, BAND[0], BAND[1]]);
}
const DOOR_SIDE = [
  ...panes(-4.82, -.62), ...panes(.72, 3.48),
  [-.56, .02, .74, BAND[1]], [.06, .64, .74, BAND[1]],       // puerta central de dos hojas
  [3.6, 4.15, .74, BAND[1]], [4.19, 4.76, .74, BAND[1]],     // puerta delantera
];
const DRIVER_SIDE = [...panes(-4.82, 3.58), [3.68, 4.76, 1.42, BAND[1]]];
const WINDSHIELD = [[-.97, -.015, 1.02, 2.72], [.015, .97, 1.02, 2.72]];
const REAR_WINDOW = [-.82, .82, 2.12, 2.86];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amount * 2.55)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function grime(g, w, h, random, amount) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (random() - .5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Lateral: 2048 × 512 px para 10 × 2,6 m. u avanza de 0 a 1 según `forward`.
function sideTexture(spec, doorSide) {
  const W = 2048, H = 512, random = seeded(spec.line.charCodeAt(0) * 31 + (doorSide ? 7 : 3));
  const [c, g] = canvas(W, H);
  const X = z => (doorSide ? z + HALF_L : HALF_L - z) / (2 * HALF_L) * W;
  const Y = y => (TOP - y) / (TOP - BOTTOM) * H;
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, shade(spec.color, 10));
  body.addColorStop(.55, spec.color);
  body.addColorStop(1, shade(spec.color, -14));
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);
  // Faja superior clara sobre las ventanas y franja de la línea.
  g.fillStyle = spec.accent;
  g.fillRect(0, 0, W, Y(BAND[1] + .02));
  const front = X(HALF_L), rear = X(-HALF_L);
  g.fillStyle = spec.accent;
  g.beginPath();
  g.moveTo(front, Y(1.32)); g.lineTo(front, Y(1.5));
  g.bezierCurveTo((front + rear) / 2, Y(1.5), (front + rear) / 2, Y(1.05), rear, Y(.98));
  g.lineTo(rear, Y(.82));
  g.bezierCurveTo((front + rear) / 2, Y(.9), (front + rear) / 2, Y(1.32), front, Y(1.32));
  g.fill();
  g.fillStyle = spec.trim;
  g.fillRect(0, Y(1.36), W, 6);
  // Banda negra de ventanas: los vidrios en relieve dejan ver sus parantes.
  g.fillStyle = '#111416';
  g.fillRect(0, Y(BAND[1] + .03), W, Y(BAND[0] - .03) - Y(BAND[1] + .03));
  for (const [z0, z1, y0, y1] of doorSide ? DOOR_SIDE : DRIVER_SIDE) {
    const x0 = Math.min(X(z0), X(z1)) - 7, x1 = Math.max(X(z0), X(z1)) + 7;
    g.fillStyle = '#111416';
    g.fillRect(x0, Y(y1 + .03), x1 - x0, Y(y0 - .03) - Y(y1 + .03));
  }
  // Pasarruedas oscuros con burlete.
  for (const z of WHEELS) {
    const x = X(z), y = Y(.5), rx = .66 / (2 * HALF_L) * W, ry = .64 / (TOP - BOTTOM) * H;
    g.fillStyle = '#0d0f10';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, Math.PI, 2 * Math.PI); g.fill();
    g.strokeStyle = '#2a2d2f';
    g.lineWidth = 8;
    g.beginPath(); g.ellipse(x, y, rx + 4, ry + 4, 0, Math.PI, 2 * Math.PI); g.stroke();
  }
  // Zócalo, tapa de motor y juntas de paneles.
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(0, Y(.7), W, H - Y(.7));
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 2;
  for (let z = -4.2; z < 4.6; z += 1.4) {
    g.beginPath(); g.moveTo(X(z), Y(BAND[0] - .05)); g.lineTo(X(z), Y(.62)); g.stroke();
  }
  if (!doorSide) {
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.strokeRect(Math.min(X(-4.7), X(-3.7)), Y(1.3), Math.abs(X(-4.7) - X(-3.7)), Y(.75) - Y(1.3));
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let k = 0; k < 6; k++) g.fillRect(Math.min(X(-4.6), X(-3.8)), Y(1.22 - k * .07), Math.abs(X(-4.6) - X(-3.8)), 5);
  }
  // Número de línea grande y empresa.
  g.fillStyle = spec.accent;
  g.font = '900 150px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const numberZ = doorSide ? 2.1 : 2.6;
  g.strokeStyle = shade(spec.color, -30);
  g.lineWidth = 10;
  g.strokeText(spec.line, X(numberZ), Y(1.05));
  g.fillText(spec.line, X(numberZ), Y(1.05));
  g.fillStyle = shade(spec.color, -38);
  g.font = 'bold 34px Arial, sans-serif';
  g.fillText('TRANSPORTE URBANO · MAR DEL PLATA', X(-1.4), Y(2.99));
  // Luces de posición laterales y suciedad de calle en la parte baja.
  g.fillStyle = '#e88a1a';
  for (const z of [-4.3, -1.2, 1.8, 4.3]) g.fillRect(X(z) - 9, Y(.66) - 6, 18, 12);
  for (let i = 0; i < 70; i++) {
    const x = random() * W, y = Y(.55 + random() * .5), w = 20 + random() * 120;
    g.fillStyle = `rgba(64,52,38,${.05 + random() * .14})`;
    g.fillRect(x, y, w, 4 + random() * 22);
  }
  for (let i = 0; i < 26; i++) {
    const x = random() * W, len = 30 + random() * 120;
    const grd = g.createLinearGradient(0, Y(BAND[0]), 0, Y(BAND[0]) + len);
    grd.addColorStop(0, 'rgba(40,36,30,.18)');
    grd.addColorStop(1, 'rgba(40,36,30,0)');
    g.fillStyle = grd;
    g.fillRect(x, Y(BAND[0]), 3 + random() * 6, len);
  }
  grime(g, W, H, random, 10);
  const t = texture(c);
  t.name = `Colectivo-${spec.line}`;
  return t;
}

// Frente o cola: 512 × 640 px para 2,1 × 2,6 m (u de izquierda a derecha visto de afuera).
function endTexture(spec, rear) {
  const W = 512, H = 640, random = seeded(spec.line.charCodeAt(1) * 17 + (rear ? 5 : 1));
  const [c, g] = canvas(W, H);
  const X = x => (x + HALF_W) / (2 * HALF_W) * W;
  const Y = y => (TOP - y) / (TOP - BOTTOM) * H;
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, shade(spec.color, 8));
  body.addColorStop(1, shade(spec.color, -16));
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);
  g.fillStyle = spec.accent;
  g.fillRect(0, 0, W, Y(2.74));
  // Marco negro del parabrisas / luneta y del cartel.
  g.fillStyle = '#0f1214';
  if (rear) {
    g.fillRect(X(REAR_WINDOW[0] - .05), Y(REAR_WINDOW[3] + .05), X(REAR_WINDOW[1] + .05) - X(REAR_WINDOW[0] - .05), Y(REAR_WINDOW[2] - .05) - Y(REAR_WINDOW[3] + .05));
    g.fillRect(X(-.5), Y(3.08), X(.5) - X(-.5), Y(2.88) - Y(3.08));
    // Rejilla del motor trasero.
    g.fillStyle = shade(spec.color, -30);
    g.fillRect(X(-.75), Y(1.75), X(.75) - X(-.75), Y(1.05) - Y(1.75));
    g.fillStyle = 'rgba(0,0,0,.55)';
    for (let y = 1.12; y < 1.72; y += .07) g.fillRect(X(-.7), Y(y), X(.7) - X(-.7), 7);
    g.fillStyle = spec.accent;
    g.font = '900 120px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(spec.line, X(0), Y(1.95));
  } else {
    g.fillRect(X(-1.0), Y(3.08), X(1.0) - X(-1.0), Y(.98) - Y(3.08));
    // Logo de carrocera y rejilla frontal.
    g.fillStyle = shade(spec.color, -32);
    g.fillRect(X(-.52), Y(.98), X(.52) - X(-.52), Y(.78) - Y(.98));
    g.fillStyle = 'rgba(0,0,0,.5)';
    for (let y = .8; y < .97; y += .04) g.fillRect(X(-.5), Y(y), X(.5) - X(-.5), 4);
  }
  // Patente argentina (Mercosur) en el paragolpes.
  g.fillStyle = '#f2f2ee';
  g.fillRect(X(-.24), Y(.74), X(.24) - X(-.24), Y(.62) - Y(.74));
  g.fillStyle = '#1b4e9b';
  g.fillRect(X(-.24), Y(.74), X(.24) - X(-.24), 9);
  g.fillStyle = '#16191c';
  g.font = 'bold 26px monospace';
  g.textAlign = 'center';
  g.fillText(`AB ${spec.line} MP`, X(0), Y(.645));
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(60,48,34,${.05 + random() * .12})`;
    g.fillRect(random() * W, Y(.55 + random() * .45), 10 + random() * 60, 3 + random() * 14);
  }
  grime(g, W, H, random, 10);
  return texture(c);
}

// Cartel de destino de LED ámbar (emisivo).
function signTexture(spec, rear) {
  const W = 512, H = 80;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#060707';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffb12e';
  g.textBaseline = 'middle';
  g.font = 'bold 54px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText(spec.line, 14, H / 2 + 2);
  if (!rear) {
    g.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'right';
    g.fillText(spec.route, W - 14, H / 2 + 2);
  }
  // Retícula de LED: separa los puntos como en un cartel real.
  g.fillStyle = 'rgba(0,0,0,.55)';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  return texture(c);
}

function roofTexture() {
  const W = 256, H = 1024, random = seeded(919);
  const [c, g] = canvas(W, H);
  g.fillStyle = '#d9d8d2';
  g.fillRect(0, 0, W, H);
  // Equipo de aire acondicionado (plano, el techo sigue siendo transitable),
  // escotillas y huellas de suciedad.
  g.fillStyle = '#bcbcb5';
  g.fillRect(30, H * .38, W - 60, H * .2);
  g.strokeStyle = '#8f8f88';
  g.lineWidth = 4;
  g.strokeRect(30, H * .38, W - 60, H * .2);
  g.fillStyle = '#5c5e5c';
  for (const y of [.42, .5]) { g.beginPath(); g.arc(W * .3, H * y, 26, 0, Math.PI * 2); g.arc(W * .7, H * y, 26, 0, Math.PI * 2); g.fill(); }
  for (const y of [.14, .82]) {
    g.fillStyle = '#c4c4bd';
    g.fillRect(W / 2 - 50, H * y, 100, 90);
    g.strokeStyle = '#7d7d76';
    g.strokeRect(W / 2 - 50, H * y, 100, 90);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(80,74,64,${.04 + random() * .1})`;
    g.fillRect(random() * W, random() * H, 4 + random() * 30, 20 + random() * 120);
  }
  grime(g, W, H, random, 12);
  return texture(c);
}

// Panel delgado apoyado sobre una cara del colectivo.
function panelX(side, z0, z1, y0, y1, thickness = .012, out = .006) {
  return new THREE.BoxGeometry(thickness, y1 - y0, z1 - z0)
    .translate(side * (HALF_W + out), (y0 + y1) / 2, (z0 + z1) / 2);
}
function panelZ(end, x0, x1, y0, y1, thickness = .012, out = .006) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, thickness)
    .translate((x0 + x1) / 2, (y0 + y1) / 2, end * (HALF_L + out));
}

function merge(parts, groups = false) {
  const plain = parts.map(p => (p.index ? p.toNonIndexed() : p));
  for (const p of plain) {
    for (const name of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(name)) p.deleteAttribute(name);
  }
  const result = mergeGeometries(plain, groups);
  parts.forEach(p => p.dispose());
  plain.forEach(p => p.dispose());
  return result;
}

export function buildBusAssets(env = {}) {
  const std = o => new THREE.MeshStandardMaterial(o);
  // Geometrías compartidas por todas las líneas.
  const body = new RoundedBoxGeometry(2 * HALF_W, TOP - BOTTOM, 2 * HALF_L, 2, .08)
    .translate(0, (TOP + BOTTOM) / 2, 0);
  const glassParts = [];
  for (const [z0, z1, y0, y1] of DOOR_SIDE) glassParts.push(panelX(-1, z0, z1, y0, y1));
  for (const [z0, z1, y0, y1] of DRIVER_SIDE) glassParts.push(panelX(1, z0, z1, y0, y1));
  for (const [x0, x1, y0, y1] of WINDSHIELD) glassParts.push(panelZ(1, x0, x1, y0, y1, .02, .01));
  glassParts.push(panelZ(-1, ...REAR_WINDOW));
  const glass = merge(glassParts);

  const metalParts = [
    new RoundedBoxGeometry(2.06, .2, 9.9, 2, .07).translate(0, 3.2, 0),   // coronamiento del techo
  ];
  const darkParts = [];
  for (const side of [-1, 1]) {
    for (const z of WHEELS) {
      darkParts.push(new THREE.CylinderGeometry(TIRE_R, TIRE_R, .28, 24).rotateZ(Math.PI / 2).translate(side * .93, TIRE_R, z));
      metalParts.push(new THREE.CylinderGeometry(.3, .3, .02, 20).rotateZ(Math.PI / 2).translate(side * 1.075, TIRE_R, z));
      darkParts.push(new THREE.CylinderGeometry(.09, .09, .03, 10).rotateZ(Math.PI / 2).translate(side * 1.088, TIRE_R, z));
    }
    // Espejos retrovisores con brazo curvo.
    metalParts.push(new THREE.CylinderGeometry(.018, .018, .32, 6).rotateZ(Math.PI / 2).translate(side * 1.2, 2.62, 4.86));
    metalParts.push(new THREE.CylinderGeometry(.018, .018, .32, 6).translate(side * 1.35, 2.47, 4.86));
    darkParts.push(new RoundedBoxGeometry(.1, .34, .2, 2, .03).translate(side * 1.36, 2.22, 4.86));
    // Pasamanos verticales en las puertas del lado de la vereda.
    if (side === -1) for (const z of [-.6, .66, 3.56, 4.8]) metalParts.push(new THREE.CylinderGeometry(.016, .016, 2.1, 6).translate(-1.075, 1.75, z));
  }
  for (const end of [-1, 1]) {
    darkParts.push(new RoundedBoxGeometry(2.14, .3, .16, 2, .05).translate(0, .7, end * (HALF_L + .05)));
  }
  // Limpiaparabrisas.
  for (const x of [-.45, .5]) {
    darkParts.push(new THREE.BoxGeometry(.66, .025, .02).rotateZ(x < 0 ? .35 : -.35).translate(x, 1.24, HALF_L + .03));
  }
  const metal = merge(metalParts);
  const dark = merge(darkParts);

  // Luces: grupo 0 faros, 1 giro ámbar, 2 traseras rojas, 3 cartel delantero, 4 cartel trasero.
  const lightGroups = [
    [-1, 1].map(s => panelZ(1, s > 0 ? .6 : -.96, s > 0 ? .96 : -.6, .8, .99, .02, .012)),
    [
      ...[-1, 1].map(s => panelZ(1, s > 0 ? .42 : -.56, s > 0 ? .56 : -.42, .8, .99, .02, .012)),
      ...[-1, 1].map(s => panelZ(-1, s > 0 ? .86 : -1.0, s > 0 ? 1.0 : -.86, 1.58, 1.76, .02, .012)),
    ],
    [-1, 1].map(s => panelZ(-1, s > 0 ? .86 : -1.0, s > 0 ? 1.0 : -.86, .78, 1.55, .02, .012)),
    [panelZ(1, -.9, .9, 2.78, 3.05, .02, .012)],
    [panelZ(-1, -.46, .46, 2.9, 3.06, .02, .012)],
  ].map(parts => merge(parts));
  const lights = mergeGeometries(lightGroups, true);
  lightGroups.forEach(g => g.dispose());

  // Vidrio dieléctrico: oscuro de frente y con reflejo de cielo en ángulo rasante.
  const glassMaterial = std({ color: 0x0a1014, roughness: .1, metalness: 0, envMapIntensity: .28, name: 'BusGlass' });
  const metalMaterial = std({ color: 0xb9bdc0, roughness: .32, metalness: .85, envMapIntensity: .8, name: 'BusMetal' });
  const darkMaterial = std({ color: 0x1b1d1f, roughness: .78, metalness: .05, name: 'BusRubber' });
  const head = std({ color: 0xf6f3e8, emissive: 0xfff4d6, emissiveIntensity: 2.2, roughness: .2 });
  const amber = std({ color: 0xf0a033, emissive: 0xff9a1a, emissiveIntensity: 1.1, roughness: .3 });
  const tail = std({ color: 0xa0141a, emissive: 0xff1f24, emissiveIntensity: .9, roughness: .3 });
  const roof = std({ map: roofTexture(), roughness: .6, metalness: .1, envMapIntensity: .5 });
  const bottom = std({ color: 0x151617, roughness: .9 });

  const lines = BUS_LINES.map(spec => {
    const paint = map => std({ map, roughness: .38, metalness: .15, envMapIntensity: .55 });
    const sign = map => std({ color: 0x000000, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.6, roughness: .3 });
    return {
      ...spec,
      // Orden de caras del cuerpo: +x (conductor), -x (vereda), techo, piso, frente, cola.
      body: [paint(sideTexture(spec, false)), paint(sideTexture(spec, true)), roof, bottom,
        paint(endTexture(spec, false)), paint(endTexture(spec, true))],
      lights: [head, amber, tail, sign(signTexture(spec, false)), sign(signTexture(spec, true))],
    };
  });
  return {
    lines, geometries: { body, glass, metal, dark, lights },
    materials: { glass: glassMaterial, metal: metalMaterial, dark: darkMaterial },
  };
}
