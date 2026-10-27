// Juego: corredor, guardia perseguidor, obstáculos, vagones con rampa, jetpack,
// monedas, colisiones y cámara.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { loadRunner, loadOfficer } from './character.js';
import { mintCoin, buildShepherd } from './props.js';
import { schoolProps } from './school-props.js';
import { updateChaseCamera, disposeBusView } from './camera-rig.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildBusAssets } from './bus.js';
import { World, LANE_X, NEAR_Z } from './world.js';
import * as T from './textures.js';
import { surface, contactShadow } from './materials.js';

const SPAWN_Z = -150;
const GRAVITY = 38;
const JUMP_SPEED = 13;
const ROLL_TIME = 0.8;
const START_SPEED = 14;
const MAX_SPEED = 34;
const PLAYER_HALF_DEPTH = 0.3;
const STAND_HEIGHT = 2.1;
const ROLL_HEIGHT = 1.2;
const TRAIN_TOP = 3.3;      // techo de los vagones: se puede correr encima
const SURFACE_EPS = 0.04; // tolerancia de contacto: 4 cm en bordes redondeados
const RAMP_LEN = 6;
const FLY_Y = 9;            // altura de vuelo con jetpack (por encima de las catenarias)
const FLY_TIME = 7;
const CHASE_TIME = 5;       // segundos que el guardia te pisa los talones tras tropezar

const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Game {
  constructor(canvas, callbacks = {}) {
    this.cb = callbacks;
    this.quality = 'auto';
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.25);
    this.frameAverage = 1 / 60;
    this.qualityElapsed = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb7b1a6);
    this.scene.fog = new THREE.Fog(0xb7b1a6, 90, 440);

    this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 700);

    // Luz de tarde: sol cálido y bajo + cielo azulado
    this.scene.add(new THREE.HemisphereLight(0xb9cce1, 0x40382f, 1.2));
    const sun = (this.sun = new THREE.DirectionalLight(0xffd5a0, 3.4));
    sun.position.set(-34, 36, 0);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -135, right: 135, top: 40, bottom: -40, near: 1, far: 110 });
    this.scene.add(sun, sun.target);

    this.world = new World(this.scene);
    this.buildAssets();
    this.buildCharacters();

    // Cielo atmosférico y reflejos coherentes con la luz exterior.
    const sky = new Sky();
    sky.scale.setScalar(600);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 5;
    uniforms.rayleigh.value = 1.5;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.sunPosition.value.copy(sun.position).normalize();
    const skyScene = new THREE.Scene();
    skyScene.add(sky);
    const pmrem = new THREE.PMREMGenerator(r);
    this.environmentTarget = pmrem.fromScene(skyScene, 0.03);
    pmrem.dispose();
    // El cielo se calcula una vez: no ejecutar la dispersión atmosférica en
    // cada píxel de cada cuadro, especialmente en equipos modestos.
    this.scene.background = this.environmentTarget.texture;
    sky.geometry.dispose();
    sky.material.dispose();
    this.scene.traverse(object => {
      for (const material of [object.material].flat()) {
        if (material?.isMeshStandardMaterial && material.metalness >= 0.5) {
          material.envMap = this.environmentTarget.texture;
          material.envMapIntensity = 0.45;
        }
      }
    });

    this.A.coinMat.envMapIntensity = 1.15;

    this.obstacles = [];
    this.coins = [];
    this.pickups = [];
    this.reset();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setQuality('auto');
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality) {
    if (!['auto', 'high', 'balanced'].includes(quality)) return;
    this.quality = quality;
    const pixelRatioLimit = quality === 'high' ? 2 : quality === 'auto' ? 1.5 : 1.25;
    this.pixelRatio = Math.min(window.devicePixelRatio, pixelRatioLimit);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.world.viewDistance = quality === 'high' ? 340 : 230;
    const shadowSize = quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize || this.sun.shadow.mapSize.y !== shadowSize) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    }
    this.sun.castShadow = true;
    const shadowCamera = this.sun.shadow.camera;
    const shadowHalfDepth = this.world.viewDistance / 2 + 30;
    shadowCamera.left = -shadowHalfDepth;
    shadowCamera.right = shadowHalfDepth;
    shadowCamera.top = 40;
    shadowCamera.bottom = -40;
    this.sun.target.position.set(0, 0, -this.world.viewDistance / 2);
    this.sun.position.set(-34, 36, this.sun.target.position.z);
    shadowCamera.updateProjectionMatrix();
    this.resize();
    this.scene.fog.far = quality === 'high' ? 440 : 310;
    this.qualityElapsed = 0;
  }

  adaptQuality(dt) {
    if (!(dt > 0) || dt > 2) return; // ignorar pestañas suspendidas
    this.frameAverage += (Math.min(dt, 0.25) - this.frameAverage) * 0.04;
    this.qualityElapsed += dt;
    if (this.quality !== 'auto' || this.qualityElapsed < 3) return;
    this.qualityElapsed = 0;
    const max = Math.min(window.devicePixelRatio, 1.5);
    const next = THREE.MathUtils.clamp(this.pixelRatio + (this.frameAverage > 0.022 ? -0.125 : this.frameAverage < 0.017 ? 0.125 : 0), Math.min(0.55, max), max);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.sun.castShadow = next > 0.6;
      this.resize();
    }
  }

  // Geometrías y materiales compartidos por obstáculos, monedas y objetos
  buildAssets() {
    const yellowBlack = std({ map: T.stripes('#ffc61a', '#1c1c1c') });
    const gray = std({ color: 0x8b9096, metalness: 0.7, roughness: 0.4 });
    const dark = std({ color: 0x222426, metalness: 0.4 });
    const headlight = std({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 3 });

    // Colectivos: carrocería, vidrios, metal, goma y luces compartidos por línea.
    const bus = buildBusAssets();
    const busLines = bus.lines.map(({ line }) => ({ line }));
    const trains = bus.lines.map(line => line.body);
    const school = schoolProps();

    const minted = mintCoin();

    // Rampa: un prisma triangular delante del vagón (sube hasta el techo)
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0), new THREE.Vector2(RAMP_LEN, 0), new THREE.Vector2(0, TRAIN_TOP),
    ]);
    const rampGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false })
      .rotateY(-Math.PI / 2)
      .translate(0.95, 0, 0);

    this.A = {
      yellowBlack, gray, dark, headlight, trains, busLines, school, bus,
      rampMats: [dark, yellowBlack],
      rampGeo,
      coinGeo: minted.geometry,
      coinFarGeo: minted.farGeometry,
      coinMat: minted.material,
      light: new THREE.SphereGeometry(0.11, 10, 6),
      halo: new THREE.TorusGeometry(0.75, 0.06, 8, 32),
      haloMat: new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.8 }),
    };
    this.coinInstances = this.createCoinInstances(256);
    this.coinFarInstances = this.createCoinInstances(256, true);
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
    add(head, new THREE.SphereGeometry(0.193, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), M.hair, 0, 0.12, 0.03);
    hat(head, add, torso);

    // Perfil humano y prendas: orejas, nariz, nuca, costuras y bolsillos.
    for (const x of [-0.19, 0.19]) {
      add(head, new THREE.SphereGeometry(0.042, 10, 8), M.skin, x, 0.08, 0).scale.set(0.5, 1, 0.7);
    }
    add(head, new THREE.SphereGeometry(0.045, 10, 8), M.skin, 0, 0.07, -0.18).scale.set(0.7, 1.2, 1);
    add(torso, capsule(0.075, 0.07), M.skin, 0, 0.77, 0);
    const seam = std({ color: 0x3c443b, roughness: 1 });
    const pocket = box(0.17, 0.17, 0.015);
    for (const x of [-0.13, 0.13]) {
      add(body, pocket, M.pants, x, 1.02, 0.155).rotation.z = -x * 0.3;
      add(torso, box(0.008, 0.44, 0.008), seam, x * 1.6, 0.35, 0.17);
    }
    add(torso, box(0.32, 0.12, 0.025), seam, 0, 0.25, -0.19);

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
      top: std({ color: 0x1c3c70, roughness: 0.96, ...surface('fabric') }),
      pants: std({ color: 0x252c36, roughness: 0.95, ...surface('fabric') }),
      shoe: std({ color: 0xf4f4f4 }),
      hair: std({ color: 0x3e2717 }),
    };
    this.rig = this.buildRunner(P, {
      hat: (head, add, torso) => {
        add(torso, new RoundedBoxGeometry(.47,.75,.32,2,.04), P.top, 0,-.04,0);
      },
    });
    this.jetpack = this.makeJetpack();
    this.jetpack.position.set(0, 0.42, 0.3);
    this.jetpack.visible = false;
    this.rig.torso.add(this.jetpack);

    // Estanga de respaldo (si falla el GLB): suéter oliva, jean oscuro, botas
    // marrones, pelo y barba canosos y anteojos negros, como en la referencia.
    const G = {
      skin: std({ color: 0xd9ad98 }), top: std({ color: 0x3b4529 }),
      pants: std({ color: 0x1d2130 }), shoe: std({ color: 0x7a5a3a }), hair: std({ color: 0xb9b6b0 }),
    };
    this.guard = this.buildRunner(G, { wide: 1.16, hat: (head, add) => {
      const black=std({color:0x111417});
      // Casco de canas con volumen arriba y atrás (sin tapar la cara).
      const hair=add(head,new THREE.SphereGeometry(.205,16,10,0,Math.PI*2,0,Math.PI*.52),G.hair,0,.13,.035);
      hair.scale.set(1.04,.9,1.06);hair.name='EstangaFallbackHair';
      for(const x of [-.09,.09])add(head,box(.14,.065,.014),black,x,.10,-.184);
      add(head,box(.05,.012,.014),black,0,.11,-.197);
      add(head,new THREE.SphereGeometry(.10,12,8),G.hair,0,.005,-.145).scale.set(1.2,.7,.35);
    } });

    this.dog = buildShepherd();
    this.scene.add(this.dog.root);
    this.officerAnchor = new THREE.Group();
    this.scene.add(this.officerAnchor);
    this.officerReady = loadOfficer(this.officerAnchor).then(officer => {
      this.lightCharacter(officer);
      this.officer = officer;
      return officer;
    }).catch(error => {
      console.warn('Se usa el guardia de respaldo:', error);
      return null;
    });

    this.player = this.rig.root;
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.7), new THREE.MeshBasicMaterial({
      map: contactShadow(), transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, toneMapped: false,
    }));
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.025;
    this.scene.add(this.contact);
    this.characterAnchor = new THREE.Group();
    this.scene.add(this.characterAnchor);
    this.characterReady = loadRunner(this.characterAnchor).then(runner => {
      this.lightCharacter(runner);
      this.runner = runner;
      this.player.visible = false;
      this.jetpack.position.set(0, 1.45, 0.3);
      this.characterAnchor.add(this.jetpack);
      return runner;
    }).catch(error => {
      console.error('No se pudo cargar el corredor detallado:', error);
      this.cb.onCharacterError?.();
      return null;
    });
  }

  lightCharacter(character) {
    // Luz indirecta del cielo: deja leer tela y anatomía en el lado en sombra.
    character.model.traverse(mesh=>{
      for(const material of [mesh.material].flat())if(material?.isMeshStandardMaterial){
        material.envMap=this.environmentTarget.texture;material.envMapIntensity=.18;
      }
    });
  }

  createCoinInstances(capacity, distant = false) {
    const instances = new THREE.InstancedMesh(distant ? this.A.coinFarGeo : this.A.coinGeo, this.A.coinMat, capacity);
    instances.name = 'MintedCoins';
    instances.count = 0;
    instances.frustumCulled = false;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(instances);
    return instances;
  }

  syncCoins() {
    if (this.coins.length > this.coinInstances.instanceMatrix.count) {
      const capacity = Math.max(this.coins.length, this.coinInstances.instanceMatrix.count * 2);
      for (const key of ['coinInstances', 'coinFarInstances']) {
        const previous = this[key];
        this[key] = this.createCoinInstances(capacity, key === 'coinFarInstances');
        this.scene.remove(previous);
        previous.dispose();
      }
    }
    this.coinInstances.count = this.coinFarInstances.count = 0;
    this.coins.forEach(coin => {
      coin.mesh.updateMatrix();
      // A esta distancia el grabado ocupa menos de un píxel; conservar el
      // volumen metálico y reservar el detalle geométrico para el primer plano.
      const instances = coin.mesh.position.z < -28 ? this.coinFarInstances : this.coinInstances;
      instances.setMatrixAt(instances.count++, coin.mesh.matrix);
    });
    this.coinInstances.instanceMatrix.needsUpdate = true;
    this.coinFarInstances.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.coinInstances.count = this.coinFarInstances.count = 0;
    for (const list of [this.obstacles, this.coins, this.pickups]) {
      for (const o of list) { this.scene.remove(o.mesh); disposeBusView(o); }
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
    this.jumpBuffer = 0;
    this.rollTimer = 0;
    this.flyTimer = 0;
    this.invuln = 0;
    this.chase = 3;          // al empezar el guardia sale corriendo detrás
    this.danger = false;     // tropezar con el guardia cerca = te atrapa
    this.caughtReason = null;
    this.time = 0;
    this.shake = 0;
    this.camY = 4.0;
    this.cameraAimX = 0;
    this.cameraAimY = 1.15;
    this.guardZ = 2.6;
    this.guardX = 0;
    this.runner?.reset();
    this.officer?.reset();
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

  get playerHeight() {
    const crouch = this.runner ? this.runner.poseState.crouch : (this.rollTimer > 0 ? 1 : 0);
    return THREE.MathUtils.lerp(STAND_HEIGHT, ROLL_HEIGHT, crouch);
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
    const entering = this.rollTimer <= 0;
    this.rollTimer = Math.max(this.rollTimer, ROLL_TIME);
    if (!this.grounded && entering) this.vy = Math.min(this.vy, -14); // en el aire: bajar de golpe
  }
  // Mientras sigas agachado delante de la cámara, el corredor sigue rodando
  holdRoll() {
    if (this.state !== 'playing' || this.flyTimer > 0) return;
    this.rollTimer = Math.max(this.rollTimer, 0.25);
  }

  releaseRoll() {
    this.rollTimer = Math.min(this.rollTimer, 0.12);
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
      g.add(A.school.board.clone());
      yMax = 1.0;
      depth = 1.08;
    } else if (type === 'high') {
      g.add(A.school.desk.clone());
      yMin = 1.5;
      yMax = 1.65;
      depth = .8;
    } else {
      // Colectivo argentino: conserva rampas y techo transitable.
      const busIndex = Math.floor(Math.random() * A.trains.length);
      const { geometries, materials, lines } = A.bus;
      const line = lines.find(l => l.line === A.busLines[busIndex].line) ?? lines[busIndex];
      g.name = `Colectivo${A.busLines[busIndex].line}`;
      g.userData.line = A.busLines[busIndex].line;
      add(geometries.body, A.trains[busIndex], 0, 0);
      add(geometries.glass, materials.glass, 0, 0, 0, false);
      add(geometries.metal, materials.metal, 0, 0, 0, false);
      add(geometries.dark, materials.dark, 0, 0);
      add(geometries.lights, line.lights, 0, 0, 0, false);
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
    this.obstacles.push({ type, mesh: g, yMin, yMax, depth, ramp, rampGeometry: A.rampGeo });
  }

  addCoin(lane, z, y = 0.95) {
    const mesh = new THREE.Object3D();
    mesh.position.set(LANE_X[lane], y, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
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
  setArmTargets(targets) {
    this.armTargets = targets;
    this.armSeenAt = performance.now();
  }

  surfaceAt(x, zOffset = 0) {
    let h = 0, ramp = false, obstacle = null;
    for (const o of this.obstacles) {
      if (o.type !== 'train' || Math.abs(o.mesh.position.x - x) >= 1.1) continue;
      const front = o.mesh.position.z + zOffset + o.depth / 2;
      const back = o.mesh.position.z + zOffset - o.depth / 2;
      if (back - PLAYER_HALF_DEPTH <= 0 && 0 <= front + PLAYER_HALF_DEPTH) {
        if (TRAIN_TOP >= h) { h = TRAIN_TOP; ramp = false; obstacle = o; }
      } else if (o.ramp && front < 0 && front + o.ramp >= 0) {
        const rh = (TRAIN_TOP * (front + o.ramp)) / o.ramp;
        if (rh > h) { h = rh; ramp = true; obstacle = o; }
      }
    }
    return { h, ramp, obstacle };
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
    this.adaptQuality(dt);
    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    dt = Math.min(Math.max(dt, 0), 0.05);
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
        disposeBusView(o);
        this.obstacles.splice(i, 1);
      }
    }

    if (playing) this.updatePhysics(dt, move);
    const rolling = this.rollTimer > 0;
    const height = this.playerHeight;

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
      if ((playing && near) || c.mesh.position.z > NEAR_Z) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    this.syncCoins();

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
      if ((playing && near) || p.mesh.position.z > NEAR_Z) {
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }

    if (playing) this.emitScore();

    this.updatePlayerMesh(dt, rolling);
    this.characterAnchor.position.set(this.x, this.y, 0);
    this.characterAnchor.rotation.z = THREE.MathUtils.damp(this.characterAnchor.rotation.z,
      THREE.MathUtils.clamp(this.rig.root.rotation.z, -0.16, 0.16), 12, dt);
    this.characterAnchor.rotation.x = this.state === 'over' ? 0.35 : 0;
    if (this.runner) {
      this.runner.setDetail(this.quality !== 'balanced' && this.pixelRatio > .7);
      if (this.state !== 'paused') this.runner.update(dt, { running: playing, airborne: !this.grounded && this.flyTimer === 0, flying: this.flyTimer > 0, rolling, speed: this.speed, verticalSpeed: this.vy,
        turn: THREE.MathUtils.clamp((LANE_X[this.lane]-this.x)/2.2,-1,1),
        arms: performance.now() - this.armSeenAt < 350 ? this.armTargets : null });

    }
    const floor = this.surfaceAt(this.x).h;
    this.contact.position.set(this.x, floor + 0.025, 0);
    this.contact.material.opacity = 1 / (1 + Math.max(0, this.y - floor) * 1.5);
    this.contact.scale.setScalar(1 + this.y * 0.25);

    if (this.runner) {
      this.characterAnchor.visible = this.rig.root.visible;
      this.rig.root.visible = false;
    }

    this.updateGuard(dt);

    this.shake = Math.max(0, this.shake - dt * 2);
    updateChaseCamera(this,dt);

    this.renderer.render(this.scene, this.camera);
  }

  updatePhysics(dt, move) {
    const previousX = this.x;
    this.x = THREE.MathUtils.damp(this.x, LANE_X[this.lane], 18, dt);

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
      const previousY = this.y;
      const wasGrounded = this.grounded;
      this.y += this.vy * dt - 0.5 * GRAVITY * dt * dt;
      this.vy -= GRAVITY * dt;
      const g = this.surfaceAt(this.x);
      const previousSurface = this.surfaceAt(previousX, -move);
      // Contacto relativo: la rampa también sube durante el fotograma. Puede
      // alcanzar los pies aunque el salto aún tenga velocidad positiva.
      const rampStep = Math.max(0.7, (move + PLAYER_HALF_DEPTH) * TRAIN_TOP / RAMP_LEN + SURFACE_EPS);
      const fromAbove = this.vy <= 0 && previousY >= g.h - SURFACE_EPS;
      const risingRamp = previousSurface.ramp && previousSurface.obstacle === g.obstacle &&
        g.h >= previousSurface.h && g.h - previousSurface.h <= rampStep &&
        previousY >= previousSurface.h - SURFACE_EPS;
      const walking = wasGrounded && this.vy <= 0 && previousY >= g.h - rampStep;
      const rampEntry = wasGrounded && g.ramp &&
        g.h - previousSurface.h <= rampStep && previousY >= previousSurface.h - SURFACE_EPS;
      this.grounded = false;
      if (this.y <= g.h && (fromAbove || risingRamp || walking || rampEntry)) {
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
    const height = this.playerHeight;
    for (const o of this.obstacles) {
      const oz = o.mesh.position.z;
      const front = oz + o.depth / 2;
      const hitX = Math.abs(o.mesh.position.x - this.x) < 1.1;
      const hitZ = Math.abs(oz) < o.depth / 2 + PLAYER_HALF_DEPTH;
      if (!hitX || !hitZ) continue;

      if (o.type === 'train') {
        if (this.y >= TRAIN_TOP - SURFACE_EPS) continue; // vamos por encima
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

    r.ball.position.y = rolling ? -0.5 : 0;
    r.ball.rotation.x = 0;
    r.ball.scale.setScalar(1);
    this.pose(r, t, mode);
    if (rolling) r.body.position.y = -0.12;
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
    d.tail.rotation.z = Math.sin(this.time * 5) * 0.15;
    this.officerAnchor.position.copy(g.root.position);
    this.officerAnchor.visible = g.root.visible;
    if (this.officer) {
<<<<<<< HEAD
      this.officer.setDetail(this.profile.detail && this.pixelRatio > .7 && Math.abs(this.camera.position.z - this.guardZ) < 10);
      // Mira al alumno: el modelo avanza hacia -Z y el jugador está delante.
      const look = -Math.atan2(this.x - this.guardX, Math.max(.5, this.guardZ));
=======
      this.officer.setDetail(this.quality !== 'balanced' && this.pixelRatio > .7 && Math.abs(this.camera.position.z - this.guardZ) < 10);
>>>>>>> 13091e41cf732436a5271a745c79564a2b875d66
      if (this.state !== 'paused') this.officer.update(dt, {
        running: !still && !reached, airborne: false, rolling: false,
        speed: this.speed, grabbing: reached, look,
      });
      g.root.visible = false;
    } else {
      this.officerAnchor.visible = false;
    }
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
