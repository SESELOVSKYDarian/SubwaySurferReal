const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
// Capturas del escenario (sin personajes): vista de juego con colectivos,
// vereda y fachadas de cada lado, colectivos de cerca y vista general.
// Uso: node tests/capture-map.cjs [carpeta]   (por defecto test-results/map)
const dir=process.argv[2]||'test-results/map';
(async()=>{
 const env=await harness();
 try{
  await mkdir(dir,{recursive:true});
  const page=await env.browser.newPage({viewport:{width:1280,height:720}});
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(env.url,{timeout:240000});
  await page.evaluate(async()=>{
   const {Game}=await import('./game.js');const g=window.demo=new Game(document.querySelector('#game'));
   await Promise.all([g.characterReady,g.officerReady]);g.setQuality('high');
   window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   g.characterAnchor.visible=g.officerAnchor.visible=g.dog.root.visible=g.rig.root.visible=g.guard.root.visible=false;
   const random=Math.random,materials=g.A.trains,lines=g.A.busLines;
   try{for(let i=0;i<3;i++){Math.random=()=>i===1?.2:.9;g.A.trains=[materials[i]];g.A.busLines=[lines[i]];g.addObstacle('train',i,-14-i*9);}}
   finally{Math.random=random;g.A.trains=materials;g.A.busLines=lines;}
   g.world.update(0,240);
   window.shot=(x,y,z,tx,ty,tz,fov=54)=>{g.camera.fov=fov;g.camera.updateProjectionMatrix();g.camera.position.set(x,y,z);g.camera.lookAt(tx,ty,tz);window.draw(g.scene,g.camera);};
  });
  const shots=[
   ['juego',0,4.2,7.8,0,1.15,-12],
   ['juego-alto',0,5.5,7.8,0,1.6,-12],
   ['colectivo-tres-cuartos',4.6,2.4,-4,0,1.6,-16],
   ['colectivo-frente',1.2,1.7,-2,-.2,1.6,-14],
   ['vereda-izquierda',-3.2,2.2,-4,-9,4.2,-26],
   ['vereda-derecha',3.2,2.2,-4,9,4.2,-26],
   ['fachadas-izquierda',2,6,-30,-12,6,-48,62],
   ['general',0,16,12,0,2,-60,60],
  ];
  const stats={};
  for(const [name,...v] of shots){
   stats[name]=await page.evaluate(v=>{window.shot(...v);const r=window.demo.renderer.info.render;return {llamadas:r.calls,triangulos:r.triangles};},v);
   await page.screenshot({path:`${dir}/${name}.png`,timeout:240000});
  }
  console.log('Escenario →',dir);
  console.log(JSON.stringify({juego:stats.juego,general:stats.general}));
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
