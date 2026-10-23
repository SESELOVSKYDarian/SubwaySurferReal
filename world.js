// Escenario: vías, muros con grafitis, vallas, edificios, catenarias y skyline.
// Todo lo que pasa junto al jugador se recicla: al quedar detrás de la cámara se
// manda otra vez al fondo con un aspecto distinto.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { surface } from './materials.js';

export const LANE_X = [-2.2, 0, 2.2];
export const NEAR_Z = 24;     // un poco por detrás de la cámara
const FAR_Z = -336;           // hasta donde llega el escenario
const TILE = 4;               // la grava y las traviesas se repiten cada 4 m
const SEG = 24;               // largo de cada tramo de muro
const WALL_X = 6.4;
const WALL_H = 3.6;           // el nivel de la calle está encima del muro
const BUILD_X = 10.5;
const GANTRY_GAP = 50;

const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

// Copia una geometría ya colocada (para fusionar piezas en un solo mesh)
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.viewDistance = 230;
    this.metal = std({ color: 0x3d4247, metalness: 0.7, roughness: 0.5 });
    this.concrete = std({ map: T.concrete(), color: 0xb6b0a4, ...surface('concrete') });
    this.buildTrack();
    this.buildSides();
    this.buildBuildings();
    this.buildGantries();
    this.buildSkyline();
  }

  buildTrack() {
    const len = Math.ceil((NEAR_Z - FAR_Z) / TILE) * TILE;
    this.track = new THREE.Group();

    const gravelTex = T.gravel();
    gravelTex.repeat.set((WALL_X * 2) / TILE, len / TILE);
    const ground = mesh(new THREE.PlaneGeometry(WALL_X * 2, len), std({ map: gravelTex, ...surface('stone') }), { cast: false });
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = NEAR_Z - len / 2;
    this.track.add(ground);

    // Traviesas: un único InstancedMesh (1 draw call para cientos de piezas)
    const gap = 0.8;
    const perLane = Math.floor(len / gap);
    const sleepers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.9, 0.14, 0.24),
      std({ map: T.wood() }),
      perLane * LANE_X.length,
    );
    const m = new THREE.Matrix4();
    let i = 0;
    for (const x of LANE_X) {
      for (let k = 0; k < perLane; k++) {
        m.makeTranslation(x, 0.07, NEAR_Z - k * gap);
        sleepers.setMatrixAt(i++, m);
      }
    }
    sleepers.receiveShadow = true;
    this.track.add(sleepers);
    this.scene.add(this.track);

    // Raíles y bordillos: son uniformes, así que pueden quedarse quietos
    const railGeo = new THREE.BoxGeometry(0.09, 0.16, len);
    const railTopGeo = new THREE.BoxGeometry(0.075, 0.03, len);
    const railMat = std({ color: 0x6d655d, metalness: 0.8, roughness: 0.6 });
    const railTopMat = std({ color: 0xd8dde2, metalness: 1, roughness: 0.2 });
    for (const x of LANE_X) {
      for (const side of [-0.72, 0.72]) {
        const rail = mesh(railGeo, railMat, { cast: false });
        rail.position.set(x + side, 0.22, NEAR_Z - len / 2);
        this.scene.add(rail);
        const top = mesh(railTopGeo, railTopMat, { cast: false });
        top.position.set(x + side, 0.31, NEAR_Z - len / 2);
        this.scene.add(top);
      }
    }
    for (const s of [-1, 1]) {
      const curb = mesh(new THREE.BoxGeometry(1.4, 0.4, len), std({ color: 0xa8a297 }));
      curb.position.set(s * 4.5, 0.2, NEAR_Z - len / 2);
      this.scene.add(curb);
    }

    // Cables de la catenaria
    const wireGeo = new THREE.CylinderGeometry(0.022, 0.022, len, 4).rotateX(Math.PI / 2);
    const wireMat = std({ color: 0x1a1a1a });
    for (const x of LANE_X) {
      for (const y of [6.3, 6.9]) {
        const w = new THREE.Mesh(wireGeo, wireMat);
        w.position.set(x, y, NEAR_Z - len / 2);
        this.scene.add(w);
      }
    }
  }

  buildSides() {
    const graffitiMats = Array.from({ length: 6 }, (_, i) => i < 2
      ? this.concrete : std({ map: T.graffitiWall(), ...surface('concrete') }));
    const chain = T.chainLink();
    chain.repeat.set(SEG / 1.2, 2.2 / 1.2);
    const fenceMat = std({
      map: chain, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5,
    });

    const wallGeo = new THREE.BoxGeometry(0.7, WALL_H, SEG);
    const capGeo = new THREE.BoxGeometry(0.95, 0.18, SEG);
    const graffitiGeo = new THREE.PlaneGeometry(SEG, WALL_H);
    const walkGeo = new THREE.BoxGeometry(BUILD_X - WALL_X, 0.2, SEG);
    const fenceGeo = new THREE.PlaneGeometry(SEG, 2.2).rotateY(Math.PI / 2);

    const post = new THREE.CylinderGeometry(0.045, 0.045, 2.3, 6);
    const railZ = new THREE.CylinderGeometry(0.035, 0.035, SEG, 6).rotateX(Math.PI / 2);
    const frameParts = [placed(railZ, 0, 2.25, 0), placed(railZ, 0, 0.1, 0)];
    for (let z = -SEG / 2; z < SEG / 2; z += 3) frameParts.push(placed(post, 0, 1.15, z));
    const frameGeo = mergeGeometries(frameParts);

    // Farola (el brazo apunta hacia las vías: -x; se refleja para el otro lado)
    const lampGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.1, 5, 8).translate(0, 2.5, 0),
      new THREE.BoxGeometry(1.4, 0.08, 0.08).translate(-0.7, 4.9, 0),
    ]);
    const lampHeadGeo = new THREE.BoxGeometry(0.45, 0.16, 0.3).translate(-1.35, 4.82, 0);
    const lampHeadMat = std({ color: 0xffe6b0, emissive: 0xffc070, emissiveIntensity: 1.5 });
    const lampMat = std({ color: 0x24302a, metalness: 0.6, roughness: 0.5 });

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
    const trunkMat = std({ color: 0x554c3d, ...surface('concrete') });
    const leafTexture = T.foliage();
    const foliageMats = [0xa2aa8e, 0x8e9a80, 0xb0ad8c].map(color => std({
      color, map: leafTexture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
    }));

    this.segments = [];
    this.segCount = Math.ceil((NEAR_Z - FAR_Z) / SEG) + 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < this.segCount; i++) {
        const g = new THREE.Group();
        const wall = mesh(wallGeo, this.concrete);
        wall.position.set(s * WALL_X, WALL_H / 2, 0);
        g.add(wall);
        const graffiti = mesh(graffitiGeo, graffitiMats[0], { cast: false });
        graffiti.rotation.y = -s * Math.PI / 2;
        graffiti.position.set(s * (WALL_X - 0.356), WALL_H / 2, 0);
        g.add(graffiti);
        const cap = mesh(capGeo, this.concrete);
        cap.position.set(s * WALL_X, WALL_H + 0.09, 0);
        g.add(cap);
        const walk = mesh(walkGeo, this.concrete, { cast: false });
        walk.position.set(s * (WALL_X + (BUILD_X - WALL_X) / 2), WALL_H - 0.1, 0);
        g.add(walk);
        const fence = new THREE.Mesh(fenceGeo, fenceMat);
        fence.position.set(s * WALL_X, WALL_H + 1.3, 0);
        g.add(fence);
        const frame = mesh(frameGeo, this.metal);
        frame.position.set(s * WALL_X, WALL_H + 0.1, 0);
        g.add(frame);

        const lamp = new THREE.Group();
        lamp.add(mesh(lampGeo, lampMat), mesh(lampHeadGeo, lampHeadMat, { cast: false }));
        lamp.scale.x = s;
        lamp.position.set(s * (WALL_X + 0.7), WALL_H, 0);
        g.add(lamp);

        const tree = new THREE.Group();
        const foliage = mesh(foliageGeo, foliageMats[0]);
        tree.add(mesh(trunkGeo, trunkMat), foliage);
        tree.position.set(s * (WALL_X + 2.2), WALL_H, 0);
        g.add(tree);

        const seg = { group: g, wall, graffiti, lamp, tree, foliage, foliageMats, graffitiMats };
        g.position.z = NEAR_Z - SEG / 2 - i * SEG;
        this.randomizeSegment(seg);
        this.scene.add(g);
        this.segments.push(seg);
      }
    }
  }

  randomizeSegment(seg) {
    seg.graffiti.material = seg.graffitiMats[Math.floor(Math.random() * seg.graffitiMats.length)];
    seg.lamp.visible = Math.random() < 0.6;
    seg.lamp.position.z = (Math.random() - 0.5) * SEG * 0.8;
    seg.tree.visible = Math.random() < 0.65;
    seg.tree.position.z = (Math.random() - 0.5) * SEG * 0.8;
    seg.tree.rotation.y = Math.random() * Math.PI * 2;
    seg.tree.scale.setScalar(0.8 + Math.random() * 0.6);
    seg.foliage.material = seg.foliageMats[Math.floor(Math.random() * seg.foliageMats.length)];
  }

  buildBuildings() {
    this.facades = T.FACADE_STYLES.map((s) => T.facade(s));
    const roofMat = std({ color: 0x5b5752 });
    const billboardMat = std({ map: T.billboard(), emissive: 0x330000, roughness: 0.6 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    // Caché por dimensiones: crear una vez y reutilizar al reciclar edificios.
    this.windowDetails = new Map();
    const trimMat = std({ color: 0x8d8981, roughness: 0.92 });

    // Escalera de incendios (6 pisos), hacia -x desde la fachada
    const parts = [];
    const plat = new THREE.BoxGeometry(1.1, 0.06, 3.6);
    const rail = new THREE.BoxGeometry(0.04, 0.9, 3.6);
    const stair = new THREE.BoxGeometry(0.7, 0.06, 3.6);
    for (let k = 1; k <= 6; k++) {
      const y = k * 3.2;
      parts.push(placed(plat, -0.55, y, 0), placed(rail, -1.1, y + 0.45, 0));
      parts.push(placed(stair, -0.45, y - 1.6, 0, Math.atan2(3.2, 3.6) * (k % 2 ? 1 : -1)));
    }
    const upright = new THREE.BoxGeometry(0.05, 6 * 3.2, 0.05);
    for (const z of [-1.8, 1.8]) parts.push(placed(upright, -1.1, 3.2 * 3.5, z));
    const fireGeo = mergeGeometries(parts);
    const fireMat = std({ color: 0x1f2124, metalness: 0.6, roughness: 0.6 });

    this.buildings = [];
    this.buildingEdge = {};
    for (const s of [-1, 1]) {
      let z = NEAR_Z;
      while (z > FAR_Z) {
        const front = this.facades[0].clone();
        const ends = this.facades[0].clone();
        const frontMat = std({ map: front, ...surface('concrete') });
        const endMat = std({ map: ends, ...surface('concrete') });
        // El volumen usa un material; la fachada interior y la cornisa son piezas separadas.
        const box = mesh(unit, endMat, { cast: false });
        const facade = mesh(new THREE.PlaneGeometry(1, 1), frontMat, { cast: false });
        facade.rotation.y = -s * Math.PI / 2;
        const cornice = mesh(unit, roofMat, { cast: false });
        const windows = mesh(unit, trimMat, { cast: false });
        windows.scale.x = s;
        const fire = mesh(fireGeo, fireMat, { cast: false });
        fire.scale.x = s;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), billboardMat);
        board.rotation.y = -s * Math.PI / 2;
        const g = new THREE.Group();
        g.add(box, facade, cornice, windows, fire, board);
        this.scene.add(g);
        const b = { s, group: g, box, facade, cornice, windows, fire, board, front, ends, w: 0 };
        this.randomizeBuilding(b);
        g.position.z = z - b.w / 2;
        z -= b.w;
        this.buildings.push(b);
      }
      this.buildingEdge[s] = z;
    }
  }

  randomizeBuilding(b) {
    const style = Math.floor(Math.random() * this.facades.length);
    const w = 12 + Math.floor(Math.random() * 3) * 4;
    const h = 6.4 * (2 + Math.floor(Math.random() * 6));
    const depth = 8;
    b.w = w;
    for (const [tex, width] of [[b.front, w], [b.ends, depth]]) {
      tex.source = this.facades[style].source;
      tex.repeat.set(width / 8, h / 6.4);
      tex.needsUpdate = true;
    }
    const x = b.s * (BUILD_X + depth / 2);
    b.box.scale.set(depth, h, w);
    b.box.position.set(x, WALL_H + h / 2, 0);
    b.facade.scale.set(w, h, 1);
    b.facade.position.set(b.s * (BUILD_X - 0.012), WALL_H + h / 2, 0);
    b.cornice.scale.set(depth + 0.35, 0.25, w + 0.25);
    b.cornice.position.set(x, WALL_H + h, 0);
    b.windows.position.set(b.s * BUILD_X, WALL_H, 0);
    const key = `${w}:${h}`;
    if (!this.windowDetails.has(key)) {
      const parts = [];
      for (let floor = 0; floor < h / 3.2; floor++) {
        for (let column = 0; column < w / 4; column++) {
          const y = (floor + 0.5) * 3.2;
          const z = (column + 0.5) * 4 - w / 2;
          parts.push(placed(new THREE.BoxGeometry(0.28, 0.12, 2.2), -0.08, y - 0.95, z));
          parts.push(placed(new THREE.BoxGeometry(0.2, 0.13, 2.1), -0.05, y + 0.95, z));
        }
      }
      this.windowDetails.set(key, mergeGeometries(parts));
      parts.forEach(part => part.dispose());
    }
    b.windows.geometry = this.windowDetails.get(key);
    b.fire.visible = style < 2 && h > 20;
    b.fire.position.set(b.s * BUILD_X, WALL_H, (Math.random() - 0.5) * (w - 4));
    b.board.visible = Math.random() < 0.18 && h > 16;
    b.board.position.set(b.s * (BUILD_X - 0.05), WALL_H + 9, 0);
  }

  buildGantries() {
    const post = new THREE.BoxGeometry(0.28, 7.6, 0.28);
    const beam = new THREE.BoxGeometry(10, 0.18, 0.22);
    const brace = new THREE.BoxGeometry(0.08, 0.75, 0.08);
    const parts = [placed(post, -4.9, 3.8, 0), placed(post, 4.9, 3.8, 0), placed(beam, 0, 7.5, 0), placed(beam, 0, 6.95, 0)];
    for (let x = -4.5; x <= 4.5; x += 0.75) parts.push(placed(brace, x, 7.22, 0, 0, 0, (x * 4) % 2 ? 0.7 : -0.7));
    const geo = mergeGeometries(parts);
    this.gantries = [];
    this.gantryCount = Math.ceil((NEAR_Z - FAR_Z) / GANTRY_GAP);
    for (let i = 0; i < this.gantryCount; i++) {
      const g = mesh(geo, this.metal);
      g.position.z = NEAR_Z - 20 - i * GANTRY_GAP;
      this.scene.add(g);
      this.gantries.push(g);
    }
  }

  // Skyline unido en una sola geometría: la bruma oculta el detalle lejano.
  buildSkyline() {
    const parts = [];
    for (let i = 0; i < 34; i++) {
      const w = 10 + Math.random() * 18;
      const h = 40 + Math.random() * 110;
      parts.push(placed(new THREE.BoxGeometry(w, h, w), (Math.random() - 0.5) * 170,
        h / 2, FAR_Z - 20 - Math.random() * 140));
    }
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    this.scene.add(new THREE.Mesh(geometry, std({ color: 0x84909a, roughness: 0.95 })));
  }

  update(move, distance) {
    this.track.position.z = distance % TILE;

    for (const seg of this.segments) {
      seg.group.position.z += move;
      seg.group.visible = seg.group.position.z > -this.viewDistance;
      seg.wall.castShadow = seg.group.position.z > -45;
      if (seg.group.position.z - SEG / 2 > NEAR_Z) {
        seg.group.position.z -= this.segCount * SEG;
        this.randomizeSegment(seg);
      }
    }

    this.buildingEdge[-1] += move;
    this.buildingEdge[1] += move;
    for (const b of this.buildings) {
      b.group.position.z += move;
      b.group.visible = b.group.position.z > -this.viewDistance;
      b.windows.visible = b.group.position.z > -90;
      if (b.group.position.z - b.w / 2 > NEAR_Z) {
        this.randomizeBuilding(b);
        b.group.position.z = this.buildingEdge[b.s] - b.w / 2;
        this.buildingEdge[b.s] -= b.w;
      }
    }

    for (const g of this.gantries) {
      g.position.z += move;
      g.visible = g.position.z > -this.viewDistance;
      g.castShadow = g.position.z > -45;
      if (g.position.z > NEAR_Z) g.position.z -= this.gantryCount * GANTRY_GAP;
    }
  }
}
