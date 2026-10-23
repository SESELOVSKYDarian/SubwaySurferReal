import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { surface } from './materials.js';

let source;
const getSource = () => source || (source = new GLTFLoader().loadAsync(
  new URL('./assets/characters/technical-student.glb', import.meta.url).href,
).catch(error => { source = null; throw error; }));

// Rig de alumno/taller: cabeza descubierta, ropa y guardapolvo modelados como
// geometría propia. Las posturas se calculan desde cero, sin sumar giros de una
// carrera a un salto ni usar el temporizador de colisión como ángulo del cuerpo.
export async function loadRunner(parent, { teacher = false } = {}) {
  const gltf = await getSource();
  const model = clone(gltf.scene);
  model.name = teacher ? 'Teacher' : 'TechnicalStudent';
  model.updateMatrixWorld(true);
  const bones = {};
  model.traverse(object => {
    if (object.isBone) bones[object.name.replace(/^mixamorig:?/, '')] = object;
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    object.material = [object.material].flat().map(material => {
      const copy = material.clone();
      if (['StudentCoat', 'Shirt', 'Trousers'].includes(copy.name)) {
        Object.assign(copy, surface('fabric'));
        copy.roughness = 0.92;
      }
      if (teacher && copy.name === 'StudentCoat') {
        copy.color.setHex(0x77776d);
        copy.name = 'TeacherCoat';
      }
      if (teacher && copy.name === 'Hair') copy.color.setHex(0x514a43);
      return copy;
    });
    if (object.material.length === 1) object.material = object.material[0];
    if (object.isSkinnedMesh) {
      object.skeleton.update();
      object.computeBoundingBox();
      object.computeBoundingSphere();
      // Rodillas y faldones salen de la caja de reposo al agacharse. No usar esa
      // caja estática para hacer desaparecer una parte del personaje animado.
      object.frustumCulled = false;
    }
  });
  const bounds = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(2.05 / bounds.getSize(new THREE.Vector3()).y);
  parent.add(model);
  addSchoolBadge(parent, bones, teacher);

  const rest = Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()]));
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const poseState = { crouch: 0, air: 0, run: 0, flight: 0, phase: 0, rootDrop: 0 };
  const restPosition = Object.fromEntries(Object.entries(bones).map(([name, bone]) => {
    const p = bone.getWorldPosition(new THREE.Vector3());
    return [name, model.worldToLocal(p)];
  }));
  const move = (name, x = 0, y = 0, z = 0, alpha = 1) => {
    if (!bones[name]) return;
    target.setFromEuler(euler.set(x, y, z)).premultiply(rest[name]);
    bones[name].quaternion.slerp(target, alpha);
  };
  const legPose = (side, phase, alpha) => {
    const up = bones[`${side}UpLeg`];
    const knee = bones[`${side}Leg`];
    const foot = bones[`${side}Foot`];
    const l1 = Math.hypot(knee.position.y, knee.position.z);
    const l2 = Math.hypot(foot.position.y, foot.position.z);
    const a0 = Math.atan2(-knee.position.z, -knee.position.y);
    const b0 = Math.atan2(-foot.position.z, -foot.position.y);
    const stride = Math.cos(phase) * 0.24 * poseState.run * (1 - poseState.crouch);
    const lift = Math.max(0, Math.sin(phase)) * 0.14 * poseState.run * (1 - poseState.crouch);
    const hip = restPosition[`${side}UpLeg`];
    const ankle = restPosition[`${side}Foot`];
    const dz = ankle.z - hip.z + stride - poseState.air * 0.11;
    const dy = ankle.y - hip.y + poseState.rootDrop + lift + poseState.air * 0.17;
    const d = THREE.MathUtils.clamp(Math.hypot(dy, dz), Math.abs(l1-l2)+0.001, l1+l2-0.001);
    const bend = -Math.acos(THREE.MathUtils.clamp((d*d-l1*l1-l2*l2)/(2*l1*l2),-1,1));
    const thigh = Math.atan2(-dz,-dy)-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend))-a0;
    const shin = bend-(b0-a0);
    move(`${side}UpLeg`, thigh, 0, 0, alpha);
    move(`${side}Leg`, shin, 0, 0, alpha);
    move(`${side}Foot`, -(thigh+shin), 0, 0, alpha);
  };
  const controller = {
    model, bones, poseState,
    reset() {
      Object.values(bones).forEach(bone => bone.quaternion.copy(rest[bone.name.replace(/^mixamorig:?/, '')]));
      Object.assign(poseState, { crouch: 0, air: 0, run: 0, flight: 0, phase: 0, rootDrop: 0 });
      model.position.set(0,0,0);
      model.rotation.set(0,0,0);
      controller.update(0.1, {});
    },
    update(dt, { running = false, airborne = false, rolling = false, speed = 14, flying = false, grabbing = false } = {}) {
      dt = THREE.MathUtils.clamp(dt,0,0.1);
      const crouching = rolling && !airborne && !flying;
      const blend = 1 - Math.exp(-22 * dt);
      poseState.crouch = THREE.MathUtils.damp(poseState.crouch, crouching ? 1 : 0, 22, dt);
      poseState.air = THREE.MathUtils.damp(poseState.air, airborne ? 1 : 0, 14, dt);
      poseState.flight = THREE.MathUtils.damp(poseState.flight, flying ? 1 : 0, 14, dt);
      poseState.run = THREE.MathUtils.damp(poseState.run, running && !airborne && !crouching && !flying ? 1 : 0, 16, dt);
      poseState.phase += dt * THREE.MathUtils.clamp(speed * 0.65, 7, 14) * poseState.run;
      poseState.rootDrop = poseState.crouch * 0.68;
      model.position.y = -poseState.rootDrop;
      // Los pies se resuelven como dos eslabones; el torso se inclina sin girar
      // todo el personaje. Mantener agachado no reinicia ninguna animación.
      legPose('Left', poseState.phase, blend);
      legPose('Right', poseState.phase + Math.PI, blend);
      move('Spine', -0.12*poseState.run - 0.65*poseState.crouch - 0.1*poseState.flight, 0, 0, blend);
      move('Spine2', -0.35*poseState.crouch, Math.sin(poseState.phase)*0.04*poseState.run, 0, blend);
      move('Neck', 0.12*poseState.crouch, 0, 0, blend);
      move('Head', 0.02, 0, 0, blend);
      for (const [side, sign] of [['Left',1],['Right',-1]]) {
        const swing = -sign*Math.sin(poseState.phase)*0.65*poseState.run;
        const reach = grabbing ? 1.1 : 0;
        move(`${side}Arm`, swing + 0.6*poseState.air + 0.8*poseState.crouch + reach,
          0, -sign*(0.36 + 0.08*poseState.crouch), blend);
        move(`${side}ForeArm`, 0.2*poseState.run + 0.45*poseState.crouch, 0, 0, blend);
        move(`${side}Hand`,0,0,0,blend);
      }
      model.updateMatrixWorld(true);
    },
  };
  controller.update(0.1, {});
  return controller;
}

function addSchoolBadge(parent, bones, teacher) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=teacher?'#41443c':'#16365c';ctx.fillRect(0,0,256,128);
  ctx.fillStyle='#dce3e5';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`bold ${teacher?35:42}px Arial`;ctx.fillText(teacher?'PROFESOR':'TÉCNICA',128,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const badge=new THREE.Mesh(new THREE.PlaneGeometry(.15,.065),new THREE.MeshStandardMaterial({map:texture,roughness:.9}));
  badge.name=teacher?'TeacherBadge':'SchoolBadge';
  badge.position.set(.10,1.49,-.184);badge.rotation.y=Math.PI;
  parent.add(badge);parent.updateMatrixWorld(true);bones.Spine2.attach(badge);
}

// Alias mantenido para las reglas de persecución del juego; visualmente es profesor.
export const loadOfficer = parent => loadRunner(parent, { teacher: true });
