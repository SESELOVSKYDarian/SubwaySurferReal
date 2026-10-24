import * as THREE from 'three';

// Intersección segmento/caja: solo volumen del colectivo, sin lanzar rayos
// contra miles de triángulos ni modificar sus colisiones de juego.
export function busBlocksView(from, to, obstacle) {
  const p=obstacle.mesh.position, d=obstacle.depth/2;
  const min=[p.x-1.13,.45,p.z-d],max=[p.x+1.13,3.36,p.z+d];
  const a=[from.x,from.y,from.z],b=[to.x,to.y,to.z];
  let lo=0,hi=1;
  for(let i=0;i<3;i++){
    const delta=b[i]-a[i];
    if(Math.abs(delta)<1e-7){if(a[i]<min[i]||a[i]>max[i])return false;continue;}
    let t0=(min[i]-a[i])/delta,t1=(max[i]-a[i])/delta;
    if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);
    if(lo>hi)return false;
  }
  return hi>0 && lo<.98;
}

export function updateChaseCamera(game,dt) {
  const {camera,x,y}=game;
  const support=game.surfaceAt(x).h;
  const follow=game.flyTimer>0?y:Math.min(y,support),jump=y-follow;
  const laneX=[-2.2,0,2.2][game.lane];
  const distance=Math.max(7.8,4.8/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  const anticipated=x+(laneX-x)*.35;
  const cameraX=THREE.MathUtils.clamp(anticipated*.7,-1.55,1.55);
  const nearby=game.obstacles.some(o=>o.type==='train' &&
    o.mesh.position.z+o.depth/2>1 && o.mesh.position.z-o.depth/2<distance &&
    Math.abs(o.mesh.position.x-cameraX)<2.5);
  const desiredY=(nearby?5.5:4.0)+(distance-7.8)*.12+follow+jump*.25;
  const smooth=(a,b,k)=>dt===0?b:THREE.MathUtils.damp(a,b,k,dt);
  game.camY=smooth(game.camY,desiredY,desiredY>game.camY?12:4);
  camera.position.set(smooth(camera.position.x,cameraX,8),game.camY,distance);
  const shake=game.shake;
  camera.position.x+=(Math.random()-.5)*shake;
  camera.position.y+=(Math.random()-.5)*shake;
  game.cameraAimX=smooth(game.cameraAimX||0,anticipated*.38,9);
  game.cameraAimY=smooth(game.cameraAimY??1.15,1.15+follow+jump*.15,9);
  camera.lookAt(game.cameraAimX,game.cameraAimY,-12);

  const head={x,y:y+1.5,z:0};
  for(const o of game.obstacles){
    if(o.type!=='train')continue;
    const p=o.mesh.position;
    let blocked=false;
    if(p.z+o.depth/2>1 && p.z-o.depth/2<distance){
      blocked=busBlocksView(camera.position,head,o);
      // Los colectivos cercanos tampoco deben tapar el carril libre de al lado.
      for(const targetX of [-2.2,0,2.2]){
        if(Math.abs(targetX-p.x)<1.1)continue;
        if(busBlocksView(camera.position,{x:targetX,y:follow+.9,z:-10},o))blocked=true;
      }
    }
    setBusVisibility(o,blocked,dt);
  }
}

function setBusVisibility(obstacle,blocked,dt){
  if(!obstacle.viewMaterials && !blocked)return;
  if(!obstacle.viewMaterials){
    const copies=new Map();
    obstacle.mesh.traverse(mesh=>{
      if(!mesh.isMesh)return;
      // Conservar opaca la rampa: sigue señalando dónde se puede subir.
      if(mesh.geometry===obstacle.rampGeometry)return;
      const materials=[mesh.material].flat().map(original=>{
        if(!copies.has(original)){
          const material=original.clone();material.transparent=true;
          copies.set(original,material);
        }
        return copies.get(original);
      });
      mesh.material=Array.isArray(mesh.material)?materials:materials[0];
    });
    obstacle.viewMaterials=[...copies.values()];obstacle.viewOpacity=1;
  }
  obstacle.viewOpacity=dt===0?(blocked ? .22:1):THREE.MathUtils.damp(obstacle.viewOpacity,blocked ? .22:1,blocked?16:7,dt);
  if(Math.abs(obstacle.viewOpacity-1)<.002)obstacle.viewOpacity=1;
  for(const material of obstacle.viewMaterials){
    material.opacity=obstacle.viewOpacity;material.depthWrite=obstacle.viewOpacity>.98;
  }
}

export function disposeBusView(obstacle){
  obstacle.viewMaterials?.forEach(material=>material.dispose());
}
