const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdir}=require('node:fs/promises');
const {harness}=require('./harness.cjs');
let env;
before(async()=>{env=await harness();});
after(async()=>{if(env)await env.close();});

async function gamePage() {
 const page=await env.browser.newPage({viewport:{width:960,height:540}});
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto(env.url);
 await page.evaluate(async()=>{
  const {Game}=await import('./game.js');
  const g=window.game=new Game(document.querySelector('#game'));
  await Promise.all([g.characterReady,g.officerReady]);
  window.renderGame=g.renderer.render.bind(g.renderer);
  g.renderer.render=()=>{};
  window.resetGame=()=>{g.reset();g.start();g.nextSpawn=Infinity;};
  window.addBus=(lane,z)=>{
   const random=Math.random;
   try{Math.random=()=>.9;g.addObstacle('train',lane,z+4);}finally{Math.random=random;}
   return g.obstacles.at(-1);
  };
 });
 return page;
}

test('roces laterales y choques frontales consistentes a 30, 60 y 120 FPS',{timeout:120000},async()=>{
 const page=await gamePage();
 try{
  const cases=await page.evaluate(()=>{
   const g=window.game,results=[];
   for(const fps of [30,60,120])for(const direction of [-1,1]) {
    resetGame();g.speed=34;g.x=direction*1.8;g.lane=direction<0?0:2;
    addBus(1,-5);g.setLane(1);
    for(let i=0;i<fps&&!g.danger&&g.state==='playing';i++)g.update(1/fps);
    results.push({fps,direction,kind:'side',state:g.state,danger:g.danger,lane:g.lane,outside:Math.abs(g.x)>1.1});
    resetGame();g.speed=34;addBus(1,-6);
    for(let i=0;i<fps&&g.state==='playing';i++)g.update(1/fps);
    results.push({fps,direction,kind:'front',state:g.state,reason:g.caughtReason});
   }
   // Caer dentro del volumen no debe heredar un cambio de carril antiguo.
   resetGame();g.setLane(0);g.setLane(1);g.x=0;g.y=3.2;g.vy=-1;g.grounded=false;
   addBus(1,0);g.updatePhysics(1/60,0);
   results.push({kind:'inside',state:g.state,reason:g.caughtReason});
   return results;
  });
  for(const c of cases) {
   if(c.kind==='side') {
    assert.equal(c.state,'playing',JSON.stringify(c));assert.equal(c.danger,true);
    assert.equal(c.lane,c.direction<0?0:2);assert.equal(c.outside,true);
   }else{assert.equal(c.state,'over',JSON.stringify(c));assert.equal(c.reason,'crash');}
  }
 }finally{await page.close();}
});

test('un contacto cuenta una vez, otros obstáculos siguen siendo peligrosos y el orden no protege',{timeout:120000},async()=>{
 const page=await gamePage();
 try{
  const cases=await page.evaluate(()=>{
   const g=window.game,results=[];
   for(const fps of [30,60,120]) {
    resetGame();g.addObstacle('low',1,-.8);let notices=0;g.cb.onStumble=()=>notices++;
    for(let i=0;i<fps/2;i++)g.update(1/fps);
    results.push({name:'contacto sostenido '+fps,state:g.state,notices});
    resetGame();g.speed=34;g.y=1.01;g.vy=-10;g.grounded=false;g.addObstacle('low',1,-.1);
    g.update(1/fps);
    results.push({name:'aterrizaje durante contacto '+fps,state:g.state,danger:g.danger});
   }
   for(const type of ['high','train','low']) {
    resetGame();g.addObstacle('low',1,0);g.update(1/60);
    if(type==='train')addBus(1,0);else g.addObstacle(type,1,0);
    g.update(1/60);
    results.push({name:'segundo '+type,state:g.state,reason:g.caughtReason});
   }
   for(const types of [['low','high'],['high','low']]) {
    resetGame();for(const type of types)g.addObstacle(type,1,0);g.update(1/60);
    results.push({name:'orden '+types,state:g.state,reason:g.caughtReason});
   }
   for(const fps of [20,30,60,120]) {
    resetGame();g.speed=34;g.x=-2.2;g.lane=0;
    g.addObstacle('low',0,-.85);g.addObstacle('low',1,-.85);g.setLane(2);
    for(let i=0;i<fps/2&&g.state==='playing';i++)g.update(1/fps);
    results.push({name:'dos tableros '+fps,state:g.state,reason:g.caughtReason});
   }
   // A velocidad máxima, un banco fino puede cruzar entero en un cuadro.
   resetGame();g.speed=34;g.addObstacle('high',1,-.71);g.update(.05);
   results.push({name:'banco entre cuadros',state:g.state,reason:g.caughtReason});
   resetGame();g.lane=0;g.x=-2.2;g.addObstacle('low',0,0);g.update(1/60);
   addBus(1,-5);g.setLane(1);
   for(let i=0;i<30&&g.state==='playing';i++)g.update(1/60);
   results.push({name:'roce durante persecución',state:g.state,reason:g.caughtReason});
   return results;
  });
  for(const c of cases) {
   if(c.name.startsWith('contacto')){assert.equal(c.state,'playing',JSON.stringify(c));assert.equal(c.notices,1);}
   else if(c.name.startsWith('aterrizaje')){assert.equal(c.state,'playing');assert.equal(c.danger,true,JSON.stringify(c));}
   else{assert.equal(c.state,'over',JSON.stringify(c));assert.equal(c.reason,c.name==='segundo low'||c.name==='roce durante persecución'||c.name.startsWith('dos tableros')?'caught':'crash',JSON.stringify(c));}
  }
 }finally{await page.close();}
});

test('reacción, pausa, escape a los cinco segundos y reinicio limpio',{timeout:120000},async()=>{
 const page=await gamePage();
 try{
  const result=await page.evaluate(()=>{
   const g=window.game;resetGame();
   for(let i=0;i<6;i++)g.update(1/60);
   const normalSpine=g.runner.bones.Spine.quaternion.clone();
   resetGame();const chase=[];let escapes=0;
   g.cb.onChase=f=>chase.push(f);g.cb.onEscape=()=>escapes++;
   g.stumble();for(let i=0;i<6;i++)g.update(1/60);
   const reaction=g.runner.poseState.stumble;
   const reactionAngle=normalSpine.angleTo(g.runner.bones.Spine.quaternion);
   g.pause();const saved=JSON.stringify([g.chase,g.stumbleTimer,g.runner.poseState]);
   for(let i=0;i<120;i++)g.update(1/30);
   const frozen=saved===JSON.stringify([g.chase,g.stumbleTimer,g.runner.poseState]);
   g.resume();for(let i=0;i<295;i++)g.update(1/60);
   const recovered=!g.danger&&g.chase===0&&g.stumbleTimer===0&&g.runner.poseState.stumble<.001;
   const lastFraction=chase.at(-1);g.stumble();const firstAgain=g.state==='playing'&&g.danger;
   g.reset();const clean=g.stumbleContacts.size===0&&g.stumbleTimer===0&&g.runner.poseState.stumble===0&&chase.at(-1)===0;
   return {reaction,reactionAngle,frozen,recovered,escapes,lastFraction,firstAgain,clean};
  });
  assert.ok(result.reaction>.3);assert.equal(result.frozen,true);assert.equal(result.recovered,true);
  assert.ok(result.reactionAngle>.1,'El tropiezo debe cambiar la postura visible del torso');
  assert.equal(result.escapes,1);assert.equal(result.lastFraction,0);assert.equal(result.firstAgain,true);assert.equal(result.clean,true);
  await page.evaluate(()=>{
   const g=window.game;resetGame();g.stumble();for(let i=0;i<6;i++)g.update(1/60);
   document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
   renderGame(g.scene,g.camera);
  });
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/stumble-reaction.png'});
 }finally{await page.close();}
});

test('indicador de persecución legible en móvil, pausa y aviso de escape',async()=>{
 const page=await env.browser.newPage({viewport:{width:320,height:640}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:`
  export class Game {
   constructor(canvas,cb){window.testGame=this;this.cb=cb;this.state='ready';this.distance=0;}
   update(){} setQuality(){} start(){this.state='playing';} pause(){this.state='paused';} resume(){this.state='playing';}
  }
 `}));
 try{
  await page.goto(env.url);await page.keyboard.press('KeyD');
  assert.equal(await page.locator('#chase').isVisible(),false);
  await page.evaluate(()=>{testGame.cb.onStumble();testGame.cb.onChase(1);});
  assert.equal(await page.locator('#chase').isVisible(),true);
  assert.match(await page.locator('#chase-text').textContent(),/5 s/);
  assert.equal(await page.locator('#chase-progress').getAttribute('aria-valuenow'),'100');
  const action=await page.locator('#action').boundingBox();
  const indicator=await page.locator('#chase').boundingBox();
  assert.ok(action.x>=0&&action.x+action.width<=320);
  assert.ok(action.y>=indicator.y+indicator.height);
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/stumble-mobile.png'});
  await page.keyboard.press('KeyP');
  assert.match(await page.locator('#chase-text').textContent(),/5 s/);
  await page.evaluate(()=>testGame.cb.onChase(.4));
  assert.match(await page.locator('#chase-text').textContent(),/2 s/);
  const bounds=await page.locator('#chase').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320);
  await page.keyboard.press('KeyP');
  await page.evaluate(()=>{testGame.cb.onEscape();testGame.cb.onChase(0);});
  assert.equal(await page.locator('#chase').isVisible(),false);
  assert.equal(await page.locator('#chase-announcement').textContent(),'Te escapaste del profesor.');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
