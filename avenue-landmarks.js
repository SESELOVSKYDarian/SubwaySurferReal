import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Seis geometrías fusionadas como máximo, reutilizando los meshes del edificio.
// X crece hacia el fondo del lote; Z sigue la avenida; Y parte de la vereda.
export function landmarkGeometry(profile, width) {
  const parts = { body: [], front: [], trim: [], detail: [], glass: [], secondary: [] };
  const box = (key, dx, dy, dz, x, y, z, angle = 0) => {
    parts[key].push(new THREE.BoxGeometry(dx, dy, dz).rotateY(angle).translate(x, y, z));
  };
  const panel = (key, w, h, x, y, z, rect = [0, 0, 1, 1], rotation = -Math.PI / 2) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i,
      rect[0] + uv.getX(i) * rect[2], 1 - rect[1] - rect[3] + uv.getY(i) * rect[3]);
    parts[key].push(geo.rotateY(rotation).translate(x, y, z));
  };
  const prism = (key, outline, depth, x = 0) => {
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
    parts[key].push(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2).translate(x, 0, 0));
  };
  const { kind, height: h } = profile;

  if (kind === 'station') {
    // Playa abierta y minimercado al fondo: la marquesina no tapa los surtidores.
    box('body', 10.8, .22, width, 5.2, h - .55, 0);
    box('detail', 10.9, .55, width + .12, 5.2, h - .18, 0);
    for (const z of [-width * .32, width * .32]) box('body', .3, h - .7, .35, 7.9, (h - .7) / 2, z);
    box('body', 4.5, 3.2, width * .8, 13, 1.6, 0);
    panel('glass', width * .72, 2.4, 10.72, 1.6, 0);
    panel('front', width * .95, .51, -.27, h - .18, 0, [0, 0, 1, .25]);
    panel('front', width * .65, .55, 10.7, 2.8, 0, [0, .25, 1, .12]);
    for (const z of [-width * .25, 0, width * .25]) {
      box('trim', 2.2, .15, 2.3, 3.5, .075, z);
      box('body', .8, 1.8, 1.1, 3.5, 1.05, z);
      box('detail', .83, .45, 1.13, 3.5, .5, z);
      panel('front', 1.08, 1.38, 3.08, 1.2, z, [0, .4, .25, .6]);
    }
    // Tótem legible desde el corredor, con los colores de la bandera.
    box('body', .32, h + 1, 2.1, .3, (h + 1) / 2, width * .38);
    panel('front', 2.13, h, .12, h / 2 + .6, width * .38, [.28, .4, .72, .6]);
  } else if (kind === 'bendu') {
    // Nave portuaria: fascia alta quebrada, retorno y gran zócalo vidriado.
    const edge = width / 2;
    prism('body', [[-edge, 6.2], [-edge, 8], [-width * .06, 8.8], [edge, h], [edge, 6.2]], 20);
    box('body', 5, 6.3, .35, 17.5, 3.15, -edge + .2);
    panel('glass', width, 6.2, .03, 3.1, 0);
    panel('glass', 20, 6.2, 10, 3.1, edge, [0, 0, 1, 1], 0);
    for (let i = 0; i <= 10; i++) box('detail', .24, 6.3, .16, -.08, 3.15, -edge + i * width / 10);
    for (const y of [0, 3.2, 6.2]) box('detail', .35, .14, width, -.05, y + .1, 0);
    // Voladizo en diagonal: conserva el vacío bajo el gran volumen negro.
    box('body', 11.5, .65, width * .47, 5.1, 6.45, -width * .21, -.16);
    panel('front', width * .3, 2.6, -.025, 9.4, width * .28);
    panel('front', 11, 2.5, 8, 9.6, edge + .025, [0, 0, 1, 1], 0);
    panel('front', 10, 1.8, 8, 7, -edge - .025, [0, 0, 1, 1], Math.PI);
    box('trim', 22, .2, width + .3, 10, .1, 0);
    // Palmas de silueta: seis hojas planas por copa, sin transparencias ni sombras.
    for (const z of [-width * .37, width * .32]) {
      parts.body.push(new THREE.CylinderGeometry(.12, .22, 7.5, 6).translate(-1.1, 3.75, z));
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          -1.1, 7.5, z,
          -1.1 + Math.cos(a) * 2.6, 7.1, z + Math.sin(a) * 2.6,
          -1.1 + Math.cos(a + .35) * 1.3, 7.8, z + Math.sin(a + .35) * 1.3,
        ], 3));
        geo.computeVertexNormals();
        // Igualar atributos e índice con las primitivas antes de fusionar.
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2));
        geo.setIndex([0, 1, 2, 2, 1, 0]);
        parts.secondary.push(geo);
      }
    }
  } else if (kind === 'lumber') {
    // La sede del 4153 tiene una bóveda clara y un showroom rectangular adosado.
    const base = 5.9, radius = h - base;
    const outline = [[-width / 2, base]];
    for (let i = 0; i <= 10; i++) {
      const z = -width / 2 + width * i / 10;
      outline.push([z, base + radius * Math.sqrt(Math.max(0, 1 - (2 * z / width) ** 2))]);
    }
    outline.push([width / 2, base]);
    prism('body', outline, .32);
    for (const z of [-width / 2, width / 2]) box('body', 16, base, .3, 8, base / 2, z);
    box('body', .35, base, width * .3, .1, base / 2, width * .35);
    // La curva se resuelve con diez paneles, en lugar de un techo subdividido.
    for (let i = 0; i < 10; i++) {
      const [z1, y1] = outline[i + 1], [z2, y2] = outline[i + 2];
      const geo = new THREE.BoxGeometry(16.2, .16, Math.hypot(z2 - z1, y2 - y1) + .08);
      geo.rotateX(-Math.atan2(y2 - y1, z2 - z1)).translate(8, (y1 + y2) / 2, (z1 + z2) / 2);
      parts.trim.push(geo);
    }
    box('body', 3, 7.5, width * .29, -.5, 3.75, -width * .32);
    panel('front', width * .29, 7.2, -2.02, 3.75, -width * .32, [0, .32, 1, .68]);
    panel('front', width * .27, 2.1, -.09, 6.3, width * .31, [0, 0, 1, .3]);
    // Portón oscuro abierto y pilas de tablas, en geometría compartida.
    panel('glass', width * .32, 5.9, 1.8, 2.95, width * .01);
    for (let i = 0; i < 7; i++) {
      box('secondary', 3.4, .22, width * .22, -.25 + i % 2 * .12, .25 + i * .31, width * .27);
      box('secondary', 1.5, 2.6, .18, .2 + i * .25, 1.3, -width * .04);
    }
    for (const z of [-width * .46, -width * .32, -width * .18]) box('detail', .14, 7.6, .1, -2.12, 3.8, z);
    for (const y of [0, 3.5, 5.4, 7.5]) box('detail', .15, .13, width * .3, -2.12, y, -width * .32);
  } else if (kind === 'school') {
    box('body', 8, h, width, 4, h / 2, 0);
    panel('front', width, h, -.04, h / 2, 0);
    box('trim', 8.4, .22, width + .2, 4, h + .1, 0);
    // Franjas y dinteles del frente; las rejas y letras quedan pintadas en atlas.
    for (const y of [3.3, 4.8, 7.8]) box('body', .35, .15, width, -.1, y, 0);
    box('secondary', .36, .8, width, -.12, .4, 0);
    box('detail', 1.7, .12, width * .2, -.8, 3.2, width * .25);
  }

  return Object.fromEntries(Object.entries(parts).map(([key, geometries]) => {
    const plain = geometries.map(item => item.index ? item.toNonIndexed() : item);
    const geometry = plain.length ? mergeGeometries(plain) : null;
    plain.forEach(item => { if (!geometries.includes(item)) item.dispose(); });
    geometries.forEach(item => item.dispose());
    return [key, geometry];
  }));
}
