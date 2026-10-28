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
  assert.ok(info.duration>30&&Number.isFinite(info.duration));assert.ok(requests.length>0);
  const names=await page.evaluate(async()=>(await (await fetch('assets/audio/playlist.json')).json()).tracks);
  const urls=names.map(name=>new URL(`assets/audio/${name}`,env.url).href);
  assert.ok(urls.includes(info.src));assert.equal(info.loop,names.length===1);
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

test('playlist: finales naturales alternan temas indefinidamente sin repetir el anterior',{timeout:30000},async()=>{
 const page=await env.browser.newPage();
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/assets/audio/playlist.json',r=>r.fulfill({json:{tracks:['first.mp3','second.mp3']}}));
 // Una señal breve permite recorrer varias canciones con finales naturales,
 // sin depender de búsquedas HTTP Range ni esperar la duración de cada MP3 real.
 const samples=4410,wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/22050)*300),44+i*2);
 await page.route('**/assets/audio/*.mp3',r=>r.fulfill({contentType:'audio/wav',body:wav}));
 try{
  await page.goto(env.url);
  await page.evaluate(async()=>{
   const {GameMusic}=await import('./music.js');const music=window.playlistMusic=new GameMusic();
   window.played=[];music.audio.addEventListener('playing',()=>played.push(music.audio.src));
   document.addEventListener('keydown',()=>{
    function frame(){music.update('playing');window.musicFrame=requestAnimationFrame(frame);}frame();
   },{once:true});
  });
  await page.keyboard.press('Space');await page.waitForFunction(()=>played.length>=5);
  const played=await page.evaluate(()=>{
   cancelAnimationFrame(musicFrame);playlistMusic.update('paused');return window.played;
  });
  assert.equal(new Set(played).size,2);
  for(let i=1;i<played.length;i++)assert.notEqual(played[i],played[i-1]);
 }finally{await page.close();}
});
