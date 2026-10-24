const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
(async()=>{
 const env=await harness();
 try{
  await mkdir('test-results',{recursive:true});
  const page=await env.browser.newPage({viewport:{width:1120,height:720}});
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const {updateChaseCamera}=await import('./camera-rig.js');
   const g=window.demo=new Game(document.querySelector('#game'));await Promise.all([g.characterReady,g.officerReady]);
   window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};window.follow=updateChaseCamera;
   g.setQuality('high');g.start();g.nextSpawn=Infinity;g.lane=0;g.x=-2.2;
   for(let i=0;i<60;i++)g.update(1/60);
   const random=Math.random;try{Math.random=()=>.9;g.addObstacle('train',1,0);}finally{Math.random=random;}
   g.obstacles[0].mesh.position.z=2;g.addObstacle('high',2,-9);
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   // Mismo escenario con el encuadre anterior para comparar el bloqueo.
   g.camera.position.set(g.x*.12,3.1,6.4);g.camera.lookAt(g.x*.12,1.35,-14);window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/camera-before.png',timeout:60000});
  await page.evaluate(()=>{window.follow(window.demo,0);window.draw(window.demo.scene,window.demo.camera);});
  await page.screenshot({path:'test-results/camera-clear.png',timeout:60000});
  await page.setViewportSize({width:420,height:780});
  await page.evaluate(()=>{window.follow(window.demo,0);window.draw(window.demo.scene,window.demo.camera);});
  await page.screenshot({path:'test-results/camera-mobile.png',timeout:60000});
  await page.setViewportSize({width:960,height:640});
  await page.evaluate(()=>{
   const g=window.demo;g.reset();g.setQuality('high');g.x=0;g.y=0;g.update(0);
   g.officerAnchor.visible=g.guard.root.visible=g.dog.root.visible=false;
   g.camera.position.set(2.4,1.65,2.9);g.camera.lookAt(0,1.05,0);
   g.runner.reset();for(let i=0;i<45;i++)g.runner.update(1/60,{running:true,speed:20});
   window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/animation-run.png',timeout:60000});
  await page.evaluate(()=>{const g=window.demo;for(let i=0;i<25;i++)g.runner.update(1/60,{running:true,airborne:true,verticalSpeed:0});window.draw(g.scene,g.camera);});
  await page.screenshot({path:'test-results/animation-jump.png',timeout:60000});
  await page.evaluate(()=>{const g=window.demo;g.runner.reset();for(let i=0;i<90;i++)g.runner.update(1/60,{running:true,rolling:true});window.draw(g.scene,g.camera);});
  await page.screenshot({path:'test-results/animation-crouch.png',timeout:60000});
  console.log('Capturas de cámara antes/después, vertical y posturas guardadas.');
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
