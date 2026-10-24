const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
(async()=>{
 const env=await harness();
 try{
  await mkdir('test-results',{recursive:true});const page=await env.browser.newPage({viewport:{width:900,height:900}});
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=window.demo=new Game(document.querySelector('#game'));
   await Promise.all([g.characterReady,g.officerReady]);g.setQuality('high');
   window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};g.update(0);
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   g.characterAnchor.visible=g.rig.root.visible=g.guard.root.visible=g.dog.root.visible=false;
   g.officerAnchor.visible=true;g.officerAnchor.position.set(0,0,0);g.officer.setDetail(true);
   for(let i=0;i<60;i++)g.officer.update(1/60,{});
   g.camera.position.set(.1,1.35,-3.1);g.camera.lookAt(0,1.05,0);window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/professor-reference-full.png',timeout:60000});
  await page.evaluate(()=>{const g=window.demo;g.camera.position.set(.05,1.84,-.90);g.camera.lookAt(0,1.80,0);window.draw(g.scene,g.camera);});
  await page.screenshot({path:'test-results/professor-reference-face.png',timeout:60000});
  await page.evaluate(()=>{const g=window.demo;g.camera.position.set(-1.10,1.83,-.2);g.camera.lookAt(0,1.78,0);window.draw(g.scene,g.camera);});
  await page.screenshot({path:'test-results/professor-reference-profile.png',timeout:60000});
  await page.evaluate(()=>{const g=window.demo;g.officer.setDetail(false);for(let i=0;i<30;i++)g.officer.update(1/60,{running:true,speed:24});g.camera.position.set(1.6,1.45,-2.8);g.camera.lookAt(0,1.05,0);window.draw(g.scene,g.camera);});
  await page.screenshot({path:'test-results/professor-reference-running-low.png',timeout:60000});
  console.log('Profesor: cuerpo, rostro, perfil y carrera en detalle bajo.');
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
