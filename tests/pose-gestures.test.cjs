const {test}=require('node:test');const assert=require('node:assert/strict');

// Poses simuladas a 30 fps con reloj falso: el detector real (filtros, calibración y umbrales).
// Torso de 0,27 (hombros 0,35 → caderas 0,62), así que 0,1 torsos ≈ 0,027 del cuadro.
const T=.27;
function pose({body=0,shoulders=0,hips=0,feet=0,wrists=null,hipsOut=false}={}){
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 const set=(i,x,y)=>{p[i]={x,y,visibility:1};};
 set(0,.5,.25+body+shoulders);
 set(11,.44,.35+body+shoulders);set(12,.56,.35+body+shoulders);
 set(13,.41,.47+body+shoulders);set(14,.59,.47+body+shoulders);
 const wy=wrists??(.58+body+shoulders);set(15,.4,wy);set(16,.6,wy);
 set(19,.4,wy+.02);set(20,.6,wy+.02);set(17,.41,wy+.02);set(18,.59,wy+.02);
 const hy=hipsOut?1.04:.62+body+hips;set(23,.46,hy);set(24,.54,hy);
 set(25,.46,.78+body+hips);set(26,.54,.78+body+hips);
 set(27,.46,.92+body+feet);set(28,.54,.92+body+feet);
 return p;
}

async function detector(){
 const {PoseController}=await import('../pose.js');
 let clock=1000;
 const real=Object.getOwnPropertyDescriptor(globalThis,'performance');
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 const count={jump:0,duck:0,duckEnd:0,lost:0,calibrated:0};
 const p=new PoseController({videoWidth:640,videoHeight:480},{getContext:()=>({})},{
  onJump:()=>count.jump++,onDuck:()=>count.duck++,onDuckEnd:()=>count.duckEnd++,
  onLost:()=>count.lost++,onCalibrated:()=>count.calibrated++,
 });
 p.draw=()=>{};
 const feed=(lm,frames=1)=>{for(let i=0;i<frames;i++){clock+=33;p.process([lm]);}};
 feed(pose(),30);
 assert.equal(count.calibrated,1,'calibra de pie y quieto');
 return {p,feed,count,restore(){if(real)Object.defineProperty(globalThis,'performance',real);}};
}

test('sin saltos fantasma: trotar en el lugar, encoger hombros, levantar brazos y un cuadro con ruido',async()=>{
 const d=await detector();
 try{
  // Trotar en el lugar: el cuerpo sube y baja ~0,1 torsos y los pies se alternan.
  for(let i=0;i<40;i++)d.feed(pose({body:-(i%6<3?.1:0)*T,feet:0}));
  assert.equal(d.count.jump,0,'trotar no es saltar');
  d.feed(pose(),15);
  // Encoger los hombros: suben solo los hombros.
  d.feed(pose({shoulders:-.3*T}),10);d.feed(pose(),15);
  assert.equal(d.count.jump,0,'encoger los hombros no es saltar');
  // Levantar los brazos por encima de la cabeza (los hombros suben un poco).
  d.feed(pose({shoulders:-.15*T,wrists:.1}),15);d.feed(pose(),15);
  assert.equal(d.count.jump,0,'levantar los brazos no es saltar');
  // Un solo cuadro con todo el esqueleto corrido hacia arriba (error del detector).
  d.feed(pose({body:-.3*T}),1);d.feed(pose(),15);
  assert.equal(d.count.jump,0,'un cuadro con ruido no es saltar');
 }finally{d.restore();}
});

test('salto real: todo el cuerpo y los pies suben; cuenta una vez por salto',async()=>{
 const d=await detector();
 try{
  for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:-h*T}));
  d.feed(pose(),15);
  assert.equal(d.count.jump,1);
  for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:-h*T}));
  d.feed(pose(),15);
  assert.equal(d.count.jump,2);
 }finally{d.restore();}
});

test('agachado: con las caderas fuera de cuadro se detecta, se sostiene y no pierde al jugador',async()=>{
 const d=await detector();
 try{
  // Bajada progresiva hasta una sentadilla en la que las caderas salen por abajo.
  for(const h of [.08,.18,.3,.4])d.feed(pose({body:h*T}));
  d.feed(pose({body:.45*T,hipsOut:true}),25);
  assert.equal(d.count.duck,1,'detecta el agachado');
  assert.equal(d.count.lost,0,'no da por perdido al jugador agachado');
  assert.equal(d.count.duckEnd,0,'lo sostiene mientras sigue abajo');
  for(const h of [.3,.15,0])d.feed(pose({body:h*T}));
  d.feed(pose(),15);
  assert.equal(d.count.duckEnd,1,'se levanta');
  assert.equal(d.count.jump,0,'levantarse no es saltar');
  // Agachado leve (media sentadilla, ~0,35 torsos) con las caderas a la vista.
  d.feed(pose({body:.35*T}),10);
  assert.equal(d.count.duck,2,'media sentadilla también cuenta');
 }finally{d.restore();}
});

test('de pie en el centro, unas caderas que no se ven siguen siendo una detección parcial',async()=>{
 const d=await detector();
 try{
  const partial=pose();partial[23].visibility=0;
  d.feed(partial,12);
  assert.equal(d.count.lost,1);
 }finally{d.restore();}
});
