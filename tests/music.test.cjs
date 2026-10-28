const {test}=require('node:test');
const assert=require('node:assert/strict');

function media() {
 return {paused:true,currentTime:0,plays:0,pauses:0,
  play(){this.plays++;this.paused=false;return Promise.resolve();},
  pause(){this.pauses++;this.paused=true;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('música: inicio, pausa conservando posición, videos y reinicio',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media(),music=new GameMusic(audio,{tracks:["one.mp3"]});
 music.setPreferences(true,.55);assert.equal(audio.plays,0);assert.equal(audio.preload,'none');
 music.update('playing');await settle();assert.equal(audio.paused,false);assert.equal(audio.loop,true);
 audio.currentTime=23;music.update('paused');assert.equal(audio.paused,true);assert.equal(audio.currentTime,23);
 music.update('playing',true);assert.equal(audio.paused,true);
 music.update('playing');await settle();assert.equal(audio.paused,false);assert.equal(audio.currentTime,23);
 music.update('waiting');assert.equal(audio.paused,true);
 music.update('playing');await settle();music.update('over');assert.equal(audio.currentTime,0);assert.equal(audio.paused,true);
 audio.currentTime=10;music.update('ready');assert.equal(audio.currentTime,0);
});

test('música: silencio, volumen inmediato y volumen cero sin reproducción',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media(),music=new GameMusic(audio,{tracks:["one.mp3"]});
 music.setPreferences(false,.8);music.update('playing');assert.equal(audio.plays,0);assert.equal(audio.muted,true);
 music.setPreferences(true,.8);await settle();assert.equal(audio.paused,false);assert.equal(audio.muted,false);
 assert.ok(Math.abs(audio.volume-.28)<1e-9);
 audio.currentTime=12;music.setPreferences(true,0);assert.equal(audio.paused,true);assert.equal(audio.currentTime,12);
 music.setPreferences(true,.2);await settle();assert.ok(Math.abs(audio.volume-.07)<1e-9);assert.equal(audio.paused,false);
 music.setPreferences(false,.2);assert.equal(audio.paused,true);
});

test('música: bloqueo de autoplay no se reintenta cada cuadro',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();
 audio.play=function(){this.plays++;return Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}));};
 const music=new GameMusic(audio,{tracks:["one.mp3"]});music.update('playing');await settle();
 for(let i=0;i<120;i++)music.update('playing');assert.equal(audio.plays,1);
 audio.play=function(){this.plays++;this.paused=false;return Promise.resolve();};
 music.unlock();await settle();assert.equal(audio.plays,2);assert.equal(audio.paused,false);
});

test('música: una pausa durante play pendiente no reinicia el audio',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();let finish;
 audio.play=function(){return new Promise(resolve=>{finish=()=>{this.paused=false;resolve();};});};
 const music=new GameMusic(audio,{tracks:["one.mp3"]});music.update('playing');music.update('paused');finish();await settle();
 assert.equal(audio.paused,true);
});

test('música: abortar reproducción por una pausa no exige otro gesto',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();let abort;
 audio.play=function(){this.plays++;return new Promise((_,reject)=>{abort=reject;});};
 const music=new GameMusic(audio,{tracks:["one.mp3"]});music.update('playing');music.update('paused');
 abort(Object.assign(new Error('paused'),{name:'AbortError'}));await settle();
 audio.play=function(){this.plays++;this.paused=false;return Promise.resolve();};
 music.update('playing');await settle();assert.equal(audio.paused,false);assert.equal(audio.plays,2);
});
