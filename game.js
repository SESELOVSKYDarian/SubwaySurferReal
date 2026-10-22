// Juego: corredor, guardia perseguidor, obstáculos, vagones con rampa, jetpack,
// monedas, colisiones y cámara.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World, LANE_X, NEAR_Z } from './world.js';
import * as T from './textures.js';

const SPAWN_Z = -150;
const GRAVITY = 38;
const JUMP_SPEED = 13;
const ROLL_TIME = 0.8;
const START_SPEED = 14;
const MAX_SPEED = 34;
const PLAYER_HALF_DEPTH = 0.3;
const STAND_HEIGHT = 2.1;
const ROLL_HEIGHT = 0.9;
const TRAIN_TOP = 3.3;      // techo de los vagones: se puede correr encima
const RAMP_LEN = 6;
const FLY_Y = 9;            // altura de vuelo con jetpack (por encima de las catenarias)
const FLY_TIME = 7;
const CHASE_TIME = 5;       // segundos que el guardia te pisa los talones tras tropezar

const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Game {
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    this.maxPixelRatio = Math.min(window.devicePixelRatio, 1.25);
    this.quality = 1;
    r.setPixelRatio(this.maxPixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = T.sky();
    this.scene.fog = new THREE.Fog(0xc9d8e6, 70, 430);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);

    // Luz de tarde: sol cálido + cielo azulado
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x6a5848, 1.3));
    const sun = (this.sun = new THREE.DirectionalLight(0xffdcb0, 3.0));
    sun.position.set(10, 24, 12);
    sun.target.position.set(0, 0, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 70 });
    this.scene.add(sun, sun.target);

    this.world = new World(this.scene);
    this.buildAssets();
    this.buildCharacters();

    // Reflejos (mapa de entorno) solo en los metales: en todo lo demás borraría las sombras
    const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    const shine = (m) => {
      if (m?.isMaterial && m.metalness >= 0.5) m.envMap = env;
    };
    this.scene.traverse((o) => [o.material].flat().forEach(shine));
    Object.values(this.A).flat(2).forEach(shine);

    this.obstacles = [];
    this.coins = [];
    this.pickups = [];
    this.reset();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Si el ordenador no llega a ~45 FPS se baja la resolución (y al final las sombras)
  adaptQuality(dt) {
    this.avgDt = this.avgDt ? this.avgDt * 0.95 + dt * 0.05 : dt;
    this.qualityTimer = (this.qualityTimer || 0) + dt;
    if (this.qualityTimer < 2) return;
    this.qualityTimer = 0;
    let q = this.quality;
    if (this.avgDt > 1 / 45 && q > 0.55) q -= 0.15;
    else if (this.avgDt < 1 / 58 && q < 1) q = Math.min(1, q + 0.05);
    if (q !== this.quality) {
      this.quality = q;
      this.renderer.setPixelRatio(this.maxPixelRatio * q);
      this.sun.castShadow = q > 0.6;
      this.resize();
    }
  }

  // Geometrías y materiales compartidos por obstáculos, monedas y objetos
  buildAssets() {
    const white = std({ color: 0xf2f2f2 });
    const redWhite = std({ map: T.stripes('#f4f4f4', '#d62828') });
    const yellowBlack = std({ map: T.stripes('#ffc61a', '#1c1c1c') });
    const gray = std({ color: 0x8b9096, metalness: 0.7, roughness: 0.4 });
    const dark = std({ color: 0x222426, metalness: 0.4 });
    const lamp = std({ color: 0xff5a1f, emissive: 0xff3b00, emissiveIntensity: 2 });
    const headlight = std({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 3 });

    const trains = ['#2e8a4f', '#3a6fb0', '#a9aeb5'].map((c) => {
      const side = std({ map: T.trainSide(c), metalness: 0.35, roughness: 0.45 });
      const front = std({ map: T.trainFront(c), metalness: 0.35, roughness: 0.45 });
      return [side, side, gray, dark, front, front];
    });

    const coinFace = T.coinFace();
    const coinEdge = std({ color: 0xe0a21a, metalness: 1, roughness: 0.3 });
    const coinFaceMat = std({
      map: coinFace, metalness: 0.9, roughness: 0.25, emissive: 0xffffff, emissiveMap: coinFace, emissiveIntensity: 0.35,
    });

    // Rampa: un prisma triangular delante del vagón (sube hasta el techo)
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0), new THREE.Vector2(RAMP_LEN, 0), new THREE.Vector2(0, TRAIN_TOP),
    ]);
    const rampGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false })
      .rotateY(-Math.PI / 2)
      .translate(0.95, 0, 0);

    this.A = {
      white, redWhite, yellowBlack, gray, dark, lamp, headlight, trains,
      rampMats: [dark, yellowBlack],
      rampGeo,
      coinGeo: new THREE.CylinderGeometry(0.38, 0.38, 0.09, 24).rotateX(Math.PI / 2),
      coinMats: [coinEdge, coinFaceMat, coinFaceMat],
      board: box(1.9, 0.42, 0.1),
      leg: box(0.07, 1.0, 0.07),
      foot: box(0.1, 0.05, 0.7),
      lampGeo: new THREE.SphereGeometry(0.08, 10, 6),
      post: box(0.14, 2.5, 0.14),
      highBoard: box(2.04, 0.7, 0.1),
      trainBody: box(2.1, 2.6, 10),
      roof: new THREE.CylinderGeometry(1.05, 1.05, 10, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.22, 1),
      bogie: box(1.8, 0.5, 8.6),
      light: new THREE.SphereGeometry(0.11, 10, 6),
      halo: new THREE.TorusGeometry(0.75, 0.06, 8, 32),
      haloMat: new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.8 }),
    };
  }

  // Muñeco articulado (lo usan el corredor y el guardia)
  buildRunner(M, { wide = 1, hat }) {
    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const pivot = (parent, x, y, z) => {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      parent.add(p);
      return p;
    };
    const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);

    const root = new THREE.Group();    // posición en el mundo
    const ball = pivot(root, 0, 0, 0); // para la voltereta al agacharse
    const body = pivot(ball, 0, 0, 0);

    add(body, capsule(0.15, 0.2).rotateZ(Math.PI / 2), M.pants, 0, 1.0, 0).scale.x = wide;
    const torso = pivot(body, 0, 1.0, 0);
    add(torso, capsule(0.25, 0.3), M.top, 0, 0.38, 0).scale.set(1.15 * wide, 1, 0.8 * wide);
    const head = pivot(torso, 0, 0.86, 0);
    add(head, new THREE.SphereGeometry(0.19, 16, 12), M.skin, 0, 0.1, 0);
    add(head, new THREE.SphereGeometry(0.195, 16, 12), M.hair, 0, 0.12, 0.03).scale.set(1, 0.92, 1);
    hat(head, add, torso);

    const arm = (x) => {
      const shoulder = pivot(torso, x * wide, 0.62, 0);
      add(shoulder, capsule(0.085, 0.24), M.top, 0, -0.17, 0);
      const elbow = pivot(shoulder, 0, -0.36, 0);
      add(elbow, capsule(0.078, 0.2), M.top, 0, -0.14, 0);
      add(elbow, new THREE.SphereGeometry(0.075, 8, 6), M.skin, 0, -0.33, 0);
      return [shoulder, elbow];
    };
    const leg = (x) => {
      const hip = pivot(body, x * wide, 0.96, 0);
      add(hip, capsule(0.11, 0.28), M.pants, 0, -0.22, 0);
      const knee = pivot(hip, 0, -0.46, 0);
      add(knee, capsule(0.095, 0.28), M.pants, 0, -0.2, 0);
      add(knee, box(0.17, 0.13, 0.32), M.shoe, 0, -0.44, -0.06);
      return [hip, knee];
    };
    const [armL, elbowL] = arm(-0.36);
    const [armR, elbowR] = arm(0.36);
    const [legL, kneeL] = leg(-0.14);
    const [legR, kneeR] = leg(0.14);
    this.scene.add(root);
    return { root, ball, body, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
  }

  makeJetpack() {
    const g = new THREE.Group();
    const tank = new THREE.CylinderGeometry(0.11, 0.11, 0.55, 12);
    const tankMat = std({ color: 0xd8262c, metalness: 0.6, roughness: 0.35 });
    const flames = [];
    for (const x of [-0.13, 0.13]) {
      const t = new THREE.Mesh(tank, tankMat);
      t.position.set(x, 0, 0);
      g.add(t);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), this.A.gray);
      cap.position.set(x, 0.28, 0);
      g.add(cap);
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 10), this.A.dark);
      nozzle.position.set(x, -0.33, 0);
      g.add(nozzle);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.7, 10).rotateX(Math.PI).translate(0, -0.35, 0),
        new THREE.MeshBasicMaterial({ color: 0xffa21f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.position.set(x, -0.4, 0);
      g.add(flame);
      flames.push(flame);
    }
    const strap = new THREE.Mesh(box(0.42, 0.1, 0.06), this.A.dark);
    strap.position.y = 0.05;
    g.add(strap);
    g.userData.flames = flames;
    return g;
  }

  buildCharacters() {
    const P = {
      skin: std({ color: 0xd9a27c }),
      top: std({ color: 0xf07a1e, roughness: 0.95 }),
      pants: std({ color: 0x35598f, roughness: 0.9 }),
      shoe: std({ color: 0xf4f4f4 }),
      hair: std({ color: 0x3e2717 }),
    };
    const cap = std({ color: 0xc8202a, roughness: 0.7 });
    this.rig = this.buildRunner(P, {
      hat: (head, add, torso) => {
        add(torso, new THREE.SphereGeometry(0.2, 12, 8), P.top, 0, 0.7, 0.14).scale.set(1.25, 0.75, 0.8); // capucha
        add(head, new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.15, 0);
        add(head, box(0.3, 0.03, 0.2), cap, 0, 0.16, -0.22);
      },
    });
    this.jetpack = this.makeJetpack();
    this.jetpack.position.set(0, 0.42, 0.3);
    this.jetpack.visible = false;
    this.rig.torso.add(this.jetpack);

    // Guardia del metro: uniforme azul marino, gorra de plato y barriga
    const G = {
      skin: std({ color: 0xc98d6a }),
      top: std({ color: 0x24355a, roughness: 0.9 }),
      pants: std({ color: 0x1b2640, roughness: 0.9 }),
      shoe: std({ color: 0x151515 }),
      hair: std({ color: 0x8a8a8a }),
    };
    const badge = std({ color: 0xffd23a, metalness: 0.8, roughness: 0.3 });
    this.guard = this.buildRunner(G, {
      wide: 1.25,
      hat: (head, add, torso) => {
        add(head, new THREE.CylinderGeometry(0.24, 0.2, 0.12, 16), G.top, 0, 0.3, 0);
        add(head, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), G.shoe, 0, 0.23, -0.1).scale.z = 0.7;
        add(head, box(0.08, 0.06, 0.02), badge, 0, 0.3, -0.24);
        add(torso, new THREE.SphereGeometry(0.3, 14, 10), G.top, 0, 0.2, -0.12).scale.set(1.1, 1, 0.9); // barriga
        add(head, box(0.18, 0.04, 0.04), G.hair, 0, 0.02, -0.19); // bigote
      },
    });

    // Perro del guardia
    const fur = std({ color: 0x8b5a2b });
    const dog = new THREE.Group();
    const dogBody = new THREE.Mesh(box(0.32, 0.32, 0.75), fur);
    dogBody.position.y = 0.55;
    const dogHead = new THREE.Mesh(box(0.28, 0.28, 0.32), fur);
    dogHead.position.set(0, 0.8, -0.45);
    const snout = new THREE.Mesh(box(0.16, 0.12, 0.16), std({ color: 0x3a2412 }));
    snout.position.set(0, 0.74, -0.66);
    dog.add(dogBody, dogHead, snout);
    const dogLegs = [];
    for (const [x, z] of [[-0.11, -0.28], [0.11, -0.28], [-0.11, 0.28], [0.11, 0.28]]) {
      const p = new THREE.Group();
      p.position.set(x, 0.42, z);
      const l = new THREE.Mesh(box(0.08, 0.42, 0.08), fur);
      l.position.y = -0.21;
      p.add(l);
      dog.add(p);
      dogLegs.push(p);
    }
    dog.traverse((m) => (m.castShadow = true));
    this.dog = { root: dog, legs: dogLegs };
    this.scene.add(dog);
  }

  reset() {
    for (const list of [this.obstacles, this.coins, this.pickups]) {
      for (const o of list) this.scene.remove(o.mesh);
      list.length = 0;
    }
    this.state = 'ready';
    this.speed = START_SPEED;
    this.distance = 0;
    this.nextSpawn = 40;
    this.nextJetpack = 350;
    this.coinCount = 0;
    this.lane = 1;
    this.prevLane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.rollTimer = 0;
    this.flyTimer = 0;
    this.invuln = 0;
    this.chase = 3;          // al empezar el guardia sale corriendo detrás
    this.danger = false;     // tropezar con el guardia cerca = te atrapa
    this.caughtReason = null;
    this.time = 0;
    this.shake = 0;
    this.camY = 2.9;
    this.guardZ = 2.6;
    this.guardX = 0;
    this.rig.root.rotation.set(0, 0, 0);
    this.rig.root.visible = true;
    this.jetpack.visible = false;
    this.emitScore();
    this.cb.onPower?.(0);
  }

  start() {
    if (this.state === 'playing' || this.state === 'paused') return;
    if (this.state === 'over') this.reset();
    this.state = 'playing';
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  get score() {
    return Math.floor(this.distance) + this.coinCount * 10;
  }

  emitScore() {
    this.cb.onScore?.(this.score, this.coinCount);
  }

  // --- Controles ---
  setLane(lane) {
    if (this.state !== 'playing') return;
    lane = Math.max(0, Math.min(2, lane));
    if (lane === this.lane) return;
    this.prevLane = this.lane;
    this.lane = lane;
  }
  left() { this.setLane(this.lane - 1); }
  right() { this.setLane(this.lane + 1); }
  jump() {
    if (this.state !== 'playing' || this.flyTimer > 0) return;
    // Si aún estamos en el aire, el salto se guarda un momento y sale al aterrizar
    if (!this.grounded) {
      this.jumpBuffer = 0.2;
      return;
    }
    this.jumpBuffer = 0;
    this.vy = JUMP_SPEED;
    this.grounded = false;
    this.rollTimer = 0;
  }
  roll() {
    if (this.state !== 'playing' || this.flyTimer > 0) return;
    this.jumpBuffer = 0;
    this.rollTimer = ROLL_TIME;
    if (!this.grounded && this.vy > -25) this.vy = -25; // en el aire: bajar de golpe
  }
  // Mientras sigas agachado delante de la cámara, el corredor sigue rodando
  holdRoll() {
    if (this.state !== 'playing' || this.flyTimer > 0) return;
    this.rollTimer = Math.max(this.rollTimer, 0.25);
  }

  // --- Generación de obstáculos ---
  spawnRow(z) {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const difficulty = (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const count = Math.random() < 0.3 + difficulty * 0.4 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const type = r < 0.3 ? 'low' : r < 0.55 ? 'high' : 'train';
      this.addObstacle(type, lanes[i], z);
    }
    const free = lanes[count];
    if (this.distance - z > this.nextJetpack && this.flyTimer <= 0) {
      this.nextJetpack += 700 + Math.random() * 500;
      this.addJetpackPickup(free, z);
    } else if (Math.random() < 0.7) {
      for (let i = 0; i < 6; i++) this.addCoin(free, z + 4 - i * 2.2);
    }
  }

  addObstacle(type, lane, z) {
    const A = this.A;
    const g = new THREE.Group();
    const add = (geo, mat, x, y, oz = 0, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, oz);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    let yMin = 0, yMax, depth, ramp = 0;
    if (type === 'low') {
      // Valla baja a rayas rojas y blancas: hay que saltar
      add(A.board, [A.white, A.white, A.white, A.white, A.redWhite, A.redWhite], 0, 0.8);
      for (const x of [-0.8, 0.8]) {
        add(A.leg, A.gray, x, 0.5, 0.18).rotation.x = 0.35;
        add(A.leg, A.gray, x, 0.5, -0.18).rotation.x = -0.35;
        add(A.foot, A.gray, x, 0.03, 0, false);
        add(A.lampGeo, A.lamp, x * 0.95, 1.1, 0, false);
      }
      yMax = 1.0;
      depth = 0.4;
    } else if (type === 'high') {
      // Barra alta amarilla y negra: hay que agacharse
      for (const x of [-0.95, 0.95]) add(A.post, A.yellowBlack, x, 1.25);
      add(A.highBoard, [A.dark, A.dark, A.dark, A.dark, A.yellowBlack, A.yellowBlack], 0, 1.85);
      yMin = 1.5;
      yMax = 2.3;
      depth = 0.3;
    } else {
      // Vagón de metro: cambiar de carril... o subirse por la rampa y correr por encima
      const mats = A.trains[Math.floor(Math.random() * A.trains.length)];
      add(A.trainBody, mats, 0, 1.85);
      add(A.roof, A.gray, 0, 3.15, 0, false);
      add(A.bogie, A.dark, 0, 0.32, 0, false);
      for (const x of [-0.7, 0.7]) add(A.light, A.headlight, x, 1.0, 5.02, false);
      yMax = TRAIN_TOP;
      depth = 10;
      z -= 4;
      if (Math.random() < 0.5) {
        ramp = RAMP_LEN;
        add(A.rampGeo, A.rampMats, 0, 0, depth / 2);
        // Monedas subiendo por la rampa y sobre el techo
        for (let i = 0; i < 8; i++) {
          const local = depth / 2 + RAMP_LEN - 1 - i * 2;
          const h = local > depth / 2 ? (TRAIN_TOP * (depth / 2 + RAMP_LEN - local)) / RAMP_LEN : TRAIN_TOP;
          this.addCoin(lane, z + local, h + 0.95);
        }
      }
    }
    g.position.set(LANE_X[lane], 0, z);
    this.scene.add(g);
    this.obstacles.push({ type, mesh: g, yMin, yMax, depth, ramp });
  }

  addCoin(lane, z, y = 0.95) {
    const mesh = new THREE.Mesh(this.A.coinGeo, this.A.coinMats);
    mesh.position.set(LANE_X[lane], y, z);
    this.scene.add(mesh);
    this.coins.push({ mesh });
  }

  addJetpackPickup(lane, z) {
    const mesh = new THREE.Group();
    const pack = this.makeJetpack();
    pack.scale.setScalar(1.6);
    for (const f of pack.userData.flames) f.visible = false;
    const halo = new THREE.Mesh(this.A.halo, this.A.haloMat);
    mesh.add(pack, halo);
    mesh.position.set(LANE_X[lane], 1.3, z);
    this.scene.add(mesh);
    this.pickups.push({ type: 'jetpack', mesh, pack });
  }

  startJetpack() {
    this.flyTimer = FLY_TIME;
    this.rollTimer = 0;
    this.vy = 0;
    this.jetpack.visible = true;
    this.cb.onJetpack?.();
    // Rastro de monedas en el aire durante todo el vuelo
    let lane = this.lane;
    const n = Math.floor((this.speed * FLY_TIME) / 3);
    for (let i = 0; i < n; i++) {
      if (i % 9 === 8) lane = (lane + (Math.random() < 0.5 ? 1 : 2)) % 3;
      this.addCoin(lane, -14 - i * 3, FLY_Y + 0.9);
    }
  }

  // Altura del suelo bajo el jugador: 0, el techo de un vagón o un punto de una rampa
  surfaceAt(x) {
    let h = 0, ramp = false;
    for (const o of this.obstacles) {
      if (o.type !== 'train' || Math.abs(o.mesh.position.x - x) > 1.0) continue;
      const front = o.mesh.position.z + o.depth / 2;
      const back = o.mesh.position.z - o.depth / 2;
      if (back - PLAYER_HALF_DEPTH <= 0 && 0 <= front + PLAYER_HALF_DEPTH) {
        if (TRAIN_TOP >= h) { h = TRAIN_TOP; ramp = false; }
      } else if (o.ramp && front < 0 && front + o.ramp >= 0) {
        const rh = (TRAIN_TOP * (front + o.ramp)) / o.ramp;
        if (rh > h) { h = rh; ramp = true; }
      }
    }
    return { h, ramp };
  }

  stumble() {
    if (this.danger) {
      this.gameOver('caught');
      return;
    }
    this.danger = true;
    this.chase = CHASE_TIME;
    this.invuln = 0.8;
    this.shake = 0.5;
    this.cb.onStumble?.();
  }

  // --- Bucle principal ---
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.adaptQuality(dt);
    this.time += dt;
    const playing = this.state === 'playing';
    const move = playing ? this.speed * dt : 0;

    if (playing) {
      this.speed = Math.min(MAX_SPEED, this.speed + dt * 0.35);
      this.distance += move;
      while (this.distance - SPAWN_Z > this.nextSpawn) {
        this.spawnRow(-(this.nextSpawn - this.distance));
        this.nextSpawn += 22 + Math.random() * 14 - (this.speed - START_SPEED) * 0.25;
      }
      this.invuln = Math.max(0, this.invuln - dt);
      this.chase = Math.max(0, this.chase - dt);
      if (this.chase === 0) this.danger = false;
    }

    this.world.update(move, this.distance);

    for (const o of this.obstacles) o.mesh.position.z += move;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.mesh.position.z - o.depth / 2 > NEAR_Z) {
        this.scene.remove(o.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    if (playing) this.updatePhysics(dt, move);
    const rolling = this.rollTimer > 0;
    const height = rolling ? ROLL_HEIGHT : STAND_HEIGHT;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.mesh.position.z += move;
      c.mesh.rotation.y += dt * 4;
      const near =
        Math.abs(c.mesh.position.z) < 0.8 &&
        Math.abs(c.mesh.position.x - this.x) < 0.9 &&
        Math.abs(c.mesh.position.y - (this.y + height / 2)) < 1.3;
      if (playing && near) {
        this.coinCount++;
        this.cb.onCoin?.();
      }
      if (near || c.mesh.position.z > NEAR_Z) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.mesh.position.z += move;
      p.mesh.position.y = 1.3 + Math.sin(this.time * 3) * 0.15;
      p.pack.rotation.y += dt * 2.5;
      const near =
        Math.abs(p.mesh.position.z) < 1 &&
        Math.abs(p.mesh.position.x - this.x) < 1 &&
        Math.abs(p.mesh.position.y - (this.y + height / 2)) < 1.6;
      if (playing && near) this.startJetpack();
      if (near || p.mesh.position.z > NEAR_Z) {
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }

    if (playing) this.emitScore();

    this.updatePlayerMesh(dt, rolling);
    this.updateGuard(dt);

    // Cámara detrás y por encima del corredor (sube con él al volar o ir por los techos)
    this.shake = Math.max(0, this.shake - dt * 2);
    const s = this.shake;
    const targetY = 2.9 + this.y * (this.flyTimer > 0 ? 0.85 : 0.35);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 5);
    this.camera.position.set(this.x * 0.65 + (Math.random() - 0.5) * s, this.camY + (Math.random() - 0.5) * s, 5.3);
    this.camera.lookAt(this.x * 0.65, this.camY - 1.4, -12);

    this.renderer.render(this.scene, this.camera);
  }

  updatePhysics(dt, move) {
    this.x += (LANE_X[this.lane] - this.x) * Math.min(1, dt * 18);

    if (this.flyTimer > 0) {
      this.flyTimer = Math.max(0, this.flyTimer - dt);
      this.y += (FLY_Y - this.y) * Math.min(1, dt * 3);
      this.vy = 0;
      this.grounded = false;
      this.cb.onPower?.(this.flyTimer / FLY_TIME);
      if (this.flyTimer === 0) {
        this.jetpack.visible = false;
        this.invuln = 1.5; // margen para aterrizar tranquilo
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      const g = this.surfaceAt(this.x);
      // Se puede "pisar" una superficie si estamos justo encima o un poco por debajo
      const reach = g.ramp ? 2.5 : Math.max(0.7, -this.vy * dt + 0.15);
      this.grounded = false;
      if (this.vy <= 0 && this.y <= g.h && this.y >= g.h - reach) {
        this.y = g.h;
        this.vy = 0;
        this.grounded = true;
      }
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.rollTimer = Math.max(0, this.rollTimer - dt);
    this.jumpBuffer = Math.max(0, (this.jumpBuffer || 0) - dt);
    if (this.jumpBuffer > 0 && this.grounded) this.jump();

    if (this.invuln > 0 || this.flyTimer > 0) return;
    const height = this.rollTimer > 0 ? ROLL_HEIGHT : STAND_HEIGHT;
    for (const o of this.obstacles) {
      const oz = o.mesh.position.z;
      const front = oz + o.depth / 2;
      const hitX = Math.abs(o.mesh.position.x - this.x) < 1.1;
      const hitZ = Math.abs(oz) < o.depth / 2 + PLAYER_HALF_DEPTH;
      if (!hitX || !hitZ) continue;

      if (o.type === 'train') {
        if (this.y >= TRAIN_TOP - 0.7) continue; // vamos por encima
        // Si el frente del vagón acaba de llegar es un choque de frente;
        // si no, nos hemos metido de lado al cambiar de carril
        const headOn = front + PLAYER_HALF_DEPTH < move + 0.6;
        if (!headOn && this.prevLane !== this.lane) {
          this.lane = this.prevLane;
          this.stumble();
        } else {
          this.gameOver('crash');
        }
        return;
      }
      if (this.y < o.yMax && this.y + height > o.yMin) {
        if (o.type === 'low') this.stumble(); // tropiezas con la valla baja
        else this.gameOver('crash');
        return;
      }
    }
  }

  // Postura de un muñeco según lo que esté haciendo
  pose(r, t, mode) {
    let legL, legR, kneeL, kneeR, armL, armR, elbow, lean;
    if (mode === 'roll') {
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [1.7, 1.7, -2.3, -2.3, 1.2, 1.2, 1.8, -0.6];
    } else if (mode === 'air') {
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [1.0, 0.2, -1.5, -0.6, 2.6, -0.6, 0.6, -0.1];
    } else if (mode === 'fly') {
      const b = Math.sin(t * 0.5) * 0.15;
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [0.2 + b, -0.1 - b, -0.5, -0.3, 0.3, 0.3, 1.2, -0.35];
    } else if (mode === 'grab') {
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [0.3, -0.2, -0.3, -0.2, 1.5, 1.5, 0.2, -0.2];
    } else if (mode === 'run') {
      const s = Math.sin(t);
      legL = s * 0.85;
      legR = -s * 0.85;
      kneeL = -0.2 - 1.2 * Math.max(0, -Math.cos(t));
      kneeR = -0.2 - 1.2 * Math.max(0, Math.cos(t));
      armL = -s * 0.8;
      armR = s * 0.8;
      elbow = 1.4;
      lean = -0.2;
    } else {
      // Quieto, respirando
      const b = Math.sin(t) * 0.03;
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [0, 0, 0, 0, 0.1 + b, 0.1 - b, 0.2, b];
    }
    r.legL.rotation.x = legL;
    r.legR.rotation.x = legR;
    r.kneeL.rotation.x = kneeL;
    r.kneeR.rotation.x = kneeR;
    r.armL.rotation.x = armL;
    r.armR.rotation.x = armR;
    r.elbowL.rotation.x = elbow;
    r.elbowR.rotation.x = elbow;
    r.torso.rotation.x = lean;
    r.body.position.y = mode === 'run' ? Math.abs(Math.cos(t)) * 0.07 : 0;
  }

  updatePlayerMesh(dt, rolling) {
    const r = this.rig;
    r.root.position.set(this.x, this.y, 0);
    r.root.rotation.z = (LANE_X[this.lane] - this.x) * -0.1;
    // Parpadeo mientras eres invulnerable
    r.root.visible = !(this.invuln > 0 && this.flyTimer === 0 && Math.floor(this.time * 12) % 2);
    for (const f of this.jetpack.userData.flames) f.scale.y = 0.8 + Math.random() * 0.5;
    if (this.state === 'over') return;

    const t = this.time * (this.state === 'playing' ? this.speed / 1.5 : 3);
    let mode = 'idle';
    if (this.state === 'playing') {
      mode = this.flyTimer > 0 ? 'fly' : rolling ? 'roll' : !this.grounded ? 'air' : 'run';
    }

    if (rolling) {
      r.ball.position.y = 0.55;
      r.ball.scale.setScalar(0.7);
      r.ball.rotation.x -= dt * 13;
    } else {
      r.ball.position.y = 0;
      r.ball.rotation.x = 0;
      r.ball.scale.setScalar(1);
    }
    this.pose(r, t, mode);
    if (rolling) r.body.position.y = -0.85;
  }

  // El guardia y su perro: se acercan cuando tropiezas y te atrapan si caes
  updateGuard(dt) {
    const over = this.state === 'over';
    const close = over || this.chase > 0;
    const targetZ = over ? 1.3 : close ? 2.6 : 16;
    this.guardZ += (targetZ - this.guardZ) * Math.min(1, dt * (close ? 3 : 0.8));
    this.guardX += (this.x - 0.6 - this.guardX) * Math.min(1, dt * 4);
    const g = this.guard;
    g.root.position.set(this.guardX, 0, this.guardZ);
    g.root.visible = this.guardZ < 12;
    const reached = over && this.guardZ < 1.6;
    const t = this.time * 11;
    const still = this.state === 'ready' || this.state === 'paused';
    this.pose(g, t, reached ? 'grab' : still ? 'idle' : 'run');

    const d = this.dog;
    d.root.position.set(this.guardX + 1.2, 0, this.guardZ - 0.4);
    d.root.visible = g.root.visible;
    d.legs.forEach((l, i) => (l.rotation.x = reached || still ? 0 : Math.sin(t * 1.3 + (i % 2) * Math.PI) * 0.7));
  }

  gameOver(reason) {
    this.state = 'over';
    this.caughtReason = reason;
    this.shake = 1;
    this.flyTimer = 0;
    this.jetpack.visible = false;
    this.rig.root.visible = true;
    this.rig.root.rotation.x = 0.35;
    this.cb.onPower?.(0);
    this.cb.onGameOver?.(this.score, this.coinCount, reason);
  }
}
