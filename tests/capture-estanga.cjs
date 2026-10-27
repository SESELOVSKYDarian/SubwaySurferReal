const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
// Capturas de revisión de Estanga dentro del juego: cuerpo entero (frente,
// perfil, espalda), rostro, reposo con manos en los bolsillos, carrera en
// hoja de contactos y agarre. Se comparan a ojo con la hoja de referencia.
(async()=>{
 const env=await harness();
 try{
  await mkdir('test-results/estanga',{recursive:true});
  const page=await env.browser.newPage({viewport:{width:720,height:900}});
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=window.demo=new Game(document.querySelector('#game'));
   await Promise.all([g.characterReady,g.officerReady]);g.setQuality('high');
   window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};g.update(0);
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   g.characterAnchor.visible=g.rig.root.visible=g.guard.root.visible=g.dog.root.visible=false;
   g.officerAnchor.visible=true;g.officerAnchor.position.set(0,0,0);g.officer.setDetail(true);
   window.shot=(x,y,z,tx,ty,tz)=>{g.camera.position.set(x,y,z);g.camera.lookAt(tx,ty,tz);window.draw(g.scene,g.camera);};
   window.pose=(n,opts)=>{for(let i=0;i<n;i++)g.officer.update(1/60,opts);};
   window.pose(90,{});
  });
  const views=[['front',0,1.1,-3.6,0,1.02,0],['side',-3.6,1.1,0,0,1.02,0],['back',0,1.1,3.6,0,1.02,0],['three-quarter',-2.3,1.3,-2.6,0,1.02,0],
   ['face',0,1.86,-.85,0,1.86,0],['face-side',-.85,1.86,0,0,1.86,0]];
  for(const [name,...v] of views){
   await page.evaluate(v=>window.shot(...v),v);
   await page.screenshot({path:`test-results/estanga/${name}.png`,timeout:240000});
  }
  for(let k=0;k<8;k++){
   await page.evaluate(k=>{window.pose(k?4:60,{running:true,speed:22});window.shot(-3.4,1.1,-.3,0,1.0,0);},k);
   await page.screenshot({path:`test-results/estanga/run-${k}.png`,timeout:240000});
  }
  await page.evaluate(()=>{window.pose(40,{grabbing:true});window.shot(-2.4,1.3,-2.4,0,1.1,0);});
  await page.screenshot({path:'test-results/estanga/grab.png',timeout:240000});
  await page.evaluate(()=>{const g=window.demo;g.officer.setDetail(false);window.pose(40,{running:true,speed:22});window.shot(1.8,1.3,-2.6,0,1.0,0);});
  await page.screenshot({path:'test-results/estanga/running-low.png',timeout:240000});
  console.log('Estanga: vistas, rostro, carrera, agarre y detalle bajo en test-results/estanga/');
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
