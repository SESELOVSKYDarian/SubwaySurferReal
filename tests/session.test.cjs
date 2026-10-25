const {test}=require('node:test');
const assert=require('node:assert/strict');
test('inicio, pérdida en cuenta atrás, recalibración y pausa manual',async()=>{
 const {PlaySession}=await import('../session.js');
 let next;const shown=[];
 const game={state:'ready',start(){this.state='playing'},pause(){if(this.state==='playing')this.state='paused'},resume(){this.state='playing'}};
 const s=new PlaySession(game,(title)=>shown.push(title),()=>{}, {set(fn){next=fn;return 1},clear(){next=null}});
 const tick=()=>{const fn=next;next=null;fn()};
 s.request();assert.equal(game.state,'ready');assert.equal(shown.at(-1),'3');
 tick();s.tracking(false);assert.equal(next,null);assert.equal(game.state,'ready');
 s.tracking(true);assert.equal(shown.at(-1),'3');tick();tick();tick();assert.equal(game.state,'playing');
 s.tracking(false);assert.equal(game.state,'paused');s.tracking(true);tick();s.tracking(false);
 assert.equal(next,null);assert.equal(game.state,'paused');s.tracking(true);tick();tick();tick();
 s.togglePause();s.tracking(false);s.tracking(true);assert.equal(next,null);
 s.togglePause();tick();tick();tick();assert.equal(game.state,'playing');
});
test('teclado permite iniciar y reanudar sin calibración de cámara',async()=>{
 const {PlaySession}=await import('../session.js');
 let next;
 const game={state:'ready',start(){this.state='playing'},pause(){this.state='paused'},resume(){this.state='playing'}};
 const s=new PlaySession(game,()=>{},()=>{}, {set(fn){next=fn;return 1},clear(){next=null}});
 const countdown=()=>{for(let i=0;i<3;i++){const fn=next;next=null;fn()}};
 s.tracking(false);s.request();assert.equal(next,null);
 s.useKeyboard();assert.equal(s.pending,true);countdown();assert.equal(game.state,'playing');
 s.tracking(false);assert.equal(game.state,'playing');assert.equal(next,null);
 s.togglePause();s.useKeyboard();assert.equal(game.state,'paused');assert.equal(next,null);
 s.togglePause();countdown();assert.equal(game.state,'playing');
 s.keyboard=false;s.tracking(false);assert.equal(game.state,'paused');
});

test('debug arranca inmediatamente y no se bloquea por seguimiento incompleto',async()=>{
 const {PlaySession}=await import('../session.js');
 for(const state of ['ready','paused','over']) {
  let hidden=false,cleared=false;
  const game={state,start(){this.state='playing'},resume(){this.state='playing'}};
  const s=new PlaySession(game,()=>{},()=>{hidden=true}, {set(){throw Error('Debug no debe esperar una cuenta atrás')},clear(){cleared=true}});
  s.camera=true;s.ready=false;s.pending=true;s.manual=true;
  s.startDebug();s.tracking(false);s.tracking(true);s.tracking(false);
  assert.equal(game.state,'playing');assert.equal(s.keyboard,true);
  assert.equal(s.pending,false);assert.equal(s.manual,false);
  assert.equal(hidden,true);assert.equal(cleared,true);
 }
});

test('cámara: reutiliza stream y modelo; detección parcial no calibra',async()=>{
 const {PoseController}=await import('../pose.js');
 let requests=0,models=0,frames=0,lost=0,calibrated=0;
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{requests++;return {getVideoTracks:()=>[{readyState:'live'}]}}}}});
 const video={play:async()=>{},videoWidth:640,videoHeight:480};
 const p=new PoseController(video,{getContext:()=>({})},{onLost:()=>lost++,onCalibrated:()=>calibrated++});
 p.startWorker=async()=>{models++;p.worker={}};p.scheduleFrame=()=>frames++;p.draw=()=>{};
 try {
  await Promise.all([p.start(),p.start()]);await p.start();
  assert.equal(requests,1);assert.equal(models,1);assert.equal(frames,1);
  p.running=false;await p.start();assert.equal(requests,1);assert.equal(models,1);
  const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  lm[11]={x:.4,y:.35,visibility:1};lm[12]={x:.6,y:.35,visibility:1};
  lm[23]={x:.43,y:.65,visibility:1};lm[24]={x:.57,y:.65,visibility:1};
  for(let i=0;i<25;i++)p.process([lm]);assert.equal(calibrated,1);
  const partial=lm.map(l=>({...l}));partial[23].visibility=0;
  for(let i=0;i<12;i++)p.process([partial]);assert.equal(lost,1);
  for(let i=0;i<25;i++)p.process([lm]);assert.equal(calibrated,2);
 }finally{
  clearInterval(p.watchdog);
  if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;
 }
});
