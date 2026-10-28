// Interior de la Técnica 5 (galpón / playón), armado a partir de las fotos de
// referencia: cabriadas en arco con chapa oscura, tubos fluorescentes, piso de
// granito gris, pared blanca con zócalo gris y escudo, cantina con rejas verdes
// y oficina en entrepiso. Medidas en metros; el ingreso está en z = 0 y el
// fondo (cantina y escudo) hacia -z.
import * as THREE from 'three';

export const HALL = { width: 28, length: 44, wallH: 6.2, ridge: 11.5 };

const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: .85, metalness: 0, ...o });
const box = (w, h, d, material, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

function canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function floorTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#6f7270'; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 122 + ((i * 7 + j * 13) % 3) * 3;
      g.fillStyle = `rgb(${v},${v + 2},${v})`;
      g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      for (let k = 0; k < 140; k++) {
        const a = 120 + Math.random() * 80 | 0;
        g.fillStyle = `rgba(${a},${a},${a},.35)`;
        g.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
      }
    }
  }, { repeat: [14, 22] });
}

function corrugatedTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2e30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, '#1b1d1f'); grad.addColorStop(.5, '#3a3e41'); grad.addColorStop(1, '#1b1d1f');
      g.fillStyle = grad; g.fillRect(x, 0, 16, h);
    }
  }, { repeat: [40, 6] });
}

function wallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#e9e8e2'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(120,115,100,${Math.random() * .05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3 + Math.random() * 10);
    }
  }, { repeat: [10, 2] });
}

function crestTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const green = '#2f8a43', red = '#c4372f';
    // B verde (izquierda)
    g.fillStyle = green;
    g.beginPath(); g.roundRect(30, 30, 230, 240, 70); g.fill();
    g.fillStyle = '#e9e8e2';
    g.fillRect(90, 85, 100, 40); g.fillRect(90, 175, 100, 40);
    g.fillRect(150, 30, 30, 18); g.fillRect(150, 252, 30, 18);
    // E roja (derecha)
    g.fillStyle = red;
    g.fillRect(250, 120, 220, 55); g.fillRect(250, 200, 220, 55);
    g.fillRect(250, 120, 55, 135);
    g.beginPath(); g.roundRect(60, 290, 410, 170, 80); g.fill();
    g.fillStyle = '#e9e8e2';
    g.fillRect(110, 335, 150, 40); g.fillRect(110, 400, 150, 22);
    g.fillStyle = green;
    g.beginPath(); g.roundRect(60, 290, 180, 170, [0, 0, 0, 70]); g.fill();
    g.fillStyle = '#e9e8e2'; g.fillRect(100, 330, 110, 32);
  });
}

function flagTexture() {
  return canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = '#74b3e0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6f6f2'; g.fillRect(0, h / 3, w, h / 3);
    g.fillStyle = '#e9b83a';
    g.beginPath(); g.arc(w / 2, h / 2, 14, 0, Math.PI * 2); g.fill();
  });
}

function dumpsterTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#b3342b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e7d6b8'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('ROMA', w / 2, 52);
    g.font = 'bold 24px sans-serif'; g.fillText('481-1000', w / 2, 92);
  });
}

function archCurve(halfW, wallH, ridge, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps * 2 - 1;                       // -1..1
    pts.push(new THREE.Vector3(u * halfW, wallH + (ridge - wallH) * (1 - u * u), 0));
  }
  return pts;
}

export function buildSchoolInterior() {
  const root = new THREE.Group();
  root.name = 'SchoolInterior';
  const { width: W, length: L, wallH, ridge } = HALL;
  const hw = W / 2;

  const m = {
    floor: std({ map: floorTexture(), roughness: .55, metalness: .05 }),
    wall: std({ map: wallTexture() }),
    base: std({ color: 0x4a4f52, roughness: .9 }),
    steel: std({ color: 0x1f2326, roughness: .6, metalness: .5 }),
    roof: std({ map: corrugatedTexture() }),
    green: std({ color: 0x1f4a33, roughness: .5, metalness: .4 }),
    glass: std({ color: 0xcfe0e0, transparent: true, opacity: .25, roughness: .1 }),
    warm: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
    cream: new THREE.MeshBasicMaterial({ color: 0xf4ead3 }),
    dark: std({ color: 0x15181a, roughness: .5 }),
    wood: std({ color: 0x7a4a2c, roughness: .8 }),
    tube: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    orange: std({ color: 0xc8582a, roughness: .6, metalness: .3 }),
    grey: std({ color: 0xb9bcbd }),
  };

  // Piso
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -L / 2;
  root.add(floor);

  // Techo: bóveda de chapa + cabriadas + tubos fluorescentes
  // Chapa oscura: tira continua siguiendo el arco de la cubierta.
  const roofPts = archCurve(hw, wallH, ridge, 20);
  const roofGeo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  roofPts.forEach((p, i) => {
    pos.push(p.x, p.y, 0, p.x, p.y, -L);
    uv.push(i / 20, 0, i / 20, 1);
    if (i < roofPts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
    map: m.roof.map, roughness: .7, metalness: .35, side: THREE.DoubleSide }));
  root.add(roof);

  const truss = new THREE.Group();
  const arch = new THREE.CatmullRomCurve3(archCurve(hw, wallH, ridge, 16));
  truss.add(new THREE.Mesh(new THREE.TubeGeometry(arch, 40, .09, 6), m.steel));
  const lower = archCurve(hw, wallH - .1, ridge - 1.6, 16);
  truss.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lower), 40, .06, 6), m.steel));
  for (let i = 1; i < 16; i++) {                       // diagonales entre cordones
    const a = archCurve(hw, wallH, ridge, 16)[i], b = lower[i + (i % 2 ? 1 : -1)] ?? lower[i];
    const len = a.distanceTo(b);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, len, 4), m.steel);
    d.position.copy(a).lerp(b, .5);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    truss.add(d);
  }
  for (let z = -2; z > -L; z -= 5.5) {
    const t = truss.clone(); t.position.z = z; root.add(t);
  }
  // Correas longitudinales
  for (const u of [-.8, -.5, -.2, .2, .5, .8]) {
    const y = wallH + (ridge - wallH) * (1 - u * u) - .12;
    const p = box(.08, .1, L, m.steel, u * hw, y, -L / 2);
    root.add(p);
  }
  // Tubos fluorescentes (franjas claras en el techo) y lámparas colgantes
  const lights = new THREE.Group();
  for (const u of [-.55, .0, .55]) {
    const y = wallH + (ridge - wallH) * (1 - u * u) - .2;
    for (let z = -4; z > -L + 3; z -= 7) {
      const tube = box(.18, .06, 3.4, m.tube, u * hw, y, z);
      tube.rotation.z = -u * .45;
      lights.add(tube);
    }
  }
  root.add(lights);
  const lamp = (x, z) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, 2.2, 4), m.steel));
    g.children[0].position.y = 1.1;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.14, .42, .38, 14, 1, true), m.steel);
    shade.material = shade.material.clone(); shade.material.side = THREE.DoubleSide;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), m.tube);
    bulb.position.y = -.08;
    g.add(shade, bulb);
    g.position.set(x, ridge - 2.7, z);
    return g;
  };
  [[-1, -10], [3, -17], [-6, -26], [5, -33], [0, -3]].forEach(([x, z]) => root.add(lamp(x, z)));

  // Paredes: izquierda (red perimetral), derecha (blanca con ventanas), fondo
  const wallH2 = wallH + .6;
  const side = (sx) => {
    const g = new THREE.Group();
    const upper = box(.3, wallH2 - 1.3, L, m.wall, sx * hw, 1.3 + (wallH2 - 1.3) / 2, -L / 2);
    const base = box(.32, 1.3, L, m.base, sx * hw, .65, -L / 2);
    g.add(upper, base);
    return g;
  };
  root.add(side(1));
  // Pared izquierda: base y malla metálica (se ve el exterior por encima)
  root.add(box(.32, 1.3, L, m.base, -hw, .65, -L / 2));
  const net = canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(30,32,34,.8)'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
  }, { repeat: [L / 1.2, 3.5] });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, 4.2), new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, alphaTest: .2 }));
  mesh.rotation.y = Math.PI / 2; mesh.position.set(-hw, 3.5, -L / 2);
  root.add(mesh);

  // Fondo del galpón: pared blanca con zócalo, cañería naranja, ventanas con rejas
  const back = new THREE.Group();
  back.add(box(W, wallH2 - 1.3, .3, m.wall, 0, 1.3 + (wallH2 - 1.3) / 2, -L));
  back.add(box(W, 1.3, .32, m.base, 0, .65, -L));
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, W, 8), m.orange);
  pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 3.5, -L + .25); back.add(pipe);
  const pipe2 = pipe.clone(); pipe2.position.y = 3.25; pipe2.material = m.orange; back.add(pipe2);
  for (const x of [-7.5, -4.2, 0.2]) {
    const win = box(1.5, 1.2, .12, m.dark, x, 4.6, -L + .2);
    back.add(win);
    for (let i = -2; i <= 2; i++) back.add(box(.03, 1.2, .05, m.steel, x + i * .3, 4.6, -L + .28));
  }
  // Escudo de la escuela
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3),
    new THREE.MeshBasicMaterial({ map: crestTexture(), transparent: true }));
  crest.position.set(-5.2, 3.3, -L + .2); crest.name = 'Escudo'; back.add(crest);
  // Mural retrato (cuadro con marco rojo)
  const mural = box(1.35, 2.5, .08, std({ color: 0x9c6a3c, roughness: .7 }), -10.3, 3.1, -L + .2);
  back.add(mural, box(1.5, 2.65, .06, m.orange, -10.3, 3.1, -L + .17));
  // Vitrina de trofeos con microondas abajo
  const caseF = box(4.2, 1.45, .35, std({ color: 0xcfd6d6, roughness: .3 }), -.2, 3.1, -L + .35);
  const caseG = box(4.0, 1.25, .05, m.glass, -.2, 3.1, -L + .55);
  back.add(caseF, caseG);
  for (let i = 0; i < 26; i++) {
    const t = box(.1, .18 + Math.random() * .22, .1, std({ color: i % 3 ? 0xd8b24a : 0xcfcfd0, metalness: .7, roughness: .3 }),
      -2 + i * .16, 2.8 + (i % 2) * .42, -L + .35);
    back.add(t);
  }
  const shelf = box(1.8, .06, .5, m.wood, 1.2, 1.9, -L + .45);
  back.add(shelf, box(.6, .32, .4, std({ color: 0xeeeeee }), .8, 2.1, -L + .45), box(.6, .32, .4, std({ color: 0xeeeeee }), 1.6, 2.1, -L + .45));
  // Banco largo bajo la vitrina
  const bench = (x, z, w = 3) => {
    const g = new THREE.Group();
    g.add(box(w, .06, .38, m.wood, 0, .46, 0));
    for (const dx of [-w / 2 + .1, w / 2 - .1]) g.add(box(.06, .46, .3, m.dark, dx, .23, 0));
    g.position.set(x, 0, z);
    return g;
  };
  back.add(bench(-.5, -L + .8, 4), bench(3, -L + .8, 3));
  root.add(back);

  // Cantina: base gris, estructura verde con vidrios, puerta enrejada, entrepiso
  const cant = new THREE.Group();
  const cx = 8.6, cz = -27, cw = 9.6, ch = 4.5, cd = 5;
  cant.add(box(cw, 1.4, cd, m.base, cx, .7, cz - cd / 2));
  cant.add(box(cw, ch - 1.4, .06, m.glass, cx, 1.4 + (ch - 1.4) / 2, cz));
  const inside = box(cw - .2, ch - 1.5, .1, m.warm, cx, 1.4 + (ch - 1.5) / 2, cz - cd + .1);
  cant.add(inside);
  const glow = new THREE.PointLight(0xffd9a0, 6, 12, 1.6); glow.position.set(cx + 1, 2.2, cz - 2);
  cant.add(glow);
  for (let i = 0; i <= 8; i++) cant.add(box(.1, ch - 1.4, .1, m.green, cx - cw / 2 + i * cw / 8, 1.4 + (ch - 1.4) / 2, cz + .05));
  for (const y of [2.55, 3.45, ch]) cant.add(box(cw, .1, .12, m.green, cx, y, cz + .05));
  for (let i = 0; i < 38; i++) {                        // barrotes finos
    const x = cx - cw / 2 + .12 + i * (cw - .24) / 37;
    if (x > cx + .8 && x < cx + 3.3) continue;
    cant.add(box(.025, ch - 1.4, .04, m.green, x, 1.4 + (ch - 1.4) / 2, cz + .08));
  }
  // Abertura con reja
  cant.add(box(2.5, 3.1, .12, m.warm, cx + 2.05, 1.5 + 1.55, cz - .1));
  for (let i = 0; i < 12; i++) cant.add(box(.03, 3.1, .04, m.green, cx + .85 + i * .21, 3.05, cz + .1));
  cant.add(box(2.6, .1, .12, m.green, cx + 2.05, 4.6, cz + .05));
  // Entrepiso (oficina) con ventanas oscuras y baranda negra
  const mz = cz - 1.2;
  cant.add(box(cw + .6, .22, 3.2, m.base, cx, ch + .1, mz - .4));
  for (let i = 0; i < 7; i++) {
    cant.add(box(1.05, 1.5, .08, m.dark, cx - cw / 2 + .55 + i * 1.3, ch + 1.1, mz - 1.9));
    cant.add(box(.1, 1.7, .1, std({ color: 0xa57a56 }), cx - cw / 2 - .05 + i * 1.3, ch + 1.1, mz - 1.9));
  }
  cant.add(box(cw + .4, .08, .1, std({ color: 0xb98a5e }), cx, ch + 1.95, mz - 1.9));
  cant.add(box(cw + .6, .06, .05, m.dark, cx, ch + .95, mz + .15));
  for (let i = 0; i < 30; i++) cant.add(box(.03, .8, .03, m.dark, cx - cw / 2 - .3 + i * (cw + .6) / 29, ch + .55, mz + .15));
  cant.add(box(cw, 1.4, .06, m.wall, cx, ch + 1.0, mz - .35));
  // Banderas argentinas detrás del vidrio
  const flagMat = std({ map: flagTexture(), side: THREE.DoubleSide });
  const flag1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7), flagMat);
  flag1.position.set(cx - 3.4, 2.7, cz - .08); cant.add(flag1);
  const flag2 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), flagMat);
  flag2.position.set(cx - .5, 2.3, cz - .1); flag2.rotation.z = -.12; cant.add(flag2);
  // Escalera hacia el entrepiso, pegada a la pared derecha
  for (let i = 0; i < 14; i++) {
    cant.add(box(1.4, .22, .45, std({ color: 0x2c3033 }), hw - 1.0, .3 + i * .33, cz - .2 - i * .42));
  }
  root.add(cant);

  // Pared derecha: ventanas altas
  for (let i = 0; i < 3; i++) root.add(box(.1, 1.6, 1.3, m.dark, hw - .1, 5.2, -6 - i * 2.2));

  // Columna blanca con zócalo gris (como en la foto del playón)
  const col = new THREE.Group();
  col.add(box(1.0, 1.5, 1.0, m.base, 0, .75, 0), box(.9, wallH, .9, m.wall, 0, 1.5 + wallH / 2, 0));
  for (const [x, z] of [[-hw + 2.2, -9], [-hw + 2.2, -24]]) { const c = col.clone(); c.position.set(x, 0, z); root.add(c); }

  // Props
  const dump = new THREE.Group();
  dump.add(box(2.6, .85, 1.3, std({ map: dumpsterTexture(), roughness: .7, metalness: .2 }), 0, .6, 0));
  const junk = std({ color: 0x9a7a52, roughness: 1 });
  for (let i = 0; i < 11; i++) {
    const c = box(.5 + Math.random() * .5, .08 + Math.random() * .2, .4 + Math.random() * .5, junk, -.9 + Math.random() * 1.8, 1.1 + Math.random() * .3, -.3 + Math.random() * .6);
    c.rotation.set(Math.random() * .4, Math.random() * 3, Math.random() * .4); dump.add(c);
  }
  dump.position.set(3.2, 0, -35.5); root.add(dump);

  const moto = new THREE.Group();
  for (const z of [-.75, .75]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(.32, .07, 8, 22), m.dark);
    w.rotation.y = Math.PI / 2; w.position.set(0, .35, z); moto.add(w);
  }
  moto.add(box(.22, .28, .9, std({ color: 0x0b1018, metalness: .6, roughness: .3 }), 0, .78, -.1));
  moto.add(box(.16, .1, .5, m.dark, 0, .98, .45));
  moto.add(box(.2, .04, .75, m.dark, 0, 1.0, .4));
  moto.add(box(.55, .04, .04, m.steel, 0, 1.12, -.75));
  moto.add(box(.05, .6, .05, m.steel, 0, .72, -.7));
  moto.position.set(-2.6, 0, -33.5); moto.rotation.y = .5; root.add(moto);

  const table = (x, z, ry = 0, w = 2.2) => {
    const g = new THREE.Group();
    g.add(box(w, .06, .8, m.wood, 0, .75, 0));
    for (const dx of [-w / 2 + .1, w / 2 - .1]) for (const dz of [-.3, .3]) g.add(box(.05, .75, .05, m.dark, dx, .37, dz));
    g.position.set(x, 0, z); g.rotation.y = ry; return g;
  };
  [[4.5, -31.5, .05, 2.6], [-7, -20, .3, 2.2], [-8.5, -14, 0, 2.2]].forEach(a => root.add(table(...a)));
  root.add(bench(-4.5, -37, 3.4), bench(.6, -25.6, 2));

  // Pizarras verdes con flores de papel
  const board = (x, z, ry) => {
    const g = new THREE.Group();
    g.add(box(1.6, 1.25, .08, std({ color: 0x3f6b3f, roughness: .9 }), 0, 1.3, 0));
    g.add(box(1.7, .08, .1, m.dark, 0, 1.95, 0), box(1.7, .08, .1, m.dark, 0, .66, 0));
    for (const [fx, fy, c] of [[-.5, 1.7, 0xffffff], [-.1, 1.5, 0x9be0c4], [.45, 1.75, 0xf3f0a0], [.5, 1.1, 0xb7e6c9]]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(.12, 7), new THREE.MeshBasicMaterial({ color: c }));
      f.position.set(fx, fy, .05); g.add(f);
    }
    g.position.set(x, 0, z); g.rotation.y = ry; return g;
  };
  root.add(board(-10, -4, .4), board(-8.2, -3, -.25), board(-6, -16, .1));

  // Canasta de básquet sobre la pared del fondo izquierdo
  const hoop = new THREE.Group();
  hoop.add(box(1.2, .8, .06, std({ color: 0xf2f2f2 }), 0, 0, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.24, .02, 6, 18), m.orange);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, -.35, .3); hoop.add(ring);
  hoop.position.set(-8.4, 3.4, -L + .35); root.add(hoop);

  // Banderines (guirnalda) cruzando el fondo
  const bunting = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    const tri = new THREE.Mesh(new THREE.ConeGeometry(.14, .26, 3), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2f8a43 : 0xf1f1ea }));
    tri.rotation.set(Math.PI, 0, 0);
    tri.position.set(-12 + t * 24, 3.9 - Math.sin(t * Math.PI) * -.35 - .35 + Math.sin(t * Math.PI * 4) * .08, -L + 1.2);
    bunting.add(tri);
  }
  root.add(bunting);

  // Planta y cantero junto a la cantina
  const plant = new THREE.Group();
  plant.add(box(2.4, .55, 1.2, std({ color: 0x50575a }), 0, .27, 0));
  const leaf = std({ color: 0x2e6b34, roughness: .7 });
  for (let i = 0; i < 26; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(.22 + Math.random() * .14, 7, 5), leaf);
    l.scale.y = .3; l.position.set(-1 + Math.random() * 2, .7 + Math.random() * 1.6, -.4 + Math.random() * .8);
    l.rotation.set(Math.random() * 3, Math.random() * 3, 0); plant.add(l);
  }
  plant.position.set(.4, 0, -26); root.add(plant);

  // Tacho verde delante de la reja
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(.3, .26, .85, 12), std({ color: 0x2d8a42 }));
  bin.position.set(cx - 1.2, .43, cz + 1.0); root.add(bin);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 8), std({ color: 0x14161c, roughness: .4 }));
  bag.position.set(cx - 1.2, .9, cz + 1.0); bag.scale.y = .6; root.add(bag);

  // Luces: ambiente fría de galpón + puntos cálidos junto a las lámparas
  root.add(new THREE.HemisphereLight(0xdfe7ee, 0x6e7173, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-6, 14, 6); root.add(key);
  for (const [x, z] of [[-1, -10], [3, -17], [-6, -26], [5, -33]]) {
    const p = new THREE.PointLight(0xfff4e0, 16, 22, 1.5); p.position.set(x, ridge - 3.2, z); root.add(p);
  }
  for (const x of [-9, -3, 3]) {
    const p = new THREE.PointLight(0xfff4e0, 14, 14, 1.6); p.position.set(x, 4.2, -L + 3.2); root.add(p);
  }
  return root;
}
