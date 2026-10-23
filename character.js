import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let source;
const getSource = () => source || (source = new GLTFLoader().loadAsync(new URL('./assets/characters/runner.glb', import.meta.url).href).catch(error => { source = null; throw error; }));

// Modelo y texturas locales; la partida sigue disponible si falla la carga.
export async function loadRunner(parent, { officer = false } = {}) {
  const gltf = await getSource();
  const model = clone(gltf.scene);
  model.name = officer ? 'Officer' : 'Runner';
  // Los huesos son hermanos de las mallas en este GLB. Actualizar primero toda
  // la jerarquía evita medir la piel con matrices de huesos sin inicializar.
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (object.isSkinnedMesh) {
      object.skeleton.update();
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
  });
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = 2.05 / bounds.getSize(new THREE.Vector3()).y;
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  // El modelo ya mira hacia -Z, en el sentido del recorrido.
  model.rotation.y = 0;
  const bones = {};
  model.traverse(object => {
    if (object.isBone) bones[object.name.replace(/^mixamorig:?/, '')] = object;
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone();
    for (const material of [object.material].flat()) {
      material.envMapIntensity = 0.35;
      if (material.map) material.map.anisotropy = 4;
      if (officer) {
        material.name = 'PoliceUniform';
        material.roughness = 0.78;
        // Conservar el desgaste y los detalles del albedo bajo el uniforme azul.
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            float cloth = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(vec3(0.009, 0.014, 0.024), vec3(0.09, 0.14, 0.23), smoothstep(0.015, 0.62, cloth));
          `);
        };
        material.customProgramCacheKey = () => 'police-uniform-v1';
      }
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  if (!actions.Idle || !actions.Run) throw new Error('El corredor no contiene Idle y Run');
  parent.add(model);
  if (officer) addPoliceEquipment(parent, bones);
  let active = actions.Idle;
  active.play();
  let tuck = 0;
  return {
    model,
    update(dt, { running, airborne, rolling, speed, grabbing = false }) {
      const next = running ? actions.Run : actions.Idle;
      if (next !== active) {
        next.reset().setEffectiveWeight(1).play();
        active.crossFadeTo(next, 0.18, false);
        active = next;
      }
      actions.Run.timeScale = THREE.MathUtils.clamp(speed / 15, 0.85, 1.65);
      mixer.update(dt);
      // Pose aditiva sobre el esqueleto, sin escalar el cuerpo al agacharse.
      tuck = THREE.MathUtils.damp(tuck, rolling ? 1 : 0, 20, dt);
      if (bones.Spine) bones.Spine.rotation.x -= tuck * 0.65;
      if (bones.LeftUpLeg) bones.LeftUpLeg.rotation.x -= tuck * 0.7;
      if (bones.RightUpLeg) bones.RightUpLeg.rotation.x -= tuck * 0.7;
      if (bones.LeftLeg) bones.LeftLeg.rotation.x += tuck * 1.1;
      if (bones.RightLeg) bones.RightLeg.rotation.x += tuck * 1.1;
      if (grabbing) {
        for (const side of ['Left', 'Right']) {
          if (bones[`${side}Arm`]) bones[`${side}Arm`].rotation.z += side === 'Left' ? -0.9 : 0.9;
          if (bones[`${side}ForeArm`]) bones[`${side}ForeArm`].rotation.x += 0.5;
        }
      }
      if (airborne && !rolling) {
        if (bones.LeftUpLeg) bones.LeftUpLeg.rotation.x -= 0.5;
        if (bones.RightUpLeg) bones.RightUpLeg.rotation.x += 0.25;
      }
    },
  };
}

function addPoliceEquipment(parent, bones) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#111d31';ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#d8dfdd';ctx.font='bold 78px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('POLICÍA',256,64);
  const patch=new THREE.CanvasTexture(canvas);patch.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.MeshStandardMaterial({map:patch,roughness:.85});
  const leather=new THREE.MeshStandardMaterial({color:0x14171b,roughness:.85});
  const badge=new THREE.MeshStandardMaterial({color:0xb5aa77,metalness:.75,roughness:.4});
  const attach=(bone,geometry,material,position,rotationY=0)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.y=rotationY;
    mesh.castShadow=true;parent.add(mesh);parent.updateMatrixWorld(true);
    (bones[bone]||bones.Spine2).attach(mesh);return mesh;
  };
  attach('Spine2',new THREE.PlaneGeometry(.56,.14),label,[0,1.56,.36]);
  attach('Spine2',new THREE.PlaneGeometry(.28,.075),label,[.09,1.55,-.34],Math.PI);
  attach('Hips',new THREE.TorusGeometry(.24,.025,6,28).rotateX(Math.PI/2).scale(1,1,.8),leather,[0,1.04,0]);
  for(const side of [-1,1])attach('Hips',new RoundedBoxGeometry(.13,.19,.09,2,.015),leather,[side*.25,1.0,.01]);
  attach('Spine2',new THREE.CylinderGeometry(.035,.03,.007,6).rotateX(Math.PI/2),badge,[-.1,1.56,-.345]);
  attach('Spine2',new RoundedBoxGeometry(.065,.12,.035,2,.008),leather,[-.15,1.64,-.31]);
}

export const loadOfficer = parent => loadRunner(parent, { officer: true });
