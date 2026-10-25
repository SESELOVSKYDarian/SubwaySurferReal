// Escenario: calle, muros con grafitis, vallas, edificios y skyline.
// Los edificios y los muros siguen un recorrido fijo que se repite en San Juan.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { surface } from './materials.js';
import { LOT_LENGTH, avenueSample, buildingAt, isLandmarkKind } from './avenue-route.js';
import { avenueFacade, avenueStreetSign } from './avenue-facades.js';
import { landmarkGeometry } from './avenue-landmarks.js';

export const LANE_X = [-2.2, 0, 2.2];
export const NEAR_Z = 24;     // un poco por detrás de la cámara
const FAR_Z = -336;           // hasta donde llega el escenario
const TILE = 4;               // repetición del asfalto y las marcas viales
const SEG = 24;               // largo de cada tramo de muro
const WALL_X = 6.4;
const WALL_H = 3.6;           // el nivel de la calle está encima del muro
const BUILD_X = 10.5;

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

// Por defecto nada del escenario proyecta ni recibe sombras: es lo más caro de dibujar
function mesh(geo, material, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
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

    const roadTex = T.asphalt();
    roadTex.repeat.set((WALL_X * 2) / TILE, len / TILE);
    const ground = mesh(new THREE.PlaneGeometry(WALL_X * 2, len), mat({ map: roadTex }), { receive: true });
    ground.name='AsphaltRoad';ground.rotation.x = -Math.PI / 2;
    ground.position.z = NEAR_Z - len / 2;this.track.add(ground);
    const perLane = Math.floor(len / TILE);
    const markings = new THREE.InstancedMesh(new THREE.PlaneGeometry(.075,2),mat({color:0xcac7ae}),perLane*2);
    markings.name='LaneMarkings';const matrix=new THREE.Matrix4(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    let i=0;
    for(const x of [-1.1,1.1])for(let k=0;k<perLane;k++){
      matrix.compose(new THREE.Vector3(x,.008,NEAR_Z-k*TILE),q,new THREE.Vector3(1,1,1));markings.setMatrixAt(i++,matrix);
    }
    this.track.add(markings);this.scene.add(this.track);
    for(const x of [-3.5,3.5]){
      const edge=mesh(new THREE.BoxGeometry(.08,.008,len),mat({color:0xb7ac78}));
      edge.position.set(x,.006,NEAR_Z-len/2);this.scene.add(edge);
    }
    for (const s of [-1, 1]) {
      const curb = mesh(new THREE.BoxGeometry(1.4, 0.4, len), mat({ color: 0xa8a297 }), { receive: true });
      curb.position.set(s * 4.5, 0.2, NEAR_Z - len / 2);
      this.scene.add(curb);
    }

  }

  buildSides() {
    const graffitiMats = Array.from({ length: 6 }, (_, i) => {
      if(i<2)return this.concrete;
      const map=T.graffitiWall(['aldosivi','alvarado','spot','mdp'][i-2]);
      return mat({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.28});
    });
    const chain = T.chainLink();
    chain.repeat.set(SEG / 1.2, 2.2 / 1.2);
    const fenceMat = mat({
      map: chain, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5,
    });

    const wallGeo = new THREE.BoxGeometry(0.7, WALL_H, SEG);
    const capGeo = new THREE.BoxGeometry(0.95, 0.18, SEG);
    const graffitiGeo = new THREE.PlaneGeometry(SEG, WALL_H);
    const walkGeo = new THREE.BoxGeometry(BUILD_X - WALL_X, 0.2, SEG);
    const fenceGeo = new THREE.PlaneGeometry(SEG, 2.2).rotateY(Math.PI / 2);
    // Remate del muro + acera de arriba en una sola pieza por lado
    const topGeo = {};
    for (const s of [-1, 1]) {
      topGeo[s] = mergeGeometries([
        placed(capGeo, s * WALL_X, WALL_H + 0.09, 0),
        placed(walkGeo, s * (WALL_X + (BUILD_X - WALL_X) / 2), WALL_H - 0.1, 0),
      ]);
    }

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
    const lampHeadMat = mat({ color: 0xffe6b0, emissive: 0xffc070, emissiveIntensity: 1.5 });
    const lampMat = mat({ color: 0x24302a, metalness: 0.6, roughness: 0.5 });

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

    this.segments = [];
    this.segCount = Math.ceil((NEAR_Z - FAR_Z) / SEG) + 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < this.segCount; i++) {
        const g = new THREE.Group();
        const wall = mesh(wallGeo, this.concrete, { cast: true, receive: true });
        wall.position.set(s * WALL_X, WALL_H / 2, 0);
        g.add(wall);
        const graffiti = mesh(graffitiGeo, graffitiMats[0], { cast: false });
        graffiti.rotation.y = -s * Math.PI / 2;
        graffiti.position.set(s * (WALL_X - 0.356), WALL_H / 2, 0);
        g.add(graffiti);
        g.add(mesh(topGeo[s], this.concrete));
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

        const seg = { s, group: g, wall, graffiti, fence, frame, lamp, tree, foliage, foliageMats, graffitiMats };
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
    seg.lamp.visible = sample(1) < 0.6;
    seg.lamp.position.z = (sample(2) - 0.5) * SEG * 0.8;
    seg.tree.visible = !landmark && sample(3) < 0.65;
    seg.tree.position.z = (sample(4) - 0.5) * SEG * 0.8;
    seg.tree.rotation.y = sample(5) * Math.PI * 2;
    seg.tree.scale.setScalar(0.8 + sample(6) * 0.6);
    seg.foliage.material = seg.foliageMats[Math.floor(sample(7) * seg.foliageMats.length)];
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
        group.add(box, facade, cornice, windows, awning, roof, sign, post);
        this.scene.add(group);
        this.buildings.push({ s, group, box, facade, cornice, windows, awning, roof, sign, post, slot: null, w: LOT_LENGTH });
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
        side: mat({ color: p.color }),
        accent: mat({ color: p.accent }),
        trim: mat({ color: p.kind === 'lumber' ? 0xcdd0c4 : p.kind === 'bendu' ? 0xb0b2a4 : 0xa8aba0 }),
        secondary: mat({ color: p.secondary }),
      });
    }
    const materials = this.avenueMaterials.get(p.id);
    const w = LOT_LENGTH * lot.span - .6, h = p.height, depth = p.kind === 'mall' ? 13 : 8;
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

  // Volúmenes bajos al fondo, en lugar del skyline de rascacielos.
  buildSkyline() {
    const parts = [];
    for (let i = 0; i < 34; i++) {
      const w = 10 + avenueSample(i, 1, 8) * 18;
      const h = 8 + avenueSample(i, 1, 9) * 24;
      parts.push(placed(new THREE.BoxGeometry(w, h, w), (avenueSample(i, 1, 10) - .5) * 170,
        h / 2, FAR_Z - 20 - avenueSample(i, 1, 11) * 140));
    }
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    this.scene.add(new THREE.Mesh(geometry, mat({ color: 0x84909a, roughness: 0.95 })));
  }

  update(move, distance) {
    this.track.position.z = distance % TILE;
    const firstSlot = Math.floor((distance - NEAR_Z) / SEG);
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const slot = firstSlot + i % this.segCount;
      seg.group.position.z = distance - (slot + .5) * SEG;
      seg.group.visible = seg.group.position.z > -this.viewDistance;
      seg.wall.castShadow = seg.group.position.z > -45;
      if (seg.slot !== slot) {
        seg.slot = slot;
        this.randomizeSegment(seg, slot);
      }
    }
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      const slot = firstSlot + i % this.buildingCount;
      const lot = buildingAt(slot, b.s);
      if (lot.offset && slot !== firstSlot) { b.group.visible = false; continue; }
      const anchor = slot - lot.offset;
      if (b.slot !== anchor) this.setBuilding(b, anchor);
      b.group.position.z = distance - (anchor + lot.span / 2) * LOT_LENGTH;
      b.group.visible = b.group.position.z + lot.span * LOT_LENGTH / 2 > -this.viewDistance;
      b.windows.visible = !!b.windows.geometry && (b.group.position.z > -90 || isLandmarkKind(lot.appearance.kind));
    }
  }
}
