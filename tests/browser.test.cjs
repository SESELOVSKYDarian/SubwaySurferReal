const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdir}=require('node:fs/promises');
const {harness}=require('./harness.cjs');
let env;
before(async()=>{env=await harness();});
after(async()=>{if(env)await env.close();});

test('la aplicación carga sin CDN y responde a teclado y calidad',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**',route=>{external.push(route.request().url());return route.abort();});
 try{
  await page.goto(env.url);
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
  await page.selectOption('#quality','balanced');
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
   game.setQuality('balanced');if(game.world.viewDistance>=far)throw Error('Calidad fija');
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
    for(const material of [object.material].flat())if(material?.name==='TeacherCoat')teacherMaterials++;
   });
   if(teacherMaterials!==1)throw Error('Falta el uniforme');
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
   const high=triangles(r.model);if(high<60000||high>65536)throw Error(`Presupuesto alto: ${high}`);
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
   if(triangles(r.model)>22000||triangles(t.model)>22000)throw Error('Modo equilibrado no usa LOD');
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
