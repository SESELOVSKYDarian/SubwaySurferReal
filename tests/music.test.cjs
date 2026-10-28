const {test}=require('node:test');
const assert=require('node:assert/strict');

function media() {
 return {paused:true,currentTime:0,plays:0,pauses:0,listeners:{},
  addEventListener(name,fn){this.listeners[name]=fn;},
  end(){this.paused=true;this.listeners.ended();},
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

test('música: mezcla sin repetir temas hasta agotar la lista ni repetir en el cambio de ronda',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();
 const music=new GameMusic(audio,{tracks:['a.mp3','b.MP3','c.mp3'],random:()=>.99});
 music.update('playing');await settle();assert.equal(audio.loop,false);
 const played=[audio.src];
 for(let i=0;i<8;i++){audio.end();await settle();played.push(audio.src);}
 for(let i=0;i<played.length;i+=3)assert.equal(new Set(played.slice(i,i+3)).size,3);
 for(let i=1;i<played.length;i++)assert.notEqual(played[i],played[i-1]);
 const other=new GameMusic(media(),{tracks:['a.mp3','b.MP3','c.mp3'],random:()=>0});
 other.update('playing');await settle();assert.notEqual(other.current,played[0]);
});

test('música: una nueva partida elige otro tema, reanudar conserva el actual',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();
 const music=new GameMusic(audio,{tracks:['a.mp3','b.mp3']});
 music.update('playing');await settle();const first=audio.src;
 audio.currentTime=12;music.update('paused');music.update('playing');await settle();
 assert.equal(audio.src,first);assert.equal(audio.currentTime,12);
 music.update('over');music.update('playing');await settle();assert.notEqual(audio.src,first);
});

test('música: carga diferida única y sin arrancar si se pausó mientras llegaba la lista',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();let finish,calls=0;
 const music=new GameMusic(audio,{loader:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 music.setPreferences(true,.5);assert.equal(calls,0);
 for(let i=0;i<120;i++)music.update('playing');await settle();assert.equal(calls,1);
 music.update('paused');finish(['a.mp3']);await settle();assert.equal(audio.plays,0);
 music.update('playing');await settle();assert.equal(audio.plays,1);assert.equal(audio.loop,true);
});

test('música: lista vacía o inaccesible queda en silencio sin reintentos por cuadro',async()=>{
 const {GameMusic}=await import('../music.js');
 for(const fails of [false,true]){
  let calls=0;const audio=media(),music=new GameMusic(audio,{loader:async()=>{calls++;if(fails)throw Error('offline');return [];}});
  music.update('playing');await settle();for(let i=0;i<120;i++)music.update('playing');
  assert.equal(calls,1);assert.equal(audio.plays,0);assert.equal(audio.paused,true);
 }
});

test('música: salta archivos dañados y se detiene si todos fallan',async()=>{
 const {GameMusic}=await import('../music.js');
 for(const allBad of [false,true]){
  const audio=media();audio.play=function(){this.plays++;if(allBad||this.src.includes('bad.mp3'))return Promise.reject(Object.assign(Error('decode'),{name:'NotSupportedError'}));this.paused=false;return Promise.resolve();};
  const music=new GameMusic(audio,{tracks:['good.mp3','bad.mp3'],random:()=>.99});
  music.update('playing');await settle();await settle();
  assert.equal(audio.plays,2);assert.equal(music.failed.size,allBad?2:1);
  if(!allBad){assert.match(audio.src,/good.mp3$/);assert.equal(audio.loop,true);assert.equal(audio.paused,false);}
  else{for(let i=0;i<120;i++)music.update('playing');assert.equal(audio.plays,2);}
 }
});

test('música: ignora duplicados, extensiones ajenas y rutas fuera de assets/audio',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();
 const music=new GameMusic(audio,{tracks:['a.mp3','a.mp3','b.MP3','../outside.mp3','https://example.com/x.mp3','text.txt',null]});
 assert.equal(music.tracks.length,2);
});

test('música: el bucle de render espera ended y no reinicia el tema que acaba de terminar',async()=>{
 const {GameMusic}=await import('../music.js'),audio=media();
 const music=new GameMusic(audio,{tracks:['a.mp3','b.mp3']});music.update('playing');await settle();
 audio.paused=true;audio.ended=true;
 for(let i=0;i<120;i++)music.update('playing');
 assert.equal(audio.plays,1);
});
