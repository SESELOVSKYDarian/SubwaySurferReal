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
  assert.equal(await page.locator('#pause').evaluate(el=>el.classList.contains('hidden')),true);
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
   game.start();
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
  assert.equal(result.skins,2);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('un fallo del modelo conserva el juego y muestra un aviso',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:640,height:360}});
 try{
  await page.route('**/runner.glb',route=>route.abort());
  await page.goto(env.url);
  await page.waitForFunction(()=>document.querySelector('#subtitle').textContent.includes('No se pudo cargar'),{timeout:60000});
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>Number(document.querySelector('#score').textContent)>0,{timeout:60000});
 }finally{await page.close();}
});

test('se conservan guardia, perro, rampas, jetpack y pausa de main',{timeout:120000},async()=>{
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const THREE=await import('three');const {Game}=await import('./game.js');
   const game=new Game(document.querySelector('#game'));await game.characterReady;
   const render=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   game.start();game.update(1/60);
   if(!game.guard.root.visible||!game.dog.root.visible)throw Error('Falta la persecución inicial');
   game.pause();const saved=[game.x,game.y,game.distance,game.flyTimer];game.update(1/60);
   if(game.state!=='paused'||JSON.stringify(saved)!==JSON.stringify([game.x,game.y,game.distance,game.flyTimer]))throw Error('La pausa no congela la partida');
   game.resume();if(game.state!=='playing')throw Error('No reanuda');
   game.stumble();if(!game.danger||game.state!=='playing')throw Error('Primer tropiezo');
   game.stumble();if(game.state!=='over'||game.caughtReason!=='caught')throw Error('El guardia no atrapa');
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
