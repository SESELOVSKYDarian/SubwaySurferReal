const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
(async()=>{
 const env=await harness();
 try{
  await mkdir('test-results',{recursive:true});
  const page=await env.browser.newPage({viewport:{width:1120,height:720}});
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const game=window.captureGame=new Game(document.querySelector('#game'));
   await Promise.all([game.characterReady,game.officerReady]);
   window.captureRender=game.renderer.render.bind(game.renderer);game.renderer.render=()=>{};
   game.start();game.nextSpawn=Infinity;
   for(let i=0;i<50;i++)game.update(1/60);
   document.querySelector('#overlay').classList.add('hidden');
   window.captureRender(game.scene,game.camera);
  });
  await page.screenshot({path:'test-results/student-run.png',timeout:60000});
  await page.evaluate(()=>{
   const game=window.captureGame;game.roll();
   for(let i=0;i<90;i++){game.holdRoll();game.update(1/60);}
   window.captureRender(game.scene,game.camera);
  });
  await page.screenshot({path:'test-results/student-crouch.png',timeout:60000});
  await page.evaluate(()=>{
   const game=window.captureGame;game.releaseRoll();for(let i=0;i<45;i++)game.update(1/60);
   game.jump();for(let i=0;i<18;i++)game.update(1/60);
   window.captureRender(game.scene,game.camera);
  });
  await page.screenshot({path:'test-results/student-jump.png',timeout:60000});
  await page.evaluate(()=>{
   const game=window.captureGame;game.reset();game.update(0);
   game.officerAnchor.visible=game.guard.root.visible=game.dog.root.visible=false;
   game.camera.position.set(.45,1.3,-3.4);game.camera.lookAt(0,1.25,0);
   window.captureRender(game.scene,game.camera);
  });
  await page.screenshot({path:'test-results/student-front.png',timeout:60000});
  console.log('Capturas: carrera, agachado, salto y frente del guardapolvo en test-results/.');
 }finally{await env.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
