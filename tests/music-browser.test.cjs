const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
let env;
before(async()=>{env=await harness();});
after(async()=>{if(env)await env.close();});

test('MP3 elegido: reproducción real, pausa, volumen, pestaña oculta y videos',{timeout:60000},async()=>{
 const page=await env.browser.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/assets/audio/'))requests.push(r.url());});
 await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:`
  export class Game {
   constructor(canvas,cb){window.testGame=this;this.cb=cb;this.state='ready';this.distance=0;this.coinCount=0;}
   setQuality(){} reset(){this.state='ready';this.distance=0;} clearTrack(){}
   update(dt){if(this.state==='playing')this.distance+=14*dt;}
   start(){this.state='playing';} pause(){this.state='paused';} resume(){this.state='playing';}
   left(){} right(){} jump(){} roll(){} releaseRoll(){}
   finish(){this.state='over';this.cb.onGameOver(100,3,'caught');}
  }
 `}));
 try{
  await page.goto(env.url);
  await page.evaluate(async()=>{window.track=(await import('./menu.js')).backgroundMusic.audio;});
  assert.equal(await page.evaluate(()=>track.paused),true);assert.equal(requests.length,0);
  await page.keyboard.press('KeyD');
  await page.waitForFunction(()=>!track.paused&&track.readyState>=2&&track.currentTime>.05);
  const info=await page.evaluate(()=>({duration:track.duration,loop:track.loop,src:track.src}));
  assert.ok(info.duration>30&&Number.isFinite(info.duration));assert.equal(info.loop,true);
  assert.match(info.src,/mi-perro-dinamita-8bit.mp3$/);assert.ok(requests.length>0);
  await page.keyboard.press('KeyP');await page.waitForFunction(()=>track.paused);
  const position=await page.evaluate(()=>track.currentTime);await page.waitForTimeout(250);
  assert.ok(Math.abs(await page.evaluate(()=>track.currentTime)-position)<.03);
  await page.keyboard.press('KeyP');await page.waitForFunction(saved=>!track.paused&&track.currentTime>saved,position);
  await page.evaluate(()=>document.querySelector('#sound-toggle').click());
  assert.equal(await page.evaluate(()=>track.paused&&track.muted),true);
  await page.evaluate(()=>{
   const slider=document.querySelector('#sound-volume');slider.value='20';slider.dispatchEvent(new Event('input'));
   document.querySelector('#sound-toggle').click();
  });
  await page.waitForFunction(()=>!track.paused&&!track.muted);
  assert.ok(Math.abs(await page.evaluate(()=>track.volume)-.07)<.001);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>track.paused),true);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!track.paused);
  await page.evaluate(()=>testGame.finish());
  await page.waitForFunction(()=>!document.querySelector('#story-video').classList.contains('hidden')&&track.paused);
  assert.ok(await page.evaluate(()=>track.currentTime)<.05);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('silencio y volumen guardados se respetan al cargar el juego',async()=>{
 const context=await env.browser.newContext();
 await context.addInitScript(()=>{localStorage.setItem('menuSound','false');localStorage.setItem('menuVolume','0.2');});
 const page=await context.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try{
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   const {backgroundMusic}=await import('./menu.js');backgroundMusic.update('playing');
   return {paused:backgroundMusic.audio.paused,muted:backgroundMusic.audio.muted,volume:backgroundMusic.audio.volume};
  });
  assert.equal(result.paused,true);assert.equal(result.muted,true);assert.ok(Math.abs(result.volume-.07)<.001);
 }finally{await context.close();}
});
