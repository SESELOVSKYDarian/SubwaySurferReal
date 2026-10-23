import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Modelo y texturas locales; la partida sigue disponible si falla la carga.
export async function loadRunner(parent) {
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/characters/runner.glb', import.meta.url).href);
  const model = gltf.scene;
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
    for (const material of [object.material].flat()) {
      material.envMapIntensity = 0.35;
      if (material.map) material.map.anisotropy = 4;
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  if (!actions.Idle || !actions.Run) throw new Error('El corredor no contiene Idle y Run');
  parent.add(model);
  let active = actions.Idle;
  active.play();
  let tuck = 0;
  return {
    model,
    update(dt, { running, airborne, rolling, speed }) {
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
      if (airborne && !rolling) {
        if (bones.LeftUpLeg) bones.LeftUpLeg.rotation.x -= 0.5;
        if (bones.RightUpLeg) bones.RightUpLeg.rotation.x += 0.25;
      }
    },
  };
}
