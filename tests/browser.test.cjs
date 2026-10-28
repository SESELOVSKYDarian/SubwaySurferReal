const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdir}=require('node:fs/promises');
const {harness}=require('./harness.cjs');
let env;
before(async()=>{env=await harness();});
after(async()=>{if(env)await env.close();});

test('Juan B. Justo repite fachadas y muros, reinicia en la costa y mantiene recursos acotados', {timeout:120000}, async()=>{
 const page=await env.browser.newPage({viewport:{width:1120,height:720}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try {
  await page.goto(env.url);
  const stats=await page.evaluate(async()=>{
   const THREE=await import('three');
   const {Game}=await import('./game.js');const {ROUTE_LENGTH,LOT_LENGTH,AVENUE_PROFILES,LANDMARKS,isLandmarkKind}=await import('./avenue-route.js');
   const game=window.avenueDemo=new Game(document.querySelector('#game'));
   await Promise.all([game.characterReady,game.officerReady]);
   game.setQuality('balanced');game.start();game.nextSpawn=Infinity;game.update(0);
   const world=game.world,children=game.scene.children.length;
   const snapshot=()=>JSON.stringify({
    buildings:world.buildings.filter(b=>b.group.visible).map(b=>[b.group.position.z,b.group.userData.landmark,b.group.userData.routeIndex,b.facade.material.uuid,b.sign.visible]),
    sides:world.segments.map(s=>[s.group.position.z,s.graffiti.material.uuid,s.fence.visible,s.tree.visible,s.tree.position.z,s.tree.scale.x,s.lamp.position.z]),
   });
   const original=snapshot();world.update(0,ROUTE_LENGTH);
   if(snapshot()!==original)throw Error('La segunda vuelta altera la secuencia');
   let maxMeshes=0,maxTriangles=0,totalTriangles=0,frames=0;
   for(let distance=0;distance<ROUTE_LENGTH*3;distance+=LOT_LENGTH){
    world.update(0,distance);
    for(const segment of world.segments){
     if(segment.wall.castShadow!==segment.group.visible||segment.top.castShadow!==segment.group.visible||
        segment.wall.receiveShadow!==segment.group.visible||segment.top.receiveShadow!==segment.group.visible)
      throw Error('Las sombras de los muros no siguen el reciclado visible');
    }
    for(const building of world.buildings){
     if(building.box.castShadow!==building.group.visible||building.facade.receiveShadow!==building.group.visible||
        building.cornice.castShadow!==building.group.visible||building.roof.castShadow!==building.group.visible)
      throw Error('Las sombras de las fachadas no siguen los edificios visibles');
    }
    const visible=world.buildings.filter(b=>b.group.visible);
    if(new Set(visible.map(b=>`${b.s}:${b.slot}`)).size!==visible.length)throw Error('Hito de varios lotes dibujado dos veces');
    let meshes=0,triangles=0;
    for(const b of visible)b.group.traverseVisible(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});
    maxMeshes=Math.max(meshes,maxMeshes);maxTriangles=Math.max(triangles,maxTriangles);totalTriangles+=triangles;frames++;
   }
   if(maxMeshes>105||maxTriangles>7700||totalTriangles/frames>3522)throw Error('Se superó el presupuesto gráfico de los edificios anteriores');
   for(const landmark of LANDMARKS){
    const profile=AVENUE_PROFILES.find(p=>p.id===landmark.profile);
    if(!isLandmarkKind(profile.kind))continue;
    world.update(0,landmark.slot*LOT_LENGTH);
    const b=world.buildings.find(b=>b.group.visible&&b.s===landmark.side&&b.slot===landmark.slot);
    if(!b||b.facade.scale.x!==1)throw Error('Hito ausente o texto espejado');
    const seg=world.segments.find(s=>s.s===landmark.side&&s.slot===landmark.slot);
    if(seg.fence.visible||!seg.wall.visible)throw Error('Reja tapa el hito o desaparece el paredón');
    if(profile.kind==='lumber'){
     b.cornice.geometry.computeBoundingBox();const bounds=b.cornice.geometry.boundingBox;
     if(bounds.max.y-bounds.min.y<3)throw Error('La maderera no tiene techo curvo');
    }
    if(profile.kind==='station'){
     const body=new THREE.Mesh(b.box.geometry,b.box.material);body.updateMatrixWorld();
     const ray=new THREE.Raycaster(new THREE.Vector3(-1,2.5,1),new THREE.Vector3(1,0,0));
     const hit=ray.intersectObject(body)[0];
     if(!hit||hit.point.x<10)throw Error('La estación dejó de ser una playa abierta');
    }
    if(profile.kind==='arena'){
     b.cornice.geometry.computeBoundingBox();const roof=b.cornice.geometry.boundingBox;
     if(roof.max.y<12||roof.max.z-roof.min.z<80)throw Error('El polideportivo perdió su cubierta amplia');
     const vertices=b.facade.geometry.attributes.position;
     const curved=new Set(Array.from({length:vertices.count},(_,i)=>vertices.getX(i).toFixed(2)));
     if(curved.size<12||!b.awning.visible)throw Error('Falta la fachada curva o el anillo vidriado');
     for(let offset=0;offset<landmark.span;offset++){
      const segment=world.segments.find(s=>s.s===landmark.side&&s.slot===landmark.slot+offset);
      if(segment.fence.visible||segment.tree.visible||segment.furniture.visible)throw Error('El predio del polideportivo queda tapado');
     }
    }
   }
   if(world.avenueMaterials.size>AVENUE_PROFILES.length||world.windowDetails.size+world.landmarkDetails.size>AVENUE_PROFILES.length+LANDMARKS.length||world.streetSignMaterials.size!==4)throw Error('Los recursos crecen por vuelta');
   if(world.buildings.length!==32||game.scene.children.length!==children)throw Error('Se acumulan objetos al reciclar');
   world.update(0,ROUTE_LENGTH*2+LOT_LENGTH*20);game.reset();game.update(0);
   if(snapshot()!==original)throw Error('Reiniciar no regresa a la costa');
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   return {buildings:world.buildings.length,facades:world.avenueMaterials.size,signs:world.streetSignMaterials.size};
  });
  await mkdir('test-results',{recursive:true});
  for(const [name,distance] of [['costa',0],['textiles',720],['polideportivo',1704],['san-juan',1944]]){
   await page.evaluate(async distance=>{
    const g=window.avenueDemo;g.distance=distance;g.nextSpawn=Infinity;g.update(0);
    const {routeState}=await import('./avenue-route.js'),route=routeState(distance);
    document.querySelector('#route-zone').textContent=`${route.zone} · Vuelta ${route.lap}`;
   },distance);
   await page.screenshot({path:`test-results/jb-justo-${name}.png`,timeout:60000});
  }
  await page.evaluate(()=>{
   const g=window.avenueDemo;g.distance=1680;g.update(0);
   document.querySelector('#route-zone').textContent='Hacia San Juan · Vuelta 1';
   g.camera.position.set(6,15,26);g.camera.lookAt(-31,9,-40);g.renderer.render(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/jb-justo-polideportivo-detalle.png',timeout:60000});
  assert.equal(stats.buildings,32);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('D entra en debug aunque la cámara espere el cuerpo completo', {timeout:120000}, async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/pose.js',route=>route.fulfill({contentType:'text/javascript',body:`
  export class PoseController {
   constructor(video,canvas,handlers){this.handlers=handlers;this.running=true;}
   async start(){this.handlers.onCalibrating();setInterval(()=>{this.handlers.onLost();this.handlers.onLane(-1);},100);}
  }
 `}));
 try{
  await page.goto(env.url);
  await page.locator('#settingsBtn').click();await page.locator('#camBtn').click();
  await page.locator('#settings-dialog [data-close]').click();await page.locator('#playBtn').click();
  await page.waitForFunction(()=>document.querySelector('#pause-title').textContent.includes('Calibrando'));
  await page.keyboard.press('KeyD');
  await page.waitForFunction(()=>Number(document.querySelector('#score').textContent)>0);
  assert.equal(await page.locator('#pause').evaluate(el=>el.classList.contains('hidden')),true);
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');
  assert.match(await page.locator('#route-zone').innerText(),/De los Trabajadores.*Vuelta 1/);
  for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:720});
   const readable=await page.evaluate(()=>{
    const route=document.querySelector('#route-label').getBoundingClientRect();
    const quality=document.querySelector('#quality-control').getBoundingClientRect();
    return route.left>=0&&route.right<=innerWidth&&route.top>=quality.bottom;
   });
   assert.equal(readable,true,`Cartel de recorrido superpuesto en ${width}px`);
  }
 }finally{await page.close();}
});

test('la aplicación carga sin CDN y responde a teclado y calidad',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**',route=>{external.push(route.request().url());return route.abort();});
 try{
  await page.goto(env.url);
  await page.locator('#settingsBtn').click();
  await page.selectOption('#quality','balanced');
  await page.locator('#settings-dialog [data-close]').click();
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>Number(document.querySelector('#score').textContent)>0,{timeout:60000});
  assert.equal(await page.locator('#overlay').evaluate(el=>el.classList.contains('hidden')),true);
  await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#pause').evaluate(el=>el.classList.contains('hidden')),false);
  const pausedScore=await page.locator('#score').innerText();await page.waitForTimeout(700);
  assert.equal(await page.locator('#score').innerText(),pausedScore);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>document.querySelector('#pause').classList.contains('hidden'));
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#quality').inputValue(),'balanced');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/realism.png',timeout:60000});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await page.close();}
});

test('escala humana, animación, física, colisiones y calidad automática',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));const runner=await game.characterReady;
   if(!runner)throw Error('No cargó el modelo');
   let skins=0;runner.model.traverse(object=>{if(object.isSkinnedMesh)skins++;});
   const height=new THREE.Box3().setFromObject(runner.model).getSize(new THREE.Vector3()).y;
   if(height<1.8||height>2.3)throw Error(`Escala incorrecta: ${height}`);
   if(game.player.visible)throw Error('Sigue visible el personaje provisional');
   // Verificar el encuadre de los tres carriles y el cuerpo completo al saltar.
   const originalSize=[innerWidth,innerHeight];
   const checkFraming=()=>{
    game.camera.updateMatrixWorld(true);
    for(const lane of [-2.2,0,2.2])for(const y of [game.y,game.y+2.1]){
     const projected=new THREE.Vector3(lane,y,0).project(game.camera);
     if(Math.abs(projected.x)>1||Math.abs(projected.y)>1)throw Error('El personaje sale del encuadre');
    }
    if(game.camera.position.z<=game.characterAnchor.position.z)throw Error('La cámara no está detrás');
   };
   // Separar las pruebas de simulación del coste de dibujar cientos de cuadros.
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   game.start();game.nextSpawn=Infinity;
   for(const aspect of [16/9,9/16]){
    game.camera.aspect=aspect;game.camera.updateProjectionMatrix();
    for(const height of [0,2.23]){game.y=height;game.vy=0;game.update(0);checkFraming();}
   }
   game.y=0;game.camera.aspect=originalSize[0]/originalSize[1];game.camera.updateProjectionMatrix();
   game.right();game.update(1/60);if(game.x<=0)throw Error('Carril');
   const before=runner.model.getObjectByName('mixamorigLeftUpLeg').quaternion.clone();
   for(let i=0;i<15;i++)game.update(1/60);
   if(before.angleTo(runner.model.getObjectByName('mixamorigLeftUpLeg').quaternion)<0.001)throw Error('Animación inmóvil');
   game.jump();game.update(1/60);if(game.y<=0)throw Error('Salto');
   for(let i=0;i<100;i++)game.update(1/60);
   game.roll();game.update(1/60);if(game.rollTimer<=0)throw Error('Rodada');
   for(let i=0;i<65;i++)game.update(1/60);
   if(game.score<=0)throw Error('Puntuación');
   game.setQuality('high');const far=game.world.viewDistance;
   if(game.sun.shadow.mapSize.x!==2048||game.renderer.shadowMap.type!==THREE.PCFSoftShadowMap)throw Error('Sombras de alta calidad');
   game.sun.shadow.camera.updateMatrixWorld(true);
   for(const z of [20,-far-5]){
    const shadowPoint=new THREE.Vector3(0,0,z).project(game.sun.shadow.camera);
    if(Math.abs(shadowPoint.x)>1)throw Error(`La sombra no cubre edificios visibles en z=${z}`);
   }
   if(Math.abs(game.sun.target.position.z+far/2)>.001)throw Error('La zona de sombras no acompaña al recorrido');
   game.setQuality('balanced');
   if(game.world.viewDistance>=far||game.sun.shadow.mapSize.x!==1024)throw Error('Calidad equilibrada');
   game.setQuality('auto');for(let i=0;i<400;i++)game.adaptQuality(0.04);
   if(Math.abs(game.pixelRatio-0.55)>0.001||game.sun.castShadow)throw Error('Calidad automática');
   game.addObstacle('high',game.lane,0);game.update(1/60);if(game.state!=='over')throw Error('Colisión');
   game.start();if(game.state!=='playing'||game.obstacles.length)throw Error('Reinicio');
   game.renderer.render=render;game.update(1/60);
   game.renderer.dispose();
   return {skins,height};
  });
  assert.ok(result.skins>=2);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('el mapa de sombras acompaña el alcance visible y se redimensiona con la calidad',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));await game.characterReady;
   game.setQuality('high');game.update(0);
   if(game.sun.shadow.map?.width!==2048||game.sun.shadow.map?.height!==2048)
    throw Error('El mapa real de sombras no usa resolución alta');
   const far=game.world.viewDistance,shadowCamera=game.sun.shadow.camera;
   for(const z of [20,-far-5]){
    const point=new THREE.Vector3(0,0,z).project(shadowCamera);
    if(Math.abs(point.x)>1)throw Error(`El área de sombras no cubre el tramo visible z=${z}`);
   }
   if(Math.abs(game.sun.target.position.z+far/2)>.001)throw Error('El objetivo de sombras no acompaña los edificios');
   game.setQuality('balanced');game.update(0);
   if(game.sun.shadow.map?.width!==1024||game.sun.shadow.map?.height!==1024)
    throw Error('El mapa de sombras no se redimensiona al bajar la calidad');
   game.renderer.dispose();
  });
 }finally{await page.close();}
});

test('un fallo del modelo conserva el juego y muestra un aviso',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:640,height:360}});
 try{
  await page.route('**/technical-student.glb',route=>route.abort());
  await page.goto(env.url);
  await page.waitForFunction(()=>document.querySelector('#subtitle').textContent.includes('No se pudo cargar'),{timeout:60000});
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>Number(document.querySelector('#score').textContent)>0,{timeout:60000});
 }finally{await page.close();}
});

test('se conservan profesor, perro, rampas, jetpack y pausa de main',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));await Promise.all([game.characterReady,game.officerReady]);
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   game.start();game.update(1/60);
   if(!(game.officerAnchor.visible||game.guard.root.visible)||!game.dog.root.visible)throw Error('Falta la persecución inicial');
   game.pause();const saved=[game.x,game.y,game.distance,game.flyTimer];game.update(1/60);
   if(game.state!=='paused'||JSON.stringify(saved)!==JSON.stringify([game.x,game.y,game.distance,game.flyTimer]))throw Error('La pausa no congela la partida');
   game.resume();if(game.state!=='playing')throw Error('No reanuda');
   game.stumble();if(!game.danger||game.state!=='playing')throw Error('Primer tropiezo');
   game.stumble();if(game.state!=='over'||game.caughtReason!=='caught')throw Error('El profesor no atrapa');
   game.start();
   const random=Math.random;
   try{Math.random=()=>0.1;game.addObstacle('train',1,-8);}finally{Math.random=random;}
   const train=game.obstacles.find(obstacle=>obstacle.type==='train');
   if(!train?.ramp)throw Error('Falta la rampa');
   train.mesh.position.z=-6;game.x=0;game.y=2.75;game.vy=0;
   game.updatePhysics(1/60,0);if(!game.grounded||Math.abs(game.y-2.75)>0.001)throw Error('No pisa la rampa');
   train.mesh.position.z=-4;game.updatePhysics(1/60,0);
   if(!game.grounded||Math.abs(game.y-3.3)>0.001)throw Error('No pisa el techo');
   game.update(0);game.camera.updateMatrixWorld(true);
   const top=new THREE.Vector3(game.x,game.y+2.1,0).project(game.camera);
   if(Math.abs(top.y)>1)throw Error('Cámara pierde al jugador sobre el tren');
   game.reset();game.start();game.startJetpack();
   if(!game.jetpack.visible||game.jetpack.parent!==game.characterAnchor)throw Error('El jetpack no acompaña al personaje nuevo');
   game.updatePhysics(0.05,0);if(game.y<=0||game.flyTimer<=0)throw Error('No vuela');
   game.y=9;game.update(0);game.camera.updateMatrixWorld(true);
   const flying=new THREE.Vector3(game.x,game.y+2.1,0).project(game.camera);
   if(Math.abs(flying.y)>1)throw Error('Cámara pierde al jugador volando');
   game.pause();const timer=game.flyTimer;game.update(0.05);if(game.flyTimer!==timer)throw Error('Jetpack consume tiempo en pausa');
   game.resume();game.updatePhysics(7,0);if(game.flyTimer!==0||game.jetpack.visible)throw Error('Jetpack no termina');
   game.renderer.render=render;game.update(1/60);game.renderer.dispose();
  });
 }finally{await page.close();}
});

test('profesor esquelético independiente y monedas metálicas instanciadas',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const game=new Game(document.querySelector('#game'));
   const [runner,officer]=await Promise.all([game.characterReady,game.officerReady]);
   if(!officer)throw Error('Falta el profesor detallado');
   const runnerLeg=runner.model.getObjectByName('mixamorigLeftUpLeg');
   const officerLeg=officer.model.getObjectByName('mixamorigLeftUpLeg');
   if(runnerLeg===officerLeg)throw Error('El profesor comparte huesos con el jugador');
   const previous=runnerLeg.quaternion.clone();
   officer.update(.25,{running:true,airborne:false,rolling:false,speed:14});
   if(previous.angleTo(runnerLeg.quaternion)>0.000001)throw Error('Animar el profesor mueve al jugador');
   let teacherMaterials=0;officer.model.traverse(object=>{
    for(const material of [object.material].flat())if(material?.name==='EstangaSweater')teacherMaterials++;
   });
   if(teacherMaterials!==1)throw Error('Falta el suéter de Estanga');
   game.start();game.update(1/60);
   if(!game.officerAnchor.visible||game.guard.root.visible)throw Error('No reemplaza al profesor provisional');
   game.guardZ=16;game.chase=0;game.updateGuard(0);
   if(game.officerAnchor.visible||game.dog.root.visible)throw Error('El perseguidor no se retira');
   game.reset();game.start();
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   for(let i=0;i<300;i++)game.addCoin(i%3,-4-i*2);
   game.syncCoins();
   if(game.coinInstances.count+game.coinFarInstances.count!==300||game.coinInstances.instanceMatrix.count<300)throw Error('Fallo al ampliar las instancias de monedas');
   if(game.A.coinMat.metalness!==1||game.A.coinMat.emissive.getHex()!==0||!game.A.coinMat.envMap)throw Error('Material de la moneda incorrecto');
   if(game.A.coinGeo.attributes.position.count<1000)throw Error('Falta relieve geométrico en la moneda');
   game.reset();game.start();game.nextSpawn=Infinity;game.addCoin(1,0);game.update(0);
   if(game.coinCount!==1||game.coinInstances.count+game.coinFarInstances.count!==0)throw Error('La recogida no actualiza monedas');
   game.reset();if(game.coinInstances.count+game.coinFarInstances.count!==0||game.coinCount!==0)throw Error('Reinicio conserva monedas viejas');
   document.querySelector('#overlay').classList.add('hidden');
   game.start();game.addCoin(1,-4);game.addCoin(0,-5);game.addCoin(2,-5);
   game.renderer.render=render;game.update(1/60);
   window.assetGame=game;
   return {teacherMaterials,coinVertices:game.A.coinGeo.attributes.position.count};
  });
  await page.screenshot({path:'test-results/school-assets.png',timeout:60000});
  assert.equal(result.teacherMaterials,1);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('agachado sostenido sin giros, colisión coherente y pausa sin consumir objetos',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   const T=await import('three'),{Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));await Promise.all([game.characterReady,game.officerReady]);
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   game.start();game.nextSpawn=Infinity;
   for(let i=0;i<40;i++)game.update(1/60);
   game.roll();
   const stable=[];
   for(let i=0;i<300;i++){
    if(i%3===0)game.holdRoll();
    if(i%45===0)game.roll(); // repetición de tecla mientras ya está agachado
    game.update(1/60);
    if(game.runner.model.rotation.x!==0)throw Error('El cuerpo vuelve a girar');
    if(i>120)stable.push(game.runner.bones.Head.getWorldPosition(new T.Vector3()).y);
   }
   if(Math.max(...stable)-Math.min(...stable)>.03)throw Error('El agachado sostenido salta de postura');
   game.runner.model.updateMatrixWorld(true);
   game.runner.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
   const bounds=new T.Box3().setFromObject(game.runner.model);
   if(bounds.min.y<-.05||bounds.max.y>1.3)throw Error(`Agachado fuera de límites: ${bounds.min.y},${bounds.max.y}`);
   if(game.playerHeight<bounds.max.y)throw Error('La colisión es menor que la postura visible');
   game.addObstacle('high',1,0);game.update(1/60);
   if(game.state!=='playing')throw Error('El agachado no pasa bajo la barra');
   game.releaseRoll();for(let i=0;i<45;i++)game.update(1/60);
   if(game.runner.poseState.crouch>.02||game.playerHeight<2)throw Error('No se levanta al soltar');
   game.addCoin(1,0);game.addJetpackPickup(1,0);game.pause();
   const saved={pose:JSON.stringify(game.runner.poseState),head:game.runner.bones.Head.quaternion.toArray(),camera:game.camera.position.toArray(),coins:game.coins.length,pickups:game.pickups.length};
   for(let i=0;i<120;i++)game.update(1/30);
   if(JSON.stringify(game.runner.poseState)!==saved.pose||JSON.stringify(game.camera.position.toArray())!==JSON.stringify(saved.camera))throw Error('La animación o cámara continúa en pausa');
   if(game.coins.length!==saved.coins||game.pickups.length!==saved.pickups)throw Error('Se consumen objetos durante la pausa');
   game.renderer.render=render;game.update(0);
   game.renderer.dispose();return {crouchHeight:bounds.max.y,ground:bounds.min.y};
  });
  assert.ok(result.crouchHeight<1.3);assert.ok(result.ground>=-.05);
 }finally{await page.close();}
});

test('salto repetible a 30, 60 y 120 Hz, caída rápida y reinicio limpios',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const game=new Game(document.querySelector('#game'));await game.characterReady;
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   const peaks=[];
   for(const fps of [30,60,120]){
    game.reset();game.start();game.nextSpawn=Infinity;game.jump();let peak=0,landed=false;
    for(let i=0;i<fps*2;i++){
     game.update(1/fps);peak=Math.max(peak,game.y);
     if(game.runner.model.rotation.x!==0)throw Error('El salto gira el cuerpo');
     if(i>4&&game.grounded){landed=true;break;}
    }
    if(!landed||game.y!==0||game.vy!==0)throw Error('El salto no aterriza limpiamente');
    peaks.push(peak);
   }
   if(Math.max(...peaks)-Math.min(...peaks)>.03)throw Error('El salto depende demasiado de los FPS');
   game.reset();game.start();game.nextSpawn=Infinity;game.jump();for(let i=0;i<10;i++)game.update(1/60);
   game.roll();game.update(1/60);const falling=game.vy;game.roll();
   if(game.vy!==falling)throw Error('Repetir agachado reinicia la caída');
   for(let i=0;i<60;i++){game.holdRoll();game.update(1/60);}
   if(!game.grounded||game.y!==0||game.runner.poseState.crouch<.98)throw Error('No aterriza agachado');
   game.jumpBuffer=.2;game.reset();game.start();game.nextSpawn=Infinity;game.update(1/60);
   if(game.jumpBuffer!==0||game.y!==0||game.runner.poseState.crouch!==0)throw Error('El reinicio hereda un salto o agachado');
   game.renderer.render=render;game.update(0);game.renderer.dispose();return peaks;
  });
  assert.ok(result.every(peak=>peak>2.15&&peak<2.26));
 }finally{await page.close();}
});


test('techo del vagón: bordes, aterrizaje rápido y choque frontal', {timeout:120000}, async()=>{
 const page=await env.browser.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try {
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');
   const g=new Game(document.querySelector('#game'));await g.characterReady;
   g.renderer.render=()=>{};
   const setup=()=>{g.reset();g.start();g.nextSpawn=Infinity;g.addObstacle('train',1,-4);g.obstacles[0].mesh.position.z=-4;};
   setup();
   g.x=1.05;g.y=3.3;g.grounded=true;
   g.updatePhysics(0,0);
   if(g.state!=='playing'||g.y!==3.3||!g.grounded)throw Error('Borde del techo sin apoyo');
   setup();g.y=3.6;g.vy=-20;g.grounded=false;g.updatePhysics(.05,0);
   if(g.state!=='playing'||g.y!==3.3||!g.grounded)throw Error('Aterrizaje atravesó techo');
   setup();const train=g.obstacles[0];train.ramp=6;train.mesh.position.z=-5.3;
   g.y=3.3*(6-2)/6;g.grounded=true;g.updatePhysics(.05,1.7);
   if(g.state!=='playing'||g.y!==3.3)throw Error('Choque al terminar rampa a máxima velocidad');
   setup();g.y=0;g.updatePhysics(.016,0);
   if(g.state==='playing')throw Error('Dejó atravesar el vagón a nivel del suelo');
   g.renderer.dispose();
  });
 } finally {await page.close();}
});

test('brazos de cámara: retarget, independencia, suavizado, pausa y vuelta a carrera',{timeout:120000},async()=>{
 const page=await env.browser.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try {
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));const r=await game.characterReady;
   game.renderer.render=()=>{};game.start();game.nextSpawn=Infinity;
   const arms={LeftArm:[1,0,0],LeftForeArm:[0,1,0],LeftHand:[0,1,0],RightArm:[0,-1,0],RightForeArm:[0,-1,0]};
   const direction=(a,b)=>r.bones[b].getWorldPosition(new THREE.Vector3()).sub(r.bones[a].getWorldPosition(new THREE.Vector3())).normalize();
   for(let i=0;i<120;i++){game.setArmTargets(arms);game.update(1/60);}
   if(direction('LeftArm','LeftForeArm').x<.98)throw Error('Hombro no acompaña brazo extendido');
   if(direction('LeftForeArm','LeftHand').y<.98)throw Error('Codo no acompaña mano levantada');
   if(direction('RightArm','RightForeArm').y>-.98)throw Error('Se confundieron los brazos');
   const before=r.bones.LeftArm.quaternion.clone();
   game.setArmTargets({...arms,LeftArm:[0,1,0]});game.update(1/60);
   const after=r.bones.LeftArm.quaternion.clone();
   if(before.angleTo(after)>1.0)throw Error('Salto brusco de postura');
   game.pause();const frozen=r.bones.LeftArm.quaternion.clone();
   game.setArmTargets({...arms,LeftArm:[-1,0,0]});game.update(.05);
   if(frozen.angleTo(r.bones.LeftArm.quaternion)>1e-7)throw Error('Brazos se movieron durante pausa');
   game.resume();game.setArmTargets(null);
   for(let i=0;i<120;i++)game.update(1/60);
   const returned=r.bones.LeftArm.quaternion.clone();
   r.update(0,{running:true,speed:game.speed});
   if(!Number.isFinite(returned.w)||returned.angleTo(frozen)<.1)throw Error('No volvió a la animación normal');
   game.roll();game.setArmTargets(arms);
   for(let i=0;i<60;i++){game.holdRoll();game.setArmTargets(arms);game.update(1/60);}
   if(r.poseState.crouch<.99||game.playerHeight>1.21)throw Error('Seguimiento interfiere con agachado');
   game.renderer.dispose();
  });
 }finally{await page.close();}
});

test('tablero, banco roto, tres líneas de colectivo y detalle adaptativo',{timeout:120000},async()=>{
 const page=await env.browser.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try {
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));const [r,t]=await Promise.all([game.characterReady,game.officerReady]);
   game.renderer.render=()=>{};
   const triangles=model=>{let n=0;model.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});return n;};
   const high=triangles(r.model);if(high>65536)throw Error(`Presupuesto alto: ${high}`);
   r.setDetail(false);const low=triangles(r.model);if(low>22000||low>=high*.5)throw Error(`LOD no reduce coste: ${low}`);
   r.setDetail(true);if(triangles(r.model)!==high)throw Error('No restaura alta calidad');
   game.start();game.nextSpawn=Infinity;
   if(!game.world.track.getObjectByName('AsphaltRoad')||!game.world.track.getObjectByName('LaneMarkings'))throw Error('Falta calle argentina');
   game.addObstacle('low',1,0);let o=game.obstacles[0];
   if(!o.mesh.getObjectByName('DraftingBoard'))throw Error('Falta tablero');
   const boardBounds=new THREE.Box3().setFromObject(o.mesh);
   if(boardBounds.max.y>o.yMax+.02||boardBounds.max.y<.8)throw Error('Tablero fuera de caja de colisión');
   game.y=1.1;game.vy=0;game.grounded=false;game.updatePhysics(0,0);
   if(game.danger||game.state!=='playing')throw Error('Salto sobre tablero choca');
   game.reset();game.start();game.nextSpawn=Infinity;
   game.roll();for(let i=0;i<40;i++){game.holdRoll();game.update(1/60);}
   game.addObstacle('high',1,0);
   if(!game.obstacles[0].mesh.getObjectByName('BrokenSchoolDesk'))throw Error('Falta banco');
   game.updatePhysics(0,0);
   if(game.state!=='playing')throw Error('Agacharse no pasa bajo el banco');
   game.reset();game.start();game.addObstacle('high',1,0);game.updatePhysics(0,0);
   if(game.state!=='over')throw Error('De pie atraviesa el banco');
   for(let i=0;i<3;i++){
    game.reset();const random=Math.random;try{Math.random=()=>i/3+.02;game.addObstacle('train',1,-10);}finally{Math.random=random;}
    const bus=game.obstacles[0].mesh;
    if(bus.userData.line!==['542','720','563'][i])throw Error('Línea incorrecta');
    if(bus.children.length>8)throw Error('Demasiadas piezas sin fusionar en colectivo');
   }
   game.reset();game.start();game.nextSpawn=Infinity;game.setQuality('balanced');game.update(1/60);
   if(triangles(r.model)>22000||triangles(t.model)>34000)throw Error('Modo equilibrado no usa LOD');
   const geo=game.A.school.board.children[0].geometry;
   game.addObstacle('low',0,-10);game.addObstacle('low',2,-20);
   for(const o of game.obstacles)if(o.mesh.getObjectByName('DraftingBoard').children[0].geometry!==geo)throw Error('Duplica geometría escolar');
   game.renderer.dispose();
  });
 }finally{await page.close();}
});

test('saltar en la rampa no pierde: 72 combinaciones de velocidad, salto y frecuencia', {timeout:120000}, async()=>{
 const page=await env.browser.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try {
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=new Game(document.querySelector('#game'));
   await g.characterReady;g.renderer.render=()=>{};
   let checked=0;
   for(const fps of [20,30,60,120])for(const speed of [14,24,34])for(const jumpAt of [null,.3,1,1.8,2.5,3.3]){
    g.reset();g.start();
    const random=Math.random;try{Math.random=()=>.1;g.addObstacle('train',1,-7);}finally{Math.random=random;}
    const bus=g.obstacles[0];bus.mesh.position.z=-11.05;
    let jumped=false,reachedRoof=false;
    const dt=1/fps;
    for(let i=0;i<fps*3;i++){
     const support=g.surfaceAt(g.x);
     if(jumpAt!==null&&!jumped&&g.grounded&&support.h>=jumpAt){g.jump();jumped=true;}
     bus.mesh.position.z+=speed*dt;g.updatePhysics(dt,speed*dt);
     if(g.state!=='playing')throw Error(`Choque falso: ${fps} FPS, velocidad ${speed}, salto en ${jumpAt}`);
     if(g.y>=3.3&&g.surfaceAt(g.x).h===3.3)reachedRoof=true;
    }
    if(!reachedRoof||(jumpAt!==null&&!jumped))throw Error('La simulación no recorrió el techo');
    checked++;
   }
   if(checked!==72)throw Error('Faltan escenarios');
   // Subirse exige rampa o altura suficiente: saltar desde el suelo contra un
   // colectivo sin rampa sigue chocando, incluso con el salto en su punto alto.
   for(const fps of [20,30,60,120]){
    g.reset();g.start();const random=Math.random;
    try{Math.random=()=>.9;g.addObstacle('train',1,-5);}finally{Math.random=random;}
    const bus=g.obstacles[0];bus.mesh.position.z=-9;g.jump();
    for(let i=0;i<fps&&g.state==='playing';i++){bus.mesh.position.z+=14/fps;g.updatePhysics(1/fps,14/fps);}
    if(g.state!=='over')throw Error('El salto desde el suelo atraviesa una pared');
   }
   g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('cámara acompaña, despeja colectivos y conserva encuadre vertical',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const THREE=await import('three'),{Game}=await import('./game.js');
   const {updateChaseCamera}=await import('./camera-rig.js');
   const g=new Game(document.querySelector('#game'));await g.characterReady;
   g.renderer.render=()=>{};g.start();g.nextSpawn=Infinity;
   g.x=-2.2;g.lane=0;
   const random=Math.random;try{Math.random=()=>.9;g.addObstacle('train',1,0);}finally{Math.random=random;}
   const bus=g.obstacles[0];bus.mesh.position.z=2;
   const original=g.A.trains[2][0];
   for(let i=0;i<120;i++)updateChaseCamera(g,1/60);
   if(g.camera.position.x>-.9||g.camera.position.y<5.4)throw Error('Cámara no acompaña ni se eleva');
   if(!bus.viewMaterials||bus.viewOpacity>.25)throw Error('Colectivo cercano sigue tapando el carril lateral');
   if(original.opacity!==1||original.transparent)throw Error('Atenuación altera materiales compartidos');
   for(const aspect of [16/9,9/16])for(const lane of [0,2])for(const height of [0,3.3]){
    g.x=[-2.2,0,2.2][lane];g.lane=lane;g.y=height;
    g.camera.aspect=aspect;g.camera.updateProjectionMatrix();
    updateChaseCamera(g,0);g.camera.updateMatrixWorld(true);
    for(const x of [-3.1,3.1])for(const y of [height,height+2.1]){
     const p=new THREE.Vector3(x,y,0).project(g.camera);
     if(Math.abs(p.x)>1||Math.abs(p.y)>1)throw Error(`Encuadre incompleto ${aspect}/${lane}/${height}`);
    }
   }
   bus.mesh.position.z=30;for(let i=0;i<120;i++)updateChaseCamera(g,1/60);
   if(bus.viewOpacity!==1)throw Error('Colectivo no recupera opacidad');
   let disposed=0;bus.viewMaterials.forEach(m=>m.addEventListener('dispose',()=>disposed++));
   const count=bus.viewMaterials.length;g.reset();if(disposed!==count)throw Error('No libera materiales de cámara');
   g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('banco verde legible y animaciones con aterrizaje, giro y salto diferenciado',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');const g=new Game(document.querySelector('#game'));const r=await g.characterReady;
   let green=false;g.A.school.desk.traverse(m=>{if(m.material?.name==='SchoolGreen'){green=true;if(m.material.emissive.g<=m.material.emissive.r||!m.material.map)throw Error('Banco pierde color o desgaste');}});
   if(!green)throw Error('Banco sin pintura verde');
   for(let i=0;i<60;i++)r.update(1/60,{running:true,speed:20});
   // Una suela debe tocar el piso durante la carrera sin hundirse.
   for(let i=0;i<40;i++){
    r.setDetail(i<20);
    r.update(1/60,{running:true,speed:20});let min=Infinity;
    r.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&mesh.material?.name==='Shoes'){
     mesh.computeBoundingBox();const box=mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);min=Math.min(min,box.min.y);
    }});
    if(!Number.isFinite(min)||Math.abs(min)>.04)throw Error(`Pies sin apoyo: ${min}`);
   }
   const elbow=r.bones.LeftForeArm.quaternion.clone();
   if(Math.abs(elbow.x)<.25)throw Error('La carrera mantiene codos rígidos');
   r.update(1/60,{running:true,airborne:true,verticalSpeed:10});
   for(let i=0;i<30;i++)r.update(1/60,{running:true,airborne:true,verticalSpeed:0,turn:.6});
   if(r.poseState.tuck<.20||r.model.rotation.y>-.04)throw Error('Salto/giro sin articulación');
   const left=r.bones.LeftUpLeg.quaternion.clone(),right=r.bones.RightUpLeg.quaternion.clone();
   if(left.angleTo(right)<.1)throw Error('Piernas idénticas en salto');
   r.update(1/60,{running:true,airborne:true,verticalSpeed:-10});
   r.update(1/60,{running:true,airborne:false});
   if(r.poseState.landing<.03)throw Error('Sin amortiguación al aterrizar');
   for(let i=0;i<90;i++)r.update(1/60,{running:true});
   if(r.poseState.landing>.001)throw Error('Aterrizaje queda trabado');
   r.reset();if(r.poseState.landing!==0||r.poseState.turn!==0)throw Error('No limpia transiciones');
   g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('carrera con apoyos alternados y cadencia ligada a la velocidad para ambos personajes',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const g=new Game(document.querySelector('#game'));const [student,teacher]=await Promise.all([g.characterReady,g.officerReady]);
   if(!teacher)throw Error('No cargó el profesor para validar su carrera');
   const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};
   for(const actor of [student,teacher]){
    actor.setDetail(false);
    const cadence=speed=>{
     actor.reset();
     for(let i=0;i<90;i++)actor.update(1/60,{running:true,speed});
     return actor.poseState.phase;
    };
    const slow=cadence(14),fast=cadence(34);
    if(fast<slow*1.3)throw Error('La cadencia no responde a la velocidad');
    actor.reset();
    const joints=['LeftUpLeg','RightUpLeg','LeftArm','RightArm','LeftForeArm','RightForeArm'];
    const samples=Object.fromEntries(joints.map(name=>[name,[]]));
    const feet={Left:[],Right:[]};
    for(let i=0;i<120;i++){
     actor.update(1/60,{running:true,speed:22});
     actor.model.updateMatrixWorld(true);
     for(const name of joints)samples[name].push(actor.bones[name].quaternion.clone());
     for(const side of ['Left','Right']){
      const point=actor.bones[`${side}Foot`].getWorldPosition(new THREE.Vector3());
      feet[side].push(actor.model.worldToLocal(point).y);
     }
    }
    for(const name of joints){
     const first=samples[name][0];
     const movement=Math.max(...samples[name].map(rotation=>first.angleTo(rotation)));
     if(movement<(name.includes('ForeArm')?.025:.12))throw Error(`${name} permanece rígido durante la carrera`);
    }
    for(const side of ['Left','Right']){
     const range=Math.max(...feet[side])-Math.min(...feet[side]);
     if(range<.06)throw Error(`El pie ${side} no alterna entre apoyo y recuperación`);
    }
    actor.reset();
    let supported=0,flight=0,peakLift=0;
    for(let i=0;i<180;i++){
     actor.update(1/60,{running:true,speed:34});
     const state=actor.poseState;
     if(state.leftSupport||state.rightSupport){
      supported++;
      if(state.runLift>.001)throw Error('El cuerpo rebota mientras un pie sigue apoyado');
     }else{
      flight++;
      peakLift=Math.max(peakLift,state.runLift);
     }
    }
    // Estanga trota con menos vuelo que el alumno (adulto corpulento), pero lo tiene.
    if(!supported||flight<4||peakLift<(actor===teacher?.018:.04))throw Error('La carrera rápida no distingue apoyo y fase aérea');
   }
   g.renderer.render=render;g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('Estanga reconstruido desde la hoja: cuerpo propio, accesorios y dos niveles animados',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const THREE=await import('three'),{Game}=await import('./game.js');
   const g=new Game(document.querySelector('#game'));const [student,teacher]=await Promise.all([g.characterReady,g.officerReady]);
   if(!teacher)throw Error('No cargó a Estanga');
   const names=[];teacher.model.traverse(o=>{if(o.isMesh)names.push(o.name)});
   for(const expected of ['EstangaSkin','EstangaHair','EstangaBeard','Spectacles','Lenses','Wristwatch','EstangaSweater','EstangaCollar','EstangaJeans','EstangaBoots','EstangaSoles','EstangaLaces'])
    if(!names.includes(expected))throw Error(`Falta ${expected}`);
   if(names.some(name=>/Police/.test(name)))throw Error('La referencia no tiene gorra de policía');
   const studentMeshes=[];student.model.traverse(o=>{if(o.isMesh)studentMeshes.push(o)});
   teacher.model.traverse(o=>{if(o.isMesh&&studentMeshes.some(s=>s.geometry===o.geometry))throw Error('Reutiliza el cuerpo del alumno');});
   const triangles=()=>{let n=0;teacher.model.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});return n;};
   const high=triangles();if(high>90000||high<45000)throw Error(`Presupuesto alto ${high}`);
   const playerHead=student.bones.Head.quaternion.clone();
   for(const detail of [false,true]){
    teacher.setDetail(detail);
    if(!detail&&triangles()>36000)throw Error('LOD demasiado pesado');
    for(let i=0;i<90;i++)teacher.update(1/60,{running:true,speed:24});
    teacher.model.updateMatrixWorld(true);
    teacher.model.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.computeBoundingBox();});
    const box=new THREE.Box3().setFromObject(teacher.model);
    if(!Number.isFinite(box.min.y)||box.min.y<-.05||box.max.y>2.25)throw Error('Postura o tamaño inválido');
   }
   if(playerHead.angleTo(student.bones.Head.quaternion)>1e-7)throw Error('La animación altera al alumno');
   teacher.reset();
   // Reloj en la muñeca izquierda (lado -X del modelo, huesos Right*), como en la hoja.
   const watch=teacher.model.getObjectByName('Wristwatch');watch.skeleton.update();
   const center=new THREE.Vector3();const p=new THREE.Vector3();const n=watch.geometry.attributes.position.count;
   for(let i=0;i<n;i++)center.add(watch.getVertexPosition(i,p));center.divideScalar(n);
   if(center.x>-.1)throw Error('El reloj no está en la muñeca izquierda');
   const before=watch.getVertexPosition(0,new THREE.Vector3());
   teacher.bones.RightForeArm.rotation.x+=.5;teacher.model.updateMatrixWorld(true);
   if(before.distanceTo(watch.getVertexPosition(0,new THREE.Vector3()))<.01)throw Error('El reloj no sigue al antebrazo');
   teacher.reset();const frames=teacher.model.getObjectByName('Spectacles');
   const a=frames.getVertexPosition(0,new THREE.Vector3());
   teacher.bones.Head.rotation.y=.3;teacher.model.updateMatrixWorld(true);
   if(a.distanceTo(frames.getVertexPosition(0,new THREE.Vector3()))<.01)throw Error('Los anteojos no siguen la cabeza');
   g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('si falla el modelo de Estanga sigue disponible el perseguidor de respaldo',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/estanga.glb',r=>r.abort());
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=new Game(document.querySelector('#game'));
   await Promise.all([g.characterReady,g.officerReady]);g.renderer.render=()=>{};g.start();g.nextSpawn=Infinity;g.update(1/60);
   if(g.officer||!g.guard.root.visible||!g.guard.root.getObjectByName('EstangaFallbackHair'))throw Error('No muestra el respaldo de Estanga');
   if(g.state!=='playing')throw Error('El error bloquea la partida');g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('materiales de Estanga: piel proyectada, normales, ojos con alfa, pelo, barba y botas',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=new Game(document.querySelector('#game'));const t=await g.officerReady;
   if(!t)throw Error('No cargó a Estanga texturizado');
   const mats=new Map();t.model.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())mats.set(m.name,m);});
   const skin=mats.get('Skin'),eyes=mats.get('EyeWhite'),hair=mats.get('EstangaHair'),shoes=mats.get('EstangaBoots'),beard=mats.get('EstangaBeard');
   if(!skin?.map||skin.map.image.width!==2048||!skin.normalMap||!skin.roughnessMap)throw Error('Faltan mapas UV/PBR de piel');
   if(skin.map.colorSpace!=='srgb'||skin.normalMap.colorSpace==='srgb')throw Error('Espacios de color incorrectos');
   if(!eyes?.map||eyes.alphaTest<.01||!hair?.map||hair.alphaTest<.1)throw Error('Ojos o pelo pierden sus máscaras alfa');
   const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.drawImage(eyes.map.image,0,0,1024,1024);
   if(ctx.getImageData(950,950,1,1).data[3]!==0)throw Error('La córnea tapa los iris: se perdió el alfa');
   if(!shoes?.map)throw Error('Botas sin textura de nobuk');
   if(!beard?.map||beard.alphaTest<.1)throw Error('Barba sin textura o sin máscara alfa');
   const sweater=mats.get('EstangaSweater');if(!sweater.map||sweater.roughnessMap||sweater.roughness<.85)throw Error('La lana vuelve a verse plástica');
   if(!sweater.bumpMap||sweater.bumpMap.repeat.x<2)throw Error('Falta el relieve de punto del suéter');
   for(const detail of [false,true]){
    t.setDetail(detail);for(let i=0;i<30;i++)t.update(1/60,{running:true,speed:24});
    if(!Number.isFinite(t.model.position.y))throw Error('Animación inválida al cambiar detalle');
   }
   g.renderer.dispose();
  });
 }finally{await page.close();}
});

test('exportación Blender: cuello estable, barba texturizada y esqueletos compatibles entre LOD',{timeout:120000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const THREE=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   const loader=new GLTFLoader();const versions=await Promise.all(['estanga.glb','estanga-low.glb'].map(n=>loader.loadAsync('./assets/characters/'+n)));
   const skeletons=[];
   for(const gltf of versions){
    const collar=gltf.scene.getObjectByName('EstangaCollar');if(!collar?.isSkinnedMesh)throw Error('Cuello sin rig');
    skeletons.push(collar.skeleton.bones.map(b=>b.name).join(','));
    const beard=gltf.scene.getObjectByName('EstangaBeard');if(!beard.material.map||!(beard.material.alphaTest>0))throw Error('Barba sin textura/alfa exportados');
    gltf.scene.updateMatrixWorld(true);collar.skeleton.update();
    const before=collar.getVertexPosition(0,new THREE.Vector3());
    const neckSamples=[];
    gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&o.material?.name==='Skin'){
     o.skeleton.update();const a=o.geometry.attributes.position;
     for(let i=0;i<a.count;i++)if(a.getY(i)>1.50&&a.getY(i)<1.57&&Math.abs(a.getX(i))<.07)
      neckSamples.push([o,i,o.getVertexPosition(i,new THREE.Vector3())]);
    }});
    if(!neckSamples.length)throw Error('Falta la piel del cuello');
    for(const bone of collar.skeleton.bones)if(/(Left|Right)Arm$/.test(bone.name))bone.rotation.z+=.6;
    gltf.scene.updateMatrixWorld(true);collar.skeleton.update();
    const after=collar.getVertexPosition(0,new THREE.Vector3());
    if(before.distanceTo(after)>.0001)throw Error('El hombro arrastra el cuello');
    for(const [mesh,index,position] of neckSamples){mesh.skeleton.update();if(position.distanceTo(mesh.getVertexPosition(index,new THREE.Vector3()))>.0001)throw Error('El brazo arrastra la piel del cuello');}
   }
   if(skeletons[0]!==skeletons[1])throw Error('Los índices de huesos no coinciden al cambiar LOD');
  });
 }finally{await page.close();}
});

test('esqueleto detallado: 52 huesos, dedos y hombros animados en los cinco personajes',{timeout:240000},async()=>{
 const page=await env.browser.newPage();await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);await page.evaluate(async()=>{
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const loader=new GLTFLoader();
   for(const name of ['technical-student','classic-student','hoodie-student','phone-student','estanga']){
    for(const suffix of ['','-low']){
     const gltf=await loader.loadAsync(`./assets/characters/${name}${suffix}.glb`);
     let skeleton;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)skeleton=o.skeleton;});
     const bones=skeleton.bones.map(b=>b.name.replace(/^mixamorig/,''));
     if(bones.length!==52)throw Error(`${name}${suffix}: ${bones.length} huesos`);
     for(const need of ['LeftShoulder','RightShoulder','Spine1','LeftHandThumb3','RightHandPinky3','LeftToeBase'])
      if(!bones.includes(need))throw Error(`${name}${suffix}: falta ${need}`);
     // Reposo identidad: el IK de piernas y las posturas trabajan en ejes del modelo.
     for(const b of skeleton.bones)if(Math.abs(1-Math.abs(b.quaternion.w))>1e-4)throw Error(`${name}: ${b.name} rota en reposo`);
    }
   }
   const THREE=await import('three');const {Game}=await import('./game.js');
   const g=new Game(document.querySelector('#game'));const [r,t]=await Promise.all([g.characterReady,g.officerReady]);
   g.renderer.render=()=>{};
   for(const actor of [r,t]){
    actor.reset();for(let i=0;i<90;i++)actor.update(1/60,{running:true,speed:22});
    const fist=actor.bones.LeftHandIndex2.quaternion.angleTo(new THREE.Quaternion());
    if(fist<.4)throw Error('Los dedos no se cierran al correr');
    let shoulder=0;const start=actor.bones.LeftShoulder.quaternion.clone();
    for(let i=0;i<40;i++){actor.update(1/60,{running:true,speed:22});shoulder=Math.max(shoulder,start.angleTo(actor.bones.LeftShoulder.quaternion));}
    if(shoulder<.03)throw Error('El hombro no acompaña el braceo');
   }
   r.reset();for(let i=0;i<30;i++)r.update(1/60,{running:true,airborne:true,verticalSpeed:4});
   if(r.bones.LeftHandIndex2.quaternion.angleTo(new THREE.Quaternion())>.4)throw Error('Mano cerrada en el salto');
   g.renderer.dispose();
  });
 }finally{await page.close();}
});
