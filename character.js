import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { surface } from './materials.js';

const sources=new Map();
function getSource(teacher=false,low=false) {
  const stem=teacher?'professor-police':'technical-student';
  const filename=stem+(low?'-low':'')+'.glb';
  if(!sources.has(filename))sources.set(filename,new GLTFLoader().loadAsync(
    new URL('./assets/characters/'+filename,import.meta.url).href,
  ).catch(error=>{sources.delete(filename);if(low)return null;throw error;}));
  return sources.get(filename);
}

// Rig de alumno/taller: cabeza descubierta, ropa y guardapolvo modelados como
// geometría propia. Las posturas se calculan desde cero, sin sumar giros de una
// carrera a un salto ni usar el temporizador de colisión como ángulo del cuerpo.
export async function loadRunner(parent, { teacher = false } = {}) {
  const [gltf, low] = await Promise.all([getSource(teacher), getSource(teacher,true)]);
  const lowGeometries = new Map();
  low?.scene.traverse(mesh => { if (mesh.isMesh) lowGeometries.set(mesh.name, mesh.geometry); });
  const detailMeshes = [];
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
      if (['StudentCoat', 'TeacherSweater', 'SweaterRib', 'Shirt', 'Trousers'].includes(copy.name)) {
        Object.assign(copy, surface('fabric'));
        copy.roughness = 0.92;
      }
      if (copy.name === 'Skin') {
        Object.assign(copy, surface('skin'));
        copy.roughness = .72;
      }
      if(copy.name==='GrayBeard'){
        copy.map=beardTexture();copy.transparent=true;copy.depthWrite=false;copy.alphaTest=.05;
      }
      if(copy.name==='GrayHair' || copy.name==='GrayBeard') {
        Object.assign(copy,surface('fur'));copy.bumpScale=.0015;
      }
      return copy;
    });
    if (object.material.length === 1) object.material = object.material[0];
    const lowGeometry = lowGeometries.get(object.name);
    detailMeshes.push({ mesh: object, high: object.geometry,
      low: lowGeometry || object.geometry });
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
  if(!teacher)addSchoolBadge(parent, bones, false);

  const rest = Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()]));
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const poseState = { crouch: 0, air: 0, run: 0, flight: 0, phase: 0, rootDrop: 0, landing: 0, tuck: 0, turn: 0 };
  let wasAirborne = false, lastVerticalSpeed = 0, animationTime = 0;
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
    const stride = Math.cos(phase) * 0.34 * poseState.run * (1 - poseState.crouch);
    const lift = Math.max(0, Math.sin(phase)) * 0.19 * poseState.run * (1 - poseState.crouch);
    const hip = restPosition[`${side}UpLeg`];
    const ankle = restPosition[`${side}Foot`];
    const left=side==='Left';
    const dz = ankle.z - hip.z + stride + poseState.air * (left ? -.20 : .09);
    const dy = ankle.y - hip.y + poseState.rootDrop + lift +
      poseState.air * ((left ? .22 : .10) + poseState.tuck * (left ? 1 : .65));
    const d = THREE.MathUtils.clamp(Math.hypot(dy, dz), Math.abs(l1-l2)+0.001, l1+l2-0.001);
    const bend = -Math.acos(THREE.MathUtils.clamp((d*d-l1*l1-l2*l2)/(2*l1*l2),-1,1));
    const thigh = Math.atan2(-dz,-dy)-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend))-a0;
    const shin = bend-(b0-a0);
    move(`${side}UpLeg`, thigh, 0, 0, alpha);
    move(`${side}Leg`, shin, 0, 0, alpha);
    move(`${side}Foot`, -(thigh+shin), 0, 0, alpha);
  };
  const armWeights = {};
  const armRotations = {};
  const direction = new THREE.Vector3();
  const parentRotation = new THREE.Quaternion();
  const modelRotation = new THREE.Quaternion();
  const trackedRotation = new THREE.Quaternion();
  const restDirections = {};
  for (const side of ['Left', 'Right']) {
    restDirections[`${side}Arm`] = restPosition[`${side}ForeArm`].clone().sub(restPosition[`${side}Arm`]).normalize();
    restDirections[`${side}ForeArm`] = restPosition[`${side}Hand`].clone().sub(restPosition[`${side}ForeArm`]).normalize();
    restDirections[`${side}Hand`] = restDirections[`${side}ForeArm`];
  }
  const followArms = (dt, arms) => {
    model.getWorldQuaternion(modelRotation);
    for (const side of ['Left', 'Right']) for (const part of ['Arm', 'ForeArm', 'Hand']) {
      const name = side + part, bone = bones[name], sample = arms?.[name];
      armWeights[name] = THREE.MathUtils.damp(armWeights[name] || 0, sample ? (arms[`${side}Weight`] ?? 1) : 0, 12, dt);
      if (!sample || armWeights[name] < 0.001) continue;
      // Convertir la dirección de cámara al espacio del padre de cada hueso.
      // Así doblar el codo no vuelve a rotar el hombro ni acumula ángulos.
      bone.parent.getWorldQuaternion(parentRotation).invert();
      direction.fromArray(sample).applyQuaternion(modelRotation).applyQuaternion(parentRotation).normalize();
      trackedRotation.setFromUnitVectors(restDirections[name], direction).multiply(rest[name]);
      armRotations[name] ??= bone.quaternion.clone();
      armRotations[name].slerp(trackedRotation, 1 - Math.exp(-12 * dt));
      bone.quaternion.slerp(armRotations[name], armWeights[name] * (1 - poseState.crouch));
      bone.updateWorldMatrix(false, false);
    }
  };
  const soleSamples=[],soleIndices=new WeakMap();
  for(const {mesh} of detailMeshes) {
    if(![mesh.material].flat().some(material=>material.name==='Shoes'))continue;
    soleSamples.push(mesh);
  }
  const solePoint=new THREE.Vector3(),parentInverse=new THREE.Matrix4();
  const plantFeet = () => {
    parentInverse.copy(model.parent.matrixWorld).invert();
    let lowest=Infinity;
    for(const mesh of soleSamples){
      let indices=soleIndices.get(mesh.geometry);
      if(!indices){
        indices=[];const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)if(positions.getY(i)<.035)indices.push(i);
        soleIndices.set(mesh.geometry,indices);
      }
      for(const index of indices){
        mesh.getVertexPosition(index,solePoint);
        solePoint.applyMatrix4(mesh.matrixWorld).applyMatrix4(parentInverse);
        lowest=Math.min(lowest,solePoint.y);
      }
    }
    if(Number.isFinite(lowest))model.position.y-=THREE.MathUtils.clamp(lowest,-.12,.18)*(1-poseState.crouch);
  };
  const controller = {
    model, bones, poseState,
    setDetail(high = true) {
      for (const entry of detailMeshes) {
        const geometry=high ? entry.high : entry.low;
        if (entry.mesh.geometry !== geometry) {
          entry.mesh.geometry=geometry;
          entry.mesh.boundingBox=entry.mesh.boundingSphere=null;
        }
      }
    },
    reset() {
      Object.values(bones).forEach(bone => bone.quaternion.copy(rest[bone.name.replace(/^mixamorig:?/, '')]));
      for (const name of Object.keys(armWeights)) { armWeights[name] = 0; delete armRotations[name]; }
      Object.assign(poseState, { crouch: 0, air: 0, run: 0, flight: 0, phase: 0, rootDrop: 0, landing: 0, tuck: 0, turn: 0 });
      wasAirborne=false;lastVerticalSpeed=0;animationTime=0;
      model.position.set(0,0,0);
      model.rotation.set(0,0,0);
      controller.update(0.1, {});
    },
    update(dt, { running = false, airborne = false, rolling = false, speed = 14, flying = false, grabbing = false, arms = null, verticalSpeed = 0, turn = 0 } = {}) {
      dt = THREE.MathUtils.clamp(dt,0,0.1);
      animationTime += dt;
      if(wasAirborne && !airborne && !flying) poseState.landing=Math.min(.09,Math.abs(lastVerticalSpeed)*.007);
      wasAirborne=airborne;lastVerticalSpeed=verticalSpeed;
      poseState.landing=THREE.MathUtils.damp(poseState.landing,0,12,dt);
      poseState.tuck=THREE.MathUtils.damp(poseState.tuck,airborne ? .06+.18*(1-Math.min(1,Math.abs(verticalSpeed)/13)):0,12,dt);
      poseState.turn=THREE.MathUtils.damp(poseState.turn,turn,10,dt);
      const crouching = rolling && !airborne && !flying;
      const blend = 1 - Math.exp(-22 * dt);
      poseState.crouch = THREE.MathUtils.damp(poseState.crouch, crouching ? 1 : 0, 22, dt);
      poseState.air = THREE.MathUtils.damp(poseState.air, airborne ? 1 : 0, 14, dt);
      poseState.flight = THREE.MathUtils.damp(poseState.flight, flying ? 1 : 0, 14, dt);
      poseState.run = THREE.MathUtils.damp(poseState.run, running && !airborne && !crouching && !flying ? 1 : 0, 16, dt);
      poseState.phase += dt * THREE.MathUtils.clamp(speed * 0.65, 7, 14) * poseState.run;
      const bounce=(1-Math.cos(poseState.phase*2))*.022*poseState.run;
      poseState.rootDrop = poseState.crouch * .68 + (bounce+poseState.landing)*(1-poseState.crouch);
      model.position.y = -poseState.rootDrop + (!running && !airborne ? Math.sin(animationTime*2.2)*.003 : 0);
      model.rotation.y=-poseState.turn*.13*(1-poseState.crouch);
      move('Hips',0,Math.sin(poseState.phase)*.055*poseState.run,
        Math.sin(poseState.phase)*.022*poseState.run,blend);
      // Los pies se resuelven como dos eslabones; el torso se inclina sin girar
      // todo el personaje. Mantener agachado no reinicia ninguna animación.
      legPose('Left', poseState.phase, blend);
      legPose('Right', poseState.phase + Math.PI, blend);
      move('Spine', -0.20*poseState.run - 0.65*poseState.crouch - 0.1*poseState.flight - poseState.landing*.7,
        -Math.sin(poseState.phase)*0.045*poseState.run, 0, blend);
      move('Spine2', -0.35*poseState.crouch, -Math.sin(poseState.phase)*0.10*poseState.run, 0, blend);
      move('Neck', 0.12*poseState.crouch, 0, 0, blend);
      move('Head', 0.02, 0, 0, blend);
      for (const [side, sign] of [['Left',1],['Right',-1]]) {
        const swing = sign*Math.cos(poseState.phase)*0.80*poseState.run;
        const reach = grabbing ? 1.1 : 0;
        move(`${side}Arm`, swing + (sign>0 ? .65 : .35)*poseState.air + 0.8*poseState.crouch + reach,
          0, -sign*(.70 - .26*poseState.crouch - .12*poseState.air), blend);
        move(`${side}ForeArm`, .95*poseState.run + .45*poseState.crouch + .40*poseState.air + .65*poseState.flight, 0, 0, blend);
        move(`${side}Hand`,-.12*poseState.run,0,0,blend);
      }
      followArms(dt, arms);
      model.updateMatrixWorld(true);
      if(running && !airborne && !flying && !crouching) {
        plantFeet();model.updateMatrixWorld(true);
      }
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

let beardMap;
function beardTexture(){
  if(beardMap)return beardMap;
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d'),pixels=ctx.createImageData(256,256);
  let seed=701;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let row=0;row<256;row++)for(let col=0;col<256;col++){
    const x=col/255*.24-.12,y=1.72+(1-row/255)*.16;
    const top=1.802+.040*Math.min(1,Math.abs(x)/.10);
    const fade=THREE.MathUtils.smoothstep(top-y,0,.018)*THREE.MathUtils.smoothstep(y-1.737,0,.014)*THREE.MathUtils.smoothstep(.112-Math.abs(x),0,.018);
    const noise=random(),i=(row*256+col)*4,v=140+noise*115;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;
    pixels.data[i+3]=Math.round(255*fade*(.55+.45*noise));
  }
  ctx.putImageData(pixels,0,0);beardMap=new THREE.CanvasTexture(c);beardMap.colorSpace=THREE.SRGBColorSpace;
  return beardMap;
}
