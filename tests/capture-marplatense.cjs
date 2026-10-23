const {harness}=require('./harness.cjs');
const {mkdir,writeFile}=require('node:fs/promises');
(async()=>{
 const env=await harness();
 try {
  await mkdir('test-results',{recursive:true});
  const page=await env.browser.newPage({viewport:{width:1120,height:720}});
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=window.demo=new Game(document.querySelector('#game'));
   await Promise.all([g.characterReady,g.officerReady]);
   g.setQuality('high');window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};
   g.update(0);document.querySelector('#overlay').classList.add('hidden');
   document.querySelector('#cam').style.display='none';
   g.characterAnchor.visible=g.officerAnchor.visible=g.dog.root.visible=g.rig.root.visible=g.guard.root.visible=false;
   const random=Math.random,materials=g.A.trains,lines=g.A.busLines;
   try{Math.random=()=>.9;for(let i=0;i<3;i++){g.A.trains=[materials[i]];g.A.busLines=[lines[i]];g.addObstacle('train',i,-13-i*3);}}
   finally{Math.random=random;g.A.trains=materials;g.A.busLines=lines;}
   g.camera.position.set(3.3,4.5,3);g.camera.lookAt(0,1.6,-12);window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/colectivos-mdp.png',timeout:60000});
  await page.evaluate(()=>{
   const g=window.demo;g.reset();g.addObstacle('low',0,-5);g.addObstacle('high',2,-5);
   g.characterAnchor.visible=g.officerAnchor.visible=g.dog.root.visible=g.rig.root.visible=g.guard.root.visible=false;
   g.camera.position.set(3,3.1,2.4);g.camera.lookAt(0,.9,-5);window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/obstaculos-escuela.png',timeout:60000});
  await page.evaluate(()=>{
   const g=window.demo;g.reset();g.update(0);g.officerAnchor.visible=g.dog.root.visible=false;
   g.camera.position.set(.5,1.5,-3.3);g.camera.lookAt(0,1.35,0);window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/alumno-detalle.png',timeout:60000});
  await page.evaluate(()=>{
   const g=window.demo;g.characterAnchor.visible=false;g.officerAnchor.visible=true;g.officerAnchor.position.set(0,0,0);
   g.officer.setDetail(true);g.officer.update(.1,{});window.draw(g.scene,g.camera);
  });
  await page.screenshot({path:'test-results/profesor-detalle.png',timeout:60000});
  const graffiti=await page.evaluate(async()=>{
   const T=await import('./textures.js');const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=960;
   const ctx=canvas.getContext('2d');['aldosivi','alvarado','spot','mdp'].forEach((theme,i)=>ctx.drawImage(T.graffitiWall(theme).image,0,i*240));
   return canvas.toDataURL('image/png').split(',')[1];
  });
  await writeFile('test-results/grafitis-mdp.png',Buffer.from(graffiti,'base64'));
  console.log('Capturas: colectivos, obstáculos, alumno, profesor y grafitis.');
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
