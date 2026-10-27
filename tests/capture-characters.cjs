const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
// Capturas de revisión de los personajes jugables con el esqueleto detallado:
// reposo, carrera cuadro a cuadro (perfil), salto, rodada, jetpack y mano.
// Uso: node tests/capture-characters.cjs [personaje ...]
const all=['technical-student','classic-student','hoodie-student','phone-student'];
const chosen=process.argv.slice(2).filter(a=>all.includes(a));
(async()=>{
 const env=await harness();
 try{
  for(const id of chosen.length?chosen:all){
   const dir=`test-results/characters/${id}`;await mkdir(dir,{recursive:true});
   const context=await env.browser.newContext({viewport:{width:640,height:800}});
   await context.addInitScript(c=>localStorage.setItem('runnerCharacter',c),id);
   const page=await context.newPage();
   await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto(env.url);
   await page.evaluate(async()=>{
    const {Game}=await import('./game.js');const g=window.demo=new Game(document.querySelector('#game'));
    await Promise.all([g.characterReady,g.officerReady]);g.setQuality('high');
    window.draw=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};g.update(0);
    document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
    g.officerAnchor.visible=g.guard.root.visible=g.dog.root.visible=false;g.characterAnchor.position.set(0,0,0);
    g.runner.setDetail(true);
    window.shot=(x,y,z,tx,ty,tz)=>{g.camera.position.set(x,y,z);g.camera.lookAt(tx,ty,tz);window.draw(g.scene,g.camera);};
    window.pose=(n,o)=>{for(let i=0;i<n;i++)g.runner.update(1/60,o);};
   });
   const shot=async(name,fn,cam)=>{await page.evaluate(([f,c])=>{eval(f);window.shot(...c);},[fn,cam]);
    await page.screenshot({path:`${dir}/${name}.png`,timeout:480000});};
   await shot('idle','window.pose(90,{})',[0,1.15,-3.4,0,1.0,0]);
   await shot('hand','window.pose(30,{})',[.9,1.0,-.9,.25,.9,0]);
   for(let k=0;k<6;k++)await shot(`run-${k}`,k?'window.pose(4,{running:true,speed:22})':'window.pose(60,{running:true,speed:22})',[-3.3,1.1,-.2,0,1.0,0]);
   await shot('run-hand','window.pose(2,{running:true,speed:22})',[.9,1.1,-1.0,.2,1.0,0]);
   await shot('jump','window.pose(1,{running:true,airborne:true,verticalSpeed:10});window.pose(14,{running:true,airborne:true,verticalSpeed:2})',[-2.6,1.3,-2.2,0,1.1,0]);
   await shot('roll','window.pose(30,{running:true,rolling:true})',[-2.8,1.0,-1.8,0,.6,0]);
   await shot('jetpack','window.pose(40,{running:true,flying:true})',[-2.6,1.3,-2.2,0,1.1,0]);
   await context.close();
   console.log(id,'→',dir);
  }
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
