// Juego: corredor, obstáculos, monedas, colisiones y cámara.
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

const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Game {
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = T.sky();
    this.scene.fog = new THREE.Fog(0xc9d8e6, 70, 430);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);

    // Luz de tarde: sol cálido y bajo + cielo azulado
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x6a5848, 1.3));
    const sun = new THREE.DirectionalLight(0xffdcb0, 3.0);
    sun.position.set(10, 24, 12);
    sun.target.position.set(0, 0, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
    this.scene.add(sun, sun.target);

    this.world = new World(this.scene);
    this.buildAssets();
    this.buildPlayer();

    // Reflejos (mapa de entorno) solo en los metales: en todo lo demás borraría las sombras
    const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    const shine = (m) => {
      if (m?.isMaterial && m.metalness >= 0.5) m.envMap = env;
    };
    this.scene.traverse((o) => [o.material].flat().forEach(shine));
    Object.values(this.A).flat(2).forEach(shine);

    this.obstacles = [];
    this.coins = [];
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

  // Geometrías y materiales compartidos por todos los obstáculos y monedas
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

    this.A = {
      white, redWhite, yellowBlack, gray, dark, lamp, headlight, trains,
      coinGeo: new THREE.CylinderGeometry(0.38, 0.38, 0.09, 32).rotateX(Math.PI / 2),
      coinMats: [coinEdge, coinFaceMat, coinFaceMat],
      board: box(1.9, 0.42, 0.1),
      leg: box(0.07, 1.0, 0.07),
      foot: box(0.1, 0.05, 0.7),
      lampGeo: new THREE.SphereGeometry(0.08, 12, 8),
      post: box(0.14, 2.5, 0.14),
      highBoard: box(2.04, 0.7, 0.1),
      trainBody: box(2.1, 2.6, 10),
      roof: new THREE.CylinderGeometry(1.05, 1.05, 10, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.22, 1),
      bogie: box(1.8, 0.5, 8.6),
      light: new THREE.SphereGeometry(0.11, 12, 8),
    };
  }

  buildPlayer() {
    const M = {
      skin: std({ color: 0xd9a27c }),
      hoodie: std({ color: 0xf07a1e, roughness: 0.95 }),
      jeans: std({ color: 0x35598f, roughness: 0.9 }),
      shoe: std({ color: 0xf4f4f4 }),
      cap: std({ color: 0xc8202a, roughness: 0.7 }),
      hair: std({ color: 0x3e2717 }),
    };
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
    const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);

    const root = new THREE.Group();   // posición en el mundo
    const ball = pivot(root, 0, 0, 0); // para la voltereta al agacharse
    const body = pivot(ball, 0, 0, 0);

    add(body, capsule(0.15, 0.2).rotateZ(Math.PI / 2), M.jeans, 0, 1.0, 0);
    const torso = pivot(body, 0, 1.0, 0);
    add(torso, capsule(0.25, 0.3), M.hoodie, 0, 0.38, 0).scale.set(1.15, 1, 0.8);
    add(torso, new THREE.SphereGeometry(0.2, 14, 10), M.hoodie, 0, 0.7, 0.14).scale.set(1.25, 0.75, 0.8); // capucha
    const head = pivot(torso, 0, 0.86, 0);
    add(head, new THREE.SphereGeometry(0.19, 18, 14), M.skin, 0, 0.1, 0);
    add(head, new THREE.SphereGeometry(0.195, 18, 14), M.hair, 0, 0.12, 0.03).scale.set(1, 0.92, 1);
    add(head, new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.cap, 0, 0.15, 0);
    add(head, box(0.3, 0.03, 0.2), M.cap, 0, 0.16, -0.22);

    const arm = (x) => {
      const shoulder = pivot(torso, x, 0.62, 0);
      add(shoulder, capsule(0.085, 0.24), M.hoodie, 0, -0.17, 0);
      const elbow = pivot(shoulder, 0, -0.36, 0);
      add(elbow, capsule(0.078, 0.2), M.hoodie, 0, -0.14, 0);
      add(elbow, new THREE.SphereGeometry(0.075, 10, 8), M.skin, 0, -0.33, 0);
      return [shoulder, elbow];
    };
    const leg = (x) => {
      const hip = pivot(body, x, 0.96, 0);
      add(hip, capsule(0.11, 0.28), M.jeans, 0, -0.22, 0);
      const knee = pivot(hip, 0, -0.46, 0);
      add(knee, capsule(0.095, 0.28), M.jeans, 0, -0.2, 0);
      add(knee, box(0.17, 0.13, 0.32), M.shoe, 0, -0.44, -0.06);
      return [hip, knee];
    };
    const [armL, elbowL] = arm(-0.36);
    const [armR, elbowR] = arm(0.36);
    const [legL, kneeL] = leg(-0.14);
    const [legR, kneeR] = leg(0.14);

    this.rig = { root, ball, body, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
    this.player = root;
    this.scene.add(root);
  }

  reset() {
    for (const o of this.obstacles) this.scene.remove(o.mesh);
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.obstacles = [];
    this.coins = [];
    this.state = 'ready';
    this.speed = START_SPEED;
    this.distance = 0;
    this.nextSpawn = 40;
    this.coinCount = 0;
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.rollTimer = 0;
    this.time = 0;
    this.shake = 0;
    this.rig.root.rotation.set(0, 0, 0);
    this.emitScore();
  }

  start() {
    if (this.state === 'over') this.reset();
    this.state = 'playing';
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
    this.lane = Math.max(0, Math.min(2, lane));
  }
  left() { this.setLane(this.lane - 1); }
  right() { this.setLane(this.lane + 1); }
  jump() {
    if (this.state !== 'playing' || this.y > 0.01) return;
    this.vy = JUMP_SPEED;
    this.rollTimer = 0;
  }
  roll() {
    if (this.state !== 'playing') return;
    this.rollTimer = ROLL_TIME;
    if (this.y > 0.01) this.vy = -25; // en el aire: bajar de golpe
  }

  // --- Generación de obstáculos ---
  spawnRow(z) {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const difficulty = (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const count = Math.random() < 0.3 + difficulty * 0.4 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const type = r < 0.35 ? 'low' : r < 0.65 ? 'high' : 'train';
      this.addObstacle(type, lanes[i], z);
    }
    // Monedas en un carril libre
    if (Math.random() < 0.7) {
      const lane = lanes[count];
      for (let i = 0; i < 6; i++) this.addCoin(lane, z + 4 - i * 2.2);
    }
  }

  addObstacle(type, lane, z) {
    const A = this.A;
    const g = new THREE.Group();
    const add = (geo, mat, x, y, oz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, oz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    let yMin = 0, yMax, depth;
    if (type === 'low') {
      // Valla baja a rayas rojas y blancas: hay que saltar
      add(A.board, [A.white, A.white, A.white, A.white, A.redWhite, A.redWhite], 0, 0.8);
      for (const x of [-0.8, 0.8]) {
        add(A.leg, A.gray, x, 0.5, 0.18).rotation.x = 0.35;
        add(A.leg, A.gray, x, 0.5, -0.18).rotation.x = -0.35;
        add(A.foot, A.gray, x, 0.03);
        add(A.lampGeo, A.lamp, x * 0.95, 1.1);
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
      // Vagón de metro: hay que cambiar de carril
      const mats = A.trains[Math.floor(Math.random() * A.trains.length)];
      add(A.trainBody, mats, 0, 1.85);
      add(A.roof, A.gray, 0, 3.15);
      add(A.bogie, A.dark, 0, 0.32);
      for (const x of [-0.7, 0.7]) add(A.light, A.headlight, x, 1.0, 5.02);
      yMax = 3.3;
      depth = 10;
      z -= 4;
    }
    g.position.set(LANE_X[lane], 0, z);
    this.scene.add(g);
    this.obstacles.push({ type, mesh: g, yMin, yMax, depth });
  }

  addCoin(lane, z) {
    const mesh = new THREE.Mesh(this.A.coinGeo, this.A.coinMats);
    mesh.position.set(LANE_X[lane], 0.95, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.coins.push({ mesh });
  }

  // --- Bucle principal ---
  update(dt) {
    dt = Math.min(dt, 0.05);
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
    }

    this.world.update(move, this.distance);

    // Física del jugador
    this.x += (LANE_X[this.lane] - this.x) * Math.min(1, dt * 14);
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }
    this.rollTimer = Math.max(0, this.rollTimer - dt);
    const rolling = this.rollTimer > 0;
    this.updatePlayerMesh(dt, rolling);

    // Obstáculos y colisiones
    const height = rolling ? ROLL_HEIGHT : STAND_HEIGHT;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.mesh.position.z += move;
      if (o.mesh.position.z - o.depth / 2 > NEAR_Z) {
        this.scene.remove(o.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }
      if (!playing) continue;
      const hitX = Math.abs(o.mesh.position.x - this.x) < 1.1;
      const hitZ = Math.abs(o.mesh.position.z) < o.depth / 2 + PLAYER_HALF_DEPTH;
      const hitY = this.y < o.yMax && this.y + height > o.yMin;
      if (hitX && hitZ && hitY) this.gameOver();
    }

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

    if (playing) this.emitScore();

    // Cámara detrás y por encima del corredor
    this.shake = Math.max(0, this.shake - dt * 2);
    const s = this.shake;
    this.camera.position.set(
      this.x * 0.65 + (Math.random() - 0.5) * s,
      2.9 + this.y * 0.3 + (Math.random() - 0.5) * s,
      5.3,
    );
    this.camera.lookAt(this.x * 0.65, 1.5 + this.y * 0.25, -12);

    this.renderer.render(this.scene, this.camera);
  }

  updatePlayerMesh(dt, rolling) {
    const r = this.rig;
    r.root.position.set(this.x, this.y, 0);
    r.root.rotation.z = (LANE_X[this.lane] - this.x) * -0.1;
    if (this.state === 'over') return;

    const airborne = this.y > 0;
    const running = this.state === 'playing';
    const t = this.time * (running ? this.speed / 1.5 : 3);

    // Voltereta al agacharse
    if (rolling) {
      r.ball.position.y = 0.55;
      r.body.position.y = -0.85;
      r.ball.scale.setScalar(0.7);
      r.ball.rotation.x -= dt * 13;
    } else {
      r.ball.position.y = 0;
      r.ball.rotation.x = 0;
      r.ball.scale.setScalar(1);
      r.body.position.y = running && !airborne ? Math.abs(Math.cos(t)) * 0.07 : 0;
    }

    let legL, legR, kneeL, kneeR, armL, armR, elbow, lean;
    if (rolling) {
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [1.7, 1.7, -2.3, -2.3, 1.2, 1.2, 1.8, -0.6];
    } else if (airborne) {
      [legL, legR, kneeL, kneeR, armL, armR, elbow, lean] = [1.0, 0.2, -1.5, -0.6, 2.6, -0.6, 0.6, -0.1];
    } else if (running) {
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
  }

  gameOver() {
    this.state = 'over';
    this.shake = 1;
    this.rig.root.rotation.x = 0.35;
    this.cb.onGameOver?.(this.score, this.coinCount);
  }
}
