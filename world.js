// Escenario: calle, muros con grafitis, vallas, edificios y skyline.
// Los edificios y los muros siguen un recorrido fijo que se repite en San Juan.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { surface } from './materials.js';
import { LOT_LENGTH, avenueSample, buildingAt, isLandmarkKind } from './avenue-route.js';
import { avenueFacade, avenueStreetSign } from './avenue-facades.js';
import { landmarkGeometry } from './avenue-landmarks.js';
import * as S from './street-textures.js';

export const LANE_X = [-2.2, 0, 2.2];
export const NEAR_Z = 24;     // un poco por detrás de la cámara
const FAR_Z = -336;           // hasta donde llega el escenario
const TILE = 8;               // repetición del asfalto (las marcas van cada 4 m)
const SEG = 24;               // largo de cada tramo de muro
const WALL_X = 6.4;
const WALL_H = 3.6;           // el nivel de la calle está encima del muro
const BUILD_X = 10.5;
const GUTTER_X = 3.75;        // cordón de la vereda baja, junto a la calzada
const ROOF_KINDS = ['textile', 'arched', 'workshop', 'apartments', 'corner', 'mall'];

// UV en metros para cajas fusionadas: la textura conserva su escala real en
// cada pieza (paredón, pilastras) en lugar de estirarse a cada cara.
function worldUv(geo, uMeters, vMeters, offsetY = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i) - offsetY, z = p.getZ(i);
    if (ny > .5) uv.setXY(i, z / uMeters, x / vMeters);
    else if (nx > .5) uv.setXY(i, z / uMeters, y / vMeters);
    // Caras que miran a ±z (laterales de pilastras): desfasadas para no caer
    // sobre la junta vertical del paño.
    else uv.setXY(i, (x + 2.2) / uMeters, y / vMeters);
  }
  uv.needsUpdate = true;
  return geo;
}

// Pinta cada pieza de una geometría fusionada con un color de vértice.
function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

// El escenario usa materiales Lambert (mucho más baratos de dibujar que los PBR);
// solo los metales usan MeshStandardMaterial para tener reflejos.
const mat = ({ metalness, roughness, roughnessMap, ...o } = {}) =>
  metalness
    ? new THREE.MeshStandardMaterial({ metalness, roughnessMap, roughness: roughness ?? 0.85, ...o })
    : new THREE.MeshLambertMaterial(o);

// Copia una geometría ya colocada (para fusionar piezas en un solo mesh)
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

// Las sombras se activan solo en los tramos visibles que recicla el recorrido.
function mesh(geo, material, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Mobiliario urbano de la vereda baja, en coordenadas del tramo (24 m).
function buildFurniture(s) {
  const A = 1024;
  const rectUv = ([x, y, w, h]) => [x / A, 1 - (y + h) / A, (x + w) / A, 1 - y / A];
  const remap = (g, [u0, v0, u1, v1]) => {
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    return g.index ? g.toNonIndexed() : g;
  };
  const solid = (g, name) => {
    const [x, y, w, h] = S.ATLAS.swatch(name);
    const u = (x + w / 2) / A, v = 1 - (y + h / 2) / A, uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u, v);
    return g.index ? g.toNonIndexed() : g;
  };
  const wallX = s * (WALL_X - .35 - .012);
  const facing = -s * Math.PI / 2;          // planos mirando hacia la calzada
  const poster = (i, z, y, scale = 1, tilt = 0) => remap(new THREE.PlaneGeometry(.5 * scale, .69 * scale)
    .rotateZ(tilt).rotateY(facing).translate(wallX - s * i * .0015, y, z), rectUv(S.ATLAS.posters[i % 8]));
  const cluster = (z0, seed, count) => {
    const out = [];
    for (let k = 0; k < count; k++) {
      const r = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
      const f = r - Math.floor(r);
      out.push(poster(seed + k, z0 + (k - count / 2) * .46 + f * .1, 1.55 + (k % 2) * .18 + f * .12, .95 + f * .15, (f - .5) * .06));
    }
    return out;
  };
  const box = (name, w, h, d, x, y, z) => solid(new THREE.BoxGeometry(w, h, d).translate(x, y, z), name);
  const bin = z => [
    solid(new THREE.CylinderGeometry(.26, .23, .8, 10).translate(s * 5.7, .55, z), 'bin'),
    solid(new THREE.CylinderGeometry(.27, .27, .06, 10).translate(s * 5.7, .98, z), 'binDark'),
    box('pole', .05, .15, .05, s * 5.7, .07 + .15, z),
  ];
  const signPost = (z, rect, size = .42) => [
    solid(new THREE.CylinderGeometry(.03, .03, 2.6, 6).translate(s * 4.12, 1.45, z), 'pole'),
    remap(new THREE.PlaneGeometry(size, size).translate(s * 4.12, 2.55, z + .02), rectUv(rect)),   // mira al jugador (+z)
  ];
  // Refugio: dos columnas al frente, panel trasero vidriado, techo inclinado,
  // banco, panel publicitario y cartel de PARADA en un poste junto al cordón.
  const shelter = z => {
    const out = [];
    for (const dz of [-1.5, 1.5]) {
      out.push(box('frame', .07, 2.45, .07, s * 4.55, .15 + 1.22, z + dz));
      out.push(box('frame', .07, 2.25, .07, s * 5.8, .15 + 1.12, z + dz));
    }
    out.push(solid(new THREE.BoxGeometry(1.55, .06, 3.3).rotateZ(s * .07).translate(s * 5.15, 2.52, z), 'roof'));
    out.push(box('glass', .025, 1.7, 2.9, s * 5.8, 1.2, z));
    out.push(box('frame', .05, .08, 3.0, s * 5.8, 2.05, z));
    out.push(box('wood', .38, .05, 1.8, s * 5.5, .62, z - .4), box('frame', .05, .45, .05, s * 5.5, .37, z - 1.1), box('frame', .05, .45, .05, s * 5.5, .37, z + .3));
    out.push(remap(new THREE.PlaneGeometry(1.0, 1.25).rotateY(facing).translate(s * 5.78, 1.2, z + .95), rectUv(S.ATLAS.adPanel)));
    out.push(...signPost(z - 2.2, S.ATLAS.stopSign, .5));
    return out;
  };
  const variants = [
    [...cluster(-6, 0, 5), ...bin(1.5)],
    [...shelter(0), ...cluster(6, 3, 4)],
    [...cluster(0, 5, 6), ...signPost(-6, S.ATLAS.speed), ...bin(6.4)],
    [...bin(-5.5), ...signPost(5.6, S.ATLAS.noParking), ...cluster(-1, 2, 3)],
    [...shelter(6), ...bin(-1.2), ...cluster(-6.4, 6, 3)],
    [...cluster(-6, 4, 4), ...cluster(5.8, 1, 5)],
  ];
  return variants.map(parts => {
    const merged = mergeGeometries(parts);
    parts.forEach(p => p.dispose());
    return merged;
  });
}

// Variantes de techo con colores de vértice (una sola llamada de dibujo cada una).
function buildRooftops() {
  const part = (geo, color) => tinted(geo, color);
  const tank = (x, z, r, h, y = 0) => [
    part(new THREE.CylinderGeometry(r, r * .92, h, 10, 1, true).translate(x, y + h / 2, z), 0x1f2122),
    part(new THREE.CylinderGeometry(r * .5, r, .14, 10).translate(x, y + h + .07, z), 0x2b2e30),
  ];
  const stand = (x, z, size, height) => {
    const out = [part(new THREE.BoxGeometry(size, .08, size).translate(x, height, z), 0x6d7174)];
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      out.push(part(new THREE.BoxGeometry(.07, height, .07).translate(x + dx * size * .42, height / 2, z + dz * size * .42), 0x6d7174));
    }
    return out;
  };
  const ac = (x, z) => [
    part(new THREE.BoxGeometry(.85, .6, .32).translate(x, .3, z), 0xc9cbc8),
    part(new THREE.CylinderGeometry(.22, .22, .02, 8, 1, true).rotateX(Math.PI / 2).translate(x - .12, .3, z + .17), 0x55595b),
  ];
  const mast = (x, z, h, bars) => {
    const out = [part(new THREE.CylinderGeometry(.03, .04, h, 4, 1, true).translate(x, h / 2, z), 0x7c8083)];
    for (let k = 0; k < bars; k++) out.push(part(new THREE.BoxGeometry(1.1 - k * .2, .025, .025).translate(x, h - .25 - k * .35, z), 0x7c8083));
    return out;
  };
  const dish = (x, y, z) => [part(new THREE.SphereGeometry(.38, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2.6)
    .scale(1, .5, 1).rotateX(-1.2).translate(x, y, z), 0xe6e6e2)];
  const variants = [
    [...stand(0, 0, 1.3, 1.2), ...tank(0, 0, .58, 1.3, 1.24), ...ac(1.6, -.8), ...ac(1.6, .4), ...mast(-1.4, 1.2, 3.6, 3)],
    [part(new THREE.BoxGeometry(2.2, 2.5, 2.4).translate(0, 1.25, 0), 0xd5cdb9),
      part(new THREE.BoxGeometry(2.4, .12, 2.6).translate(0, 2.56, 0), 0x9f988a),
      part(new THREE.BoxGeometry(.04, 1.9, .9).translate(-1.12, .95, .3), 0x5a4a3c),
      ...tank(-.45, -.5, .48, 1.1, 2.62), ...tank(.55, .45, .48, 1.1, 2.62), ...dish(1.12, 1.8, -.7), ...mast(.8, -1.3, 2.4, 2)],
    [part(new THREE.BoxGeometry(1.7, 1.4, 1.7).translate(0, 1.1, 0), 0xb3afa6), ...stand(0, 0, 1.6, .4),
      ...ac(-1.6, .5), ...ac(1.5, -.4), ...ac(1.5, .7), ...mast(.2, 1.4, 4.2, 4), ...dish(-1.3, .5, -1)],
  ];
  return variants.map(parts => {
    const merged = mergeGeometries(parts);
    parts.forEach(p => p.dispose());
    return merged;
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.viewDistance = 230;
    this.metal = mat({ color: 0x3d4247, metalness: 0.7, roughness: 0.5 });
    this.concrete = mat({ map: T.concrete(), color: 0xb6b0a4, ...surface('concrete') });
    this.buildTrack();
    this.buildSides();
    this.buildBuildings();
    this.buildSkyline();
    this.update(0, 0);
  }

  buildTrack() {
    const len = Math.ceil((NEAR_Z - FAR_Z) / TILE) * TILE;
    this.track = new THREE.Group();
    const center = NEAR_Z - len / 2;

    // Calzada: una textura de todo el ancho (12,8 m × 8 m) con huellas de
    // rodadura por carril, fisuras selladas y cordón cuneta.
    const road = S.roadSurface(LANE_X, GUTTER_X);
    road.map.repeat.set(1, len / S.ROAD_PERIOD);
    road.roughness.repeat.copy(road.map.repeat);
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: road.map, roughnessMap: road.roughness, roughness: .96, metalness: 0, envMapIntensity: .35,
    });
    const ground = mesh(new THREE.PlaneGeometry(S.ROAD_WIDTH, len), this.roadMaterial, { receive: true });
    ground.name = 'AsphaltRoad';
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = center;
    this.track.add(ground);

    // Líneas de carril discontinuas (3 m de pintura cada 4 m) y bordes continuos.
    const dashes = Math.floor(len / 4);
    const paint = mat({ color: 0xd9d6c8 });
    const markings = new THREE.InstancedMesh(new THREE.PlaneGeometry(.12, 3), paint, dashes * 2);
    markings.name = 'LaneMarkings';
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    let i = 0;
    for (const x of [-1.1, 1.1]) for (let k = 0; k < dashes; k++) {
      matrix.compose(new THREE.Vector3(x, .008, NEAR_Z - k * 4), q, new THREE.Vector3(1, 1, 1));
      markings.setMatrixAt(i++, matrix);
    }
    this.track.add(markings);
    const edgeLine = new THREE.PlaneGeometry(.12, len).rotateX(-Math.PI / 2);
    for (const x of [-3.35, 3.35]) {
      const edge = mesh(edgeLine, paint);
      edge.position.set(x, .007, center);
      this.track.add(edge);
    }

    // Veredas de baldosas de 9 panes: abajo junto a la calzada y arriba del paredón.
    const tiles = S.sidewalk();
    const sidewalkMaterial = (width) => {
      const map = tiles.map.clone(), bump = tiles.bump.clone();
      map.repeat.set(width, len);
      bump.repeat.copy(map.repeat);
      map.needsUpdate = bump.needsUpdate = true;
      return mat({ map, bumpMap: bump, bumpScale: 1.4 });
    };
    const lowWidth = WALL_X - .35 - (GUTTER_X + .16);
    const highWidth = BUILD_X - WALL_X;
    const lowMaterial = sidewalkMaterial(lowWidth), highMaterial = sidewalkMaterial(highWidth);
    this.curbMaterial = mat({ color: 0x9a968e });
    for (const s of [-1, 1]) {
      const low = mesh(new THREE.BoxGeometry(lowWidth, .15, len), lowMaterial, { receive: true });
      low.name = 'LowerSidewalk';
      low.position.set(s * (GUTTER_X + .16 + lowWidth / 2), .075, center);
      // Cordón de granito con canto redondeado.
      const curb = mesh(new THREE.BoxGeometry(.16, .17, len), this.curbMaterial, { receive: true });
      curb.position.set(s * (GUTTER_X + .08), .085, center);
      const high = mesh(new THREE.BoxGeometry(highWidth, .2, len), highMaterial, { receive: true });
      high.name = 'UpperSidewalk';
      high.position.set(s * (WALL_X + highWidth / 2), WALL_H - .1, center);
      this.track.add(low, curb, high);
    }
    this.scene.add(this.track);
  }

  buildSides() {
    // Paredón de hormigón encofrado (6 m × 3,6 m por repetición) con pilastras
    // cada 6 m; los grafitis son solo pintura sobre ese hormigón.
    const wallTex = S.retainingWall();
    this.wallMaterial = mat({ map: wallTex.map, bumpMap: wallTex.bump, bumpScale: 2.2 });
    const blank = mat({ visible: false });
    const graffitiMats = Array.from({ length: 6 }, (_, i) => {
      if (i < 2) return blank;
      const map = T.graffitiWall(['aldosivi', 'alvarado', 'spot', 'mdp'][i - 2], true);
      return mat({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .22, alphaTest: .35 });
    });
    this.blankGraffiti = blank;
    const chain = T.chainLink();
    chain.repeat.set(SEG / 1.2, 2.2 / 1.2);
    const fenceMat = mat({
      map: chain, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5,
    });

    const wallGeo = {};
    for (const s of [-1, 1]) {
      const parts = [new THREE.BoxGeometry(0.7, WALL_H, SEG).translate(s * WALL_X, WALL_H / 2, 0)];
      for (let z = -SEG / 2 + 3; z < SEG / 2; z += 6) {
        parts.push(new THREE.BoxGeometry(.16, WALL_H - .04, .5).translate(s * (WALL_X - .35 - .08), (WALL_H - .04) / 2, z));
      }
      // Coronamiento con goterón (sobresale hacia la calle) y canaleta al pie.
      parts.push(new THREE.BoxGeometry(.2, .14, SEG).translate(s * (WALL_X - .42), WALL_H - .07, 0));
      wallGeo[s] = worldUv(mergeGeometries(parts.map(p => p.toNonIndexed())), 6, 3.6);
      parts.forEach(p => p.dispose());
    }
    const capGeo = new THREE.BoxGeometry(0.95, 0.18, SEG);
    const graffitiGeo = new THREE.PlaneGeometry(SEG, WALL_H);
    const fenceGeo = new THREE.PlaneGeometry(SEG, 2.2).rotateY(Math.PI / 2);
    const topGeo = {};
    for (const s of [-1, 1]) topGeo[s] = placed(capGeo, s * WALL_X, WALL_H + 0.09, 0);

    const post = new THREE.CylinderGeometry(0.045, 0.045, 2.3, 6);
    const railZ = new THREE.CylinderGeometry(0.035, 0.035, SEG, 6).rotateX(Math.PI / 2);
    const frameParts = [placed(railZ, 0, 2.25, 0), placed(railZ, 0, 0.1, 0)];
    for (let z = -SEG / 2; z < SEG / 2; z += 3) frameParts.push(placed(post, 0, 1.15, z));
    const frameGeo = mergeGeometries(frameParts);

    // Farola LED urbana: base, columna cónica, brazo curvo hacia la calle y
    // luminaria plana con difusor emisivo (el brazo apunta a -x; se refleja).
    const arc = new THREE.TorusGeometry(.55, .045, 6, 10, Math.PI / 2).rotateZ(Math.PI / 2).translate(-.55, 5.0, 0);
    const lampGeo = mergeGeometries([
      new THREE.BoxGeometry(.34, .5, .34).translate(0, .25, 0),
      new THREE.CylinderGeometry(.06, .11, 5.0, 10).translate(0, 2.75, 0),
      arc,
      new THREE.CylinderGeometry(.045, .045, 1.0, 6).rotateZ(Math.PI / 2).translate(-1.05, 5.55, 0),
      new THREE.BoxGeometry(.78, .1, .3).translate(-1.75, 5.55, 0),
    ].map(g => (g.index ? g.toNonIndexed() : g)));
    const lampHeadGeo = new THREE.BoxGeometry(.66, .025, .22).translate(-1.75, 5.49, 0);
    const lampHeadMat = mat({ color: 0xfff3dc, emissive: 0xffefd2, emissiveIntensity: 1.6 });
    const lampMat = mat({ color: 0x5e6366, metalness: 0.6, roughness: 0.45 });

    const trunkGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.10, 0.2, 2.8, 9).translate(0, 1.4, 0),
      new THREE.CylinderGeometry(0.035, 0.08, 1.7, 6).rotateZ(0.55).translate(-0.45, 2.5, 0),
      new THREE.CylinderGeometry(0.035, 0.07, 1.6, 6).rotateZ(-0.65).translate(0.45, 2.5, 0),
    ]);
    const leafParts = [];
    for (let i = 0; i < 40; i++) {
      const angle = i * 2.39996;
      const radius = Math.sqrt((i + 0.5) / 40) * 1.4;
      leafParts.push(placed(new THREE.PlaneGeometry(1.6, 1.6),
        Math.cos(angle) * radius, 3.4 + Math.sin(i * 1.7) * 0.65,
        Math.sin(angle) * radius, Math.sin(i * 0.9) * 0.7, angle));
    }
    const foliageGeo = mergeGeometries(leafParts);
    leafParts.forEach(part => part.dispose());
    const trunkMat = mat({ color: 0x554c3d, ...surface('concrete') });
    const leafTexture = T.foliage();
    const foliageMats = [0xa2aa8e, 0x8e9a80, 0xb0ad8c].map(color => mat({
      color, map: leafTexture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
    }));

    // Detalles de calzada por tramo: tapa de cloaca, rejillas al pie del cordón,
    // bacheo y manchas. Pocas variantes fusionadas; cada tramo usa una.
    // Mismo modelo de luz que el asfalto (PBR) para que no se vean como parches negros.
    const decalMat = new THREE.MeshStandardMaterial({
      map: S.roadDecals(), transparent: true, depthWrite: false, roughness: .92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const decal = (rect, w, d, x, z, rot = 0) => {
      const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rot).translate(x, .012, z);
      const uv = g.attributes.uv, [u0, v0, u1, v1] = S.DECAL_RECTS[rect];
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
      return g;
    };
    this.decalVariants = {};
    for (const s of [-1, 1]) {
      this.decalVariants[s] = [0, 1, 2, 3].map(v => {
        const parts = [decal('grate', .9, .45, s * (GUTTER_X - .3), -8 + v * 3, Math.PI / 2),
          decal('grate', .9, .45, s * (GUTTER_X - .3), 7 - v * 2, Math.PI / 2)];
        if (v !== 3) parts.push(decal('manhole', .9, .9, s * [1.1, 2.2, .3][v], -3 + v * 5, v));
        if (v === 1 || v === 3) parts.push(decal('patch', 2.2, 1.5, s * (1.7 + v * .25), 4 - v, .15 * v));
        if (v === 2) parts.push(decal('stain', 1.4, 1.1, s * 2.2, -6 + v * 4, v));
        const merged = mergeGeometries(parts);
        parts.forEach(p => p.dispose());
        return merged;
      });
    }

    // Mobiliario de la vereda baja: afiches pegados, paradas de colectivo,
    // cestos y señales. Un material (atlas) y una geometría por variante.
    this.furnitureMaterial = mat({ map: S.streetAtlas(), alphaTest: .5, side: THREE.DoubleSide });
    this.furnitureVariants = { [-1]: buildFurniture(-1), [1]: buildFurniture(1) };

    this.segments = [];
    this.segCount = Math.ceil((NEAR_Z - FAR_Z) / SEG) + 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < this.segCount; i++) {
        const g = new THREE.Group();
        const wall = mesh(wallGeo[s], this.wallMaterial, { cast: true, receive: true });
        g.add(wall);
        const graffiti = mesh(graffitiGeo, graffitiMats[0], { cast: false });
        graffiti.rotation.y = -s * Math.PI / 2;
        graffiti.position.set(s * (WALL_X - 0.356), WALL_H / 2, 0);
        g.add(graffiti);
        const top = mesh(topGeo[s], this.concrete, { cast: true, receive: true });
        g.add(top);
        const fence = new THREE.Mesh(fenceGeo, fenceMat);
        fence.position.set(s * WALL_X, WALL_H + 1.3, 0);
        g.add(fence);
        const frame = mesh(frameGeo, this.metal);
        frame.position.set(s * WALL_X, WALL_H + 0.1, 0);
        g.add(frame);

        const lamp = new THREE.Group();
        lamp.add(mesh(lampGeo, lampMat), mesh(lampHeadGeo, lampHeadMat));
        lamp.scale.x = s;
        lamp.position.set(s * (WALL_X + 0.7), WALL_H, 0);
        g.add(lamp);

        const tree = new THREE.Group();
        const foliage = mesh(foliageGeo, foliageMats[0]);
        tree.add(mesh(trunkGeo, trunkMat), foliage);
        tree.position.set(s * (WALL_X + 2.2), WALL_H, 0);
        g.add(tree);

        const decals = mesh(this.decalVariants[s][0], decalMat, { receive: true });
        decals.name = 'RoadDetails';
        g.add(decals);
        const furniture = mesh(this.furnitureVariants[s][0], this.furnitureMaterial);
        furniture.name = 'StreetFurniture';
        g.add(furniture);

        const seg = { s, group: g, wall, top, graffiti, fence, frame, lamp, tree, foliage, foliageMats, graffitiMats, decals, furniture };
        g.position.z = NEAR_Z - SEG / 2 - i * SEG;
        this.scene.add(g);
        this.segments.push(seg);
      }
    }
  }

  randomizeSegment(seg, slot) {
    const sample = channel => avenueSample(slot, seg.s, channel);
    const landmark = isLandmarkKind(buildingAt(slot, seg.s).appearance.kind);
    seg.fence.visible = seg.frame.visible = !landmark;
    seg.graffiti.material = seg.graffitiMats[Math.floor(sample(0) * seg.graffitiMats.length)];
    seg.graffiti.visible = seg.graffiti.material !== this.blankGraffiti;
    seg.lamp.visible = sample(1) < 0.6;
    seg.lamp.position.z = (sample(2) - 0.5) * SEG * 0.8;
    seg.tree.visible = !landmark && sample(3) < 0.65;
    seg.tree.position.z = (sample(4) - 0.5) * SEG * 0.8;
    seg.tree.rotation.y = sample(5) * Math.PI * 2;
    seg.tree.scale.setScalar(0.8 + sample(6) * 0.6);
    seg.foliage.material = seg.foliageMats[Math.floor(sample(7) * seg.foliageMats.length)];
    seg.decals.geometry = this.decalVariants[seg.s][Math.floor(sample(12) * 4)];
    // Sin mobiliario frente a los hitos (estaciones, escuela, maderera).
    seg.furniture.visible = !landmark;
    seg.furniture.geometry = this.furnitureVariants[seg.s][Math.floor(sample(17) * this.furnitureVariants[seg.s].length)];
  }

  buildBuildings() {
    this.avenueMaterials = new Map();
    this.streetSignMaterials = new Map();
    this.windowDetails = new Map();
    this.landmarkDetails = new Map();
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.buildingUnit = unit;
    this.buildingPlane = plane;
    this.roofMaterial = mat({ color: 0x635e52 });
    this.trimMaterial = mat({ color: 0xbcb5a3 });
    this.darkTrimMaterial = mat({ color: 0x3e4847 });
    this.glassMaterial = mat({ color: 0x2f5059, emissive: 0x14252b });
    this.rooftopMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.rooftopVariants = buildRooftops();
    this.partyWall = S.partyWall();
    this.buildings = [];
    this.buildingCount = Math.ceil((NEAR_Z - FAR_Z) / LOT_LENGTH) + 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < this.buildingCount; i++) {
        const group = new THREE.Group();
        group.name = 'JuanBJustoBuilding';
        const box = mesh(unit, this.concrete);
        const facade = mesh(plane, this.concrete);
        facade.rotation.y = -s * Math.PI / 2;
        const cornice = mesh(unit, this.roofMaterial);
        const windows = mesh(unit, this.trimMaterial);
        windows.scale.x = s;
        const awning = mesh(unit, this.darkTrimMaterial);
        const roof = mesh(unit, this.roofMaterial);
        const sign = mesh(plane, this.concrete);
        const post = mesh(unit, this.darkTrimMaterial);
        sign.scale.set(6.5, 1.6, 1);
        sign.position.set(s * (WALL_X + .7), WALL_H + 5.9, 0);
        post.scale.set(.09, 6.1, .09);
        post.position.set(s * (WALL_X + .7), WALL_H + 3.05, -.08);
        const rooftop = mesh(this.rooftopVariants[0], this.rooftopMaterial, { cast: true });
        rooftop.name = 'Rooftop';
        group.add(box, facade, cornice, windows, awning, roof, sign, post, rooftop);
        this.scene.add(group);
        this.buildings.push({ s, group, box, facade, cornice, windows, awning, roof, sign, post, rooftop, slot: null, w: LOT_LENGTH });
      }
    }
  }

  setBuilding(b, slot) {
    const lot = buildingAt(slot, b.s);
    const p = lot.appearance;
    b.slot = slot;
    b.span = lot.span;
    b.group.userData.routeIndex = lot.index;
    b.group.userData.landmark = p.id;
    if (!this.avenueMaterials.has(p.id)) {
      const map = avenueFacade(p);
      this.avenueMaterials.set(p.id, {
        front: isLandmarkKind(p.kind) ? new THREE.MeshBasicMaterial({ map }) : mat({ map }),
        // Medianera revocada: textura compartida teñida con el color del lote.
        side: mat({ color: p.color, map: this.partyWall }),
        accent: mat({ color: p.accent }),
        trim: mat({ color: p.kind === 'lumber' ? 0xcdd0c4 : p.kind === 'bendu' ? 0xb0b2a4 : 0xa8aba0 }),
        secondary: mat({ color: p.secondary }),
      });
    }
    const materials = this.avenueMaterials.get(p.id);
    const w = LOT_LENGTH * lot.span - .6, h = p.height, depth = p.kind === 'mall' ? 13 : 8;
    // Tanques de agua, sala de máquinas y antenas en los techos planos.
    b.hasRooftop = ROOF_KINDS.includes(p.kind) && avenueSample(slot, b.s, 16) < .75;
    b.rooftop.visible = b.hasRooftop;
    if (b.hasRooftop) {
      const pick = avenueSample(slot, b.s, 13);
      b.rooftop.geometry = this.rooftopVariants[Math.floor(pick * this.rooftopVariants.length)];
      b.rooftop.position.set(b.s * (BUILD_X + depth * (.45 + avenueSample(slot, b.s, 14) * .2)),
        WALL_H + h + .12, (avenueSample(slot, b.s, 15) - .5) * Math.max(0, w - 7));
      b.rooftop.rotation.y = b.s > 0 ? 0 : Math.PI;
    }
    if (isLandmarkKind(p.kind)) {
      this.setLandmark(b, p, materials, w);
      this.setBuildingSign(b, lot);
      return;
    }
    for (const part of [b.box, b.facade, b.cornice, b.windows, b.awning, b.roof]) {
      part.visible = true;
      part.rotation.set(0, 0, 0);
      part.scale.set(1, 1, 1);
    }
    for (const part of [b.box, b.cornice, b.awning, b.roof]) part.geometry = this.buildingUnit;
    b.facade.geometry = this.buildingPlane;
    b.facade.rotation.y = -b.s * Math.PI / 2;
    b.cornice.material = this.roofMaterial;
    b.windows.material = this.trimMaterial;
    b.windows.scale.x = b.s;
    const x = b.s * (BUILD_X + depth / 2);
    b.box.material = materials.side;
    b.box.scale.set(depth, h, w);
    b.box.position.set(x, WALL_H + h / 2, 0);
    b.facade.material = materials.front;
    b.facade.scale.set(w, h, 1);
    b.facade.position.set(b.s * (BUILD_X - .018), WALL_H + h / 2, 0);
    b.cornice.scale.set(depth + .25, .24, w + .15);
    b.cornice.position.set(x, WALL_H + h, 0);
    b.awning.material = materials.accent;
    b.awning.visible = ['textile', 'arched', 'mall', 'corner'].includes(p.kind);
    b.awning.scale.set(p.kind === 'mall' ? 1.8 : .9, .2, w - .25);
    b.awning.position.set(b.s * (BUILD_X - .45), WALL_H + h * .59, 0);
    b.roof.visible = p.kind === 'house';
    b.roof.material = materials.accent;
    b.roof.scale.set(depth + .5, .35, w + .35);
    b.roof.rotation.z = b.s * .12;
    b.roof.position.set(x, WALL_H + h + .35, 0);
    b.windows.position.set(b.s * BUILD_X, WALL_H, 0);
    const key = `${p.id}:${lot.span}`;
    if (!this.windowDetails.has(key)) {
      const parts = [];
      const box = new THREE.BoxGeometry(1, 1, 1);
      const piece = (dx, dy, dz, x, y, z) => parts.push(box.clone().scale(dx, dy, dz).translate(x, y, z));
      if (p.kind === 'apartments') {
        for (let floor = 0; floor < 4; floor++) {
          const y = h - (floor + .9) * h / 5.2;
          piece(.9, .13, w, -.4, y, 0);
          piece(.07, .6, w, -.85, y + .35, 0);
          for (let col = 0; col < 8; col++) piece(.07, .6, .045, -.85, y + .35, (col + .5) * w / 8 - w / 2);
        }
      } else if (p.kind === 'arched') {
        for (let col = 0; col < 4; col++) {
          const z = (col + .5) * w / 4 - w / 2;
          const arch = new THREE.TorusGeometry(w / 8 - .28, .12, 3, 8, Math.PI);
          parts.push(placed(arch, -.12, h * .697, z, 0, -Math.PI / 2));
          arch.dispose();
          piece(.32, h * .6, .18, -.1, h * .3, z - w / 8 + .2);
        }
      } else {
        const columns = p.kind === 'mall' ? 8 : 5;
        for (let col = 0; col <= columns; col++) piece(.2, h * .65, .11, -.08, h * .325, col * w / columns - w / 2);
        piece(.25, .16, w, -.1, .35, 0);
      }
      box.dispose();
      this.windowDetails.set(key, mergeGeometries(parts));
      parts.forEach(part => part.dispose());
    }
    b.windows.geometry = this.windowDetails.get(key);
    this.setBuildingSign(b, lot);
  }

  setLandmark(b, profile, materials, width) {
    const key = `${profile.id}:${b.span}`;
    if (!this.landmarkDetails.has(key)) this.landmarkDetails.set(key, landmarkGeometry(profile, width));
    const geometry = this.landmarkDetails.get(key);
    const parts = [
      [b.box, geometry.body, materials.side],
      [b.facade, geometry.front, materials.front],
      [b.cornice, geometry.trim, materials.trim],
      [b.windows, geometry.detail, materials.accent],
      [b.awning, geometry.glass, this.glassMaterial],
      [b.roof, geometry.secondary, materials.secondary],
    ];
    for (const [part, shape, material] of parts) {
      part.visible = !!shape;
      if (!shape) continue;
      part.geometry = shape;
      part.material = material;
      part.rotation.set(0, b.s === -1 ? Math.PI : 0, 0);
      part.position.set(b.s * BUILD_X, WALL_H, 0);
      part.scale.set(1, 1, 1);
    }
  }

  setBuildingSign(b, lot) {
    b.sign.visible = b.post.visible = !!lot.marker;
    if (lot.marker) {
      const key = lot.marker[0];
      if (!this.streetSignMaterials.has(key)) this.streetSignMaterials.set(key, new THREE.MeshBasicMaterial({ map: avenueStreetSign(lot.marker) }));
      b.sign.material = this.streetSignMaterials.get(key);
    }
  }

  // Fondo: edificios medianos y torres de departamentos marplatenses, con
  // grilla de ventanas a escala (12 m × 12 m por repetición) y bruma azulada.
  buildSkyline() {
    const parts = [];
    for (let i = 0; i < 40; i++) {
      const tower = i % 4 === 0;
      const w = tower ? 14 + avenueSample(i, 1, 8) * 10 : 10 + avenueSample(i, 1, 8) * 18;
      const h = tower ? 36 + avenueSample(i, 1, 9) * 34 : 8 + avenueSample(i, 1, 9) * 22;
      const geo = new THREE.BoxGeometry(w, h, w * (tower ? .7 : 1)).toNonIndexed();
      geo.translate((avenueSample(i, 1, 10) - .5) * (tower ? 230 : 170), h / 2,
        FAR_Z - 20 - avenueSample(i, 1, 11) * (tower ? 180 : 140));
      parts.push(worldUv(geo, 12, 12));
    }
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    const skyline = new THREE.Mesh(geometry, mat({ color: 0xb4bcc4, map: S.towerFacade() }));
    skyline.name = 'Skyline';
    this.scene.add(skyline);
  }

  update(move, distance) {
    this.track.position.z = distance % TILE;
    const firstSlot = Math.floor((distance - NEAR_Z) / SEG);
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const slot = firstSlot + i % this.segCount;
      seg.group.position.z = distance - (slot + .5) * SEG;
      seg.group.visible = seg.group.position.z > -this.viewDistance;
      if (seg.slot !== slot) {
        seg.slot = slot;
        this.randomizeSegment(seg, slot);
      }
      seg.wall.castShadow = seg.wall.receiveShadow = seg.group.visible;
      seg.top.castShadow = seg.top.receiveShadow = seg.group.visible;
      seg.frame.castShadow = seg.group.visible && seg.frame.visible;
      seg.frame.receiveShadow = seg.group.visible;
      seg.tree.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = seg.group.visible && seg.tree.visible;
        object.receiveShadow = object.castShadow;
      });
      seg.lamp.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = seg.group.visible && seg.lamp.visible;
      });
    }
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      const slot = firstSlot + i % this.buildingCount;
      const lot = buildingAt(slot, b.s);
      if (lot.offset && slot !== firstSlot) {
        b.group.visible = false;
        b.box.castShadow = b.cornice.castShadow = b.roof.castShadow = false;
        b.box.receiveShadow = b.facade.receiveShadow = b.cornice.receiveShadow = b.roof.receiveShadow = false;
        continue;
      }
      const anchor = slot - lot.offset;
      if (b.slot !== anchor) this.setBuilding(b, anchor);
      b.group.position.z = distance - (anchor + lot.span / 2) * LOT_LENGTH;
      b.group.visible = b.group.position.z + lot.span * LOT_LENGTH / 2 > -this.viewDistance;
      b.box.castShadow = b.cornice.castShadow = b.roof.castShadow = b.group.visible;
      b.box.receiveShadow = b.facade.receiveShadow = b.cornice.receiveShadow = b.roof.receiveShadow = b.group.visible;
      b.windows.visible = !!b.windows.geometry && (b.group.position.z > -90 || isLandmarkKind(lot.appearance.kind));
      // Techos (tanques, antenas): solo en los edificios cercanos.
      b.rooftop.visible = !!b.hasRooftop && b.group.position.z > -60;
    }
  }
}
