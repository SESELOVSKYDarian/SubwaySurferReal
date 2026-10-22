// Mundo 3D del juego: vías, corredor, obstáculos y monedas.
import * as THREE from 'three';

const LANE_X = [-2.2, 0, 2.2];
const SPAWN_Z = -150;
const DESPAWN_Z = 15;
const GRAVITY = 38;
const JUMP_SPEED = 13;
const ROLL_TIME = 0.8;
const START_SPEED = 14;
const MAX_SPEED = 34;
const PLAYER_HALF_DEPTH = 0.3;
const STAND_HEIGHT = 2.1;
const ROLL_HEIGHT = 0.9;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

// Geometrías y materiales compartidos
const GEO = {
  barrier: box(1.9, 0.25, 0.25),
  post: box(0.15, 1, 0.15),
  train: box(1.9, 2.8, 10),
  window: box(1.95, 0.6, 8.6),
  coin: new THREE.CylinderGeometry(0.35, 0.35, 0.08, 20).rotateX(Math.PI / 2),
};
const MAT = {
  red: mat(0xe8443a),
  white: mat(0xf4f4f4),
  yellow: mat(0xffc93c),
  post: mat(0x555555),
  windows: mat(0x1d2a3a, { roughness: 0.2 }),
  trains: [mat(0x2f7de1), mat(0x29a35a), mat(0xd9722b), mat(0x8e44ad)],
  coin: mat(0xffd84a, { emissive: 0x7a5a00, metalness: 0.6, roughness: 0.3 }),
};

export class Game {
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd0ff);
    this.scene.fog = new THREE.Fog(0x8fd0ff, 45, 150);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    this.scene.add(sun);

    this.buildWorld();
    this.buildPlayer();

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

  buildWorld() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 400), mat(0x6b6157));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -120;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Raíles (estáticos: al ser uniformes no hace falta moverlos)
    const railMat = mat(0xb9c2cc, { metalness: 0.8, roughness: 0.3 });
    for (const x of LANE_X) {
      for (const side of [-0.6, 0.6]) {
        const rail = new THREE.Mesh(box(0.1, 0.12, 400), railMat);
        rail.position.set(x + side, 0.12, -120);
        this.scene.add(rail);
      }
    }

    // Traviesas: un grupo que se desplaza y se "teletransporta" cada SLEEPER_GAP
    this.sleeperGap = 2.5;
    this.sleepers = new THREE.Group();
    const sleeperGeo = box(1.7, 0.1, 0.35);
    const sleeperMat = mat(0x4a3526);
    for (let z = DESPAWN_Z; z > SPAWN_Z; z -= this.sleeperGap) {
      for (const x of LANE_X) {
        const s = new THREE.Mesh(sleeperGeo, sleeperMat);
        s.position.set(x, 0.05, z);
        s.receiveShadow = true;
        this.sleepers.add(s);
      }
    }
    this.scene.add(this.sleepers);

    // Edificios a los lados, se reciclan al pasar la cámara
    this.buildings = [];
    this.buildingSpan = 0;
    const colors = [0xd9a066, 0xc96f53, 0x8aa3b5, 0xe0d5c1, 0x9c7fb0, 0x7fb08a];
    for (const side of [-1, 1]) {
      for (let z = DESPAWN_Z; z > SPAWN_Z - 20; z -= 14) {
        const b = new THREE.Mesh(box(8, 1, 12), mat(colors[0]));
        b.userData.colors = colors;
        b.position.set(side * 10, 0, z);
        this.randomizeBuilding(b);
        b.castShadow = true;
        this.scene.add(b);
        this.buildings.push(b);
      }
    }
    this.buildingSpan = (this.buildings.length / 2) * 14;
  }

  randomizeBuilding(b) {
    const h = 6 + Math.random() * 18;
    b.scale.y = h;
    b.position.y = h / 2;
    const c = b.userData.colors;
    b.material.color.setHex(c[Math.floor(Math.random() * c.length)]);
  }

  buildPlayer() {
    const p = new THREE.Group();
    const skin = mat(0xf1c27d), shirt = mat(0xff6b2d), pants = mat(0x2d4b8f), cap = mat(0xe8443a);
    const part = (geo, m, x, y, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      p.add(mesh);
      return mesh;
    };
    // Las piernas y brazos cuelgan de un pivote para poder animarlos
    const limb = (geo, m, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = -geo.parameters.height / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      p.add(pivot);
      return pivot;
    };
    part(box(0.8, 0.85, 0.45), shirt, 0, 1.25);
    part(new THREE.SphereGeometry(0.3, 16, 12), skin, 0, 1.92);
    part(box(0.62, 0.15, 0.62), cap, 0, 2.18, -0.05);
    this.legs = [limb(box(0.3, 0.8, 0.3), pants, -0.2, 0.82), limb(box(0.3, 0.8, 0.3), pants, 0.2, 0.82)];
    this.arms = [limb(box(0.22, 0.7, 0.22), shirt, -0.52, 1.6), limb(box(0.22, 0.7, 0.22), shirt, 0.52, 1.6)];
    p.rotation.y = Math.PI; // de espaldas a la cámara
    this.player = p;
    this.scene.add(p);
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
    this.player.position.set(0, 0, 0);
    this.player.rotation.set(0, Math.PI, 0);
    this.player.scale.set(1, 1, 1);
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
    const g = new THREE.Group();
    let yMin = 0, yMax, depth;
    if (type === 'low') {
      // Valla baja: hay que saltar
      for (const [y, m] of [[0.35, MAT.white], [0.7, MAT.red]]) {
        const bar = new THREE.Mesh(GEO.barrier, m);
        bar.position.y = y;
        g.add(bar);
      }
      for (const x of [-0.85, 0.85]) {
        const post = new THREE.Mesh(GEO.post, MAT.post);
        post.scale.y = 0.85;
        post.position.set(x, 0.42, 0);
        g.add(post);
      }
      yMax = 0.85;
      depth = 0.3;
    } else if (type === 'high') {
      // Barra alta: hay que agacharse
      const bar = new THREE.Mesh(GEO.barrier, MAT.yellow);
      bar.scale.y = 2.6;
      bar.position.y = 1.65;
      g.add(bar);
      for (const x of [-0.9, 0.9]) {
        const post = new THREE.Mesh(GEO.post, MAT.post);
        post.scale.y = 2;
        post.position.set(x, 1, 0);
        g.add(post);
      }
      yMin = 1.3;
      yMax = 2.0;
      depth = 0.3;
    } else {
      // Tren: hay que cambiar de carril
      const m = MAT.trains[Math.floor(Math.random() * MAT.trains.length)];
      const body = new THREE.Mesh(GEO.train, m);
      body.position.y = 1.4;
      body.castShadow = true;
      g.add(body);
      const win = new THREE.Mesh(GEO.window, MAT.windows);
      win.position.y = 1.9;
      g.add(win);
      yMax = 2.8;
      depth = 10;
      z -= 4;
    }
    g.traverse((m) => (m.castShadow = true));
    g.position.set(LANE_X[lane], 0, z);
    this.scene.add(g);
    this.obstacles.push({ type, mesh: g, yMin, yMax, depth });
  }

  addCoin(lane, z) {
    const mesh = new THREE.Mesh(GEO.coin, MAT.coin);
    mesh.position.set(LANE_X[lane], 1.0, z);
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
      while (this.distance + 150 > this.nextSpawn) {
        this.spawnRow(-(this.nextSpawn - this.distance));
        this.nextSpawn += 22 + Math.random() * 14 - (this.speed - START_SPEED) * 0.25;
      }
    }

    // Escenario en movimiento
    this.sleepers.position.z = this.distance % this.sleeperGap;
    for (const b of this.buildings) {
      b.position.z += move;
      if (b.position.z > DESPAWN_Z + 6) {
        b.position.z -= this.buildingSpan;
        this.randomizeBuilding(b);
      }
    }

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
      if (o.mesh.position.z - o.depth / 2 > DESPAWN_Z) {
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
      if (near || c.mesh.position.z > DESPAWN_Z) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    if (playing) this.emitScore();

    // Cámara que sigue al jugador
    this.shake = Math.max(0, this.shake - dt * 2);
    const s = this.shake;
    this.camera.position.set(
      this.x * 0.6 + (Math.random() - 0.5) * s,
      4.4 + this.y * 0.35 + (Math.random() - 0.5) * s,
      7.5,
    );
    this.camera.lookAt(this.x * 0.6, 1.2 + this.y * 0.3, -8);

    this.renderer.render(this.scene, this.camera);
  }

  updatePlayerMesh(dt, rolling) {
    const p = this.player;
    p.position.set(this.x, this.y, 0);
    p.scale.y += ((rolling ? 0.45 : 1) - p.scale.y) * Math.min(1, dt * 20);
    p.rotation.z = (LANE_X[this.lane] - this.x) * -0.12;

    if (this.state === 'over') return;
    const running = this.state === 'playing' && this.y === 0 && !rolling;
    const t = this.time * (this.speed / 1.6);
    const swing = running ? Math.sin(t) * 0.9 : this.y > 0 ? 0.5 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = this.y > 0 ? -0.6 : -swing;
    this.arms[0].rotation.x = -swing;
    this.arms[1].rotation.x = this.y > 0 ? -2.6 : swing;
    if (running) p.position.y = Math.abs(Math.sin(t)) * 0.12;
  }

  gameOver() {
    this.state = 'over';
    this.shake = 1;
    this.player.rotation.x = -0.5;
    this.cb.onGameOver?.(this.score, this.coinCount);
  }
}
