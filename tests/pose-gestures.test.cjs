const {test}=require('node:test');const assert=require('node:assert/strict');

// Poses simuladas a 30 fps con reloj falso: el detector real (filtros, calibración y umbrales).
// Torso de 0,27 (hombros 0,35 → caderas 0,62), así que 0,1 torsos ≈ 0,027 del cuadro.
const T=.27;
function pose({body=0,shoulders=0,hips=0,feet=0,wrists=null,hipsOut=false,head=0,scale=1,noFeet=false,wide=1}={}){
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 const set=(i,x,y)=>{p[i]={x,y,visibility:1};};
 set(0,.5,.25+body+shoulders+head);
 set(11,.5-.06*wide,.35+body+shoulders);set(12,.5+.06*wide,.35+body+shoulders);
 set(13,.41,.47+body+shoulders);set(14,.59,.47+body+shoulders);
 const wy=wrists??(.58+body+shoulders);set(15,.4,wy);set(16,.6,wy);
 set(19,.4,wy+.02);set(20,.6,wy+.02);set(17,.41,wy+.02);set(18,.59,wy+.02);
 const hy=hipsOut?1.04:.62+body+hips;set(23,.46,hy);set(24,.54,hy);
 set(25,.46,.78+body+hips);set(26,.54,.78+body+hips);
 set(27,.46,.92+body+feet);set(28,.54,.92+body+feet);
 if(noFeet){p[27].visibility=0;p[28].visibility=0;}
 // Jugadores de otro tamaño o a otra distancia: el cuerpo entero se escala alrededor del pecho.
 if(scale!==1)for(const q of p){q.x=.5+(q.x-.5)*scale;q.y=.45+(q.y-.45)*scale;}
 return p;
}

async function detector(base={},calibMs=33){
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
 const feed=(lm,frames=1,ms=33)=>{for(let i=0;i<frames;i++){clock+=ms;p.process([lm]);}};
 feed(pose(base),calibMs>100?12:30,calibMs);
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

test('salto con la cámara lenta (10 fps): el salto dura un solo cuadro arriba del umbral',async()=>{
 const d=await detector();
 try{
  d.feed(pose(),20,100);
  for(const h of [.05,.4,.05])d.feed(pose({body:-h*T}),1,100);
  d.feed(pose(),10,100);
  assert.equal(d.count.jump,1,'detecta el salto');
  for(const h of [.05,.35,.05])d.feed(pose({body:-h*T}),1,100);
  d.feed(pose(),10,100);
  assert.equal(d.count.jump,2,'y el siguiente');
  // Un cuadro suelto con solo los hombros arriba sigue sin contar.
  d.feed(pose({shoulders:-.4*T}),1,100);d.feed(pose(),10,100);
  assert.equal(d.count.jump,2);
 }finally{d.restore();}
});

test('saltos seguidos aunque después de aterrizar quede a otra altura que al calibrar',async()=>{
 const d=await detector();
 try{
  for(let n=0;n<4;n++){
   const rest=n%2?.08:-.06;   // queda un poco más arriba o más abajo que al calibrar
   for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:(rest-h)*T}));
   d.feed(pose({body:rest*T}),30);
  }
  assert.equal(d.count.jump,4,'cada salto cuenta');
  // Quedó parado más arriba un rato largo: la referencia se ajusta y el salto sigue funcionando.
  d.feed(pose({body:-.07*T}),90);
  for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:(-.07-h)*T}));
  d.feed(pose({body:-.07*T}),20);
  assert.equal(d.count.jump,5);
  assert.equal(d.count.duck,0);
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

test('no se queda agachado: se levanta con la cabeza gacha o tras una sentadilla honda',async()=>{
 const d=await detector();
 try{
  for(const h of [.15,.35,.5])d.feed(pose({body:h*T}));
  d.feed(pose({body:.5*T}),8);
  assert.equal(d.count.duck,1);
  // De pie otra vez, pero mirando la pantalla con la cabeza agachada (la nariz sigue baja).
  d.feed(pose({head:.35*T}),10);
  assert.equal(d.count.duckEnd,1,'la cabeza gacha no lo deja agachado');
  d.feed(pose(),15);
  // Sentadilla muy honda y vuelta casi completa (queda un poco encorvado).
  for(const h of [.3,.6,.85])d.feed(pose({body:h*T,hipsOut:h>.5}));
  d.feed(pose({body:.85*T,hipsOut:true}),8);
  assert.equal(d.count.duck,2);
  d.feed(pose({body:.2*T}),6);
  assert.equal(d.count.duckEnd,2,'tras una sentadilla honda, volver casi arriba ya es estar de pie');
  assert.equal(d.count.lost,0);
 }finally{d.restore();}
});

test('no se queda agachado aunque el jugador quede parado más abajo que al calibrar',async()=>{
 const d=await detector();
 try{
  for(const h of [.15,.35,.55])d.feed(pose({body:h*T}));
  d.feed(pose({body:.55*T}),6);
  assert.equal(d.count.duck,1);
  // Se acercó a la cámara: de pie, pero los hombros quedan 0,3 torsos más abajo que al calibrar.
  d.feed(pose({body:.3*T}),40);
  assert.equal(d.count.duckEnd,0,'en el primer segundo puede seguir esquivando');
  d.feed(pose({body:.3*T}),60);
  assert.equal(d.count.duckEnd,1,'quieto en la postura nueva, deja de estar agachado');
  d.feed(pose({body:.3*T}),90);
  assert.equal(d.count.jump,0,'la corrección no produce saltos');
  assert.equal(d.count.duck,1,'ni vuelve a agacharse');
  // Desde la postura nueva se puede saltar y agacharse otra vez.
  for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:(.3-h)*T}));
  d.feed(pose({body:.3*T}),15);
  assert.equal(d.count.jump,1,'salta desde la nueva referencia');
  for(const h of [.15,.35,.5])d.feed(pose({body:(.3+h)*T}));
  d.feed(pose({body:.8*T}),5);
  assert.equal(d.count.duck,2,'se agacha desde la nueva referencia');
 }finally{d.restore();}
});

test('agacharse y levantarse rápido no es saltar (con y sin pies a la vista)',async()=>{
 for(const noFeet of [false,true]){
  const d=await detector({noFeet});
  try{
   // Agachada corta, que no llega a contar como agachado, y se para de golpe pasando un poco de largo.
   for(const h of [.08,.16,.22,.22,.12,-.04,-.12,-.1,-.04,0])d.feed(pose({body:h*T,noFeet}));
   d.feed(pose({noFeet}),20);
   assert.equal(d.count.jump,0,'levantarse de una agachada corta no es saltar'+(noFeet?' (sin pies)':''));
   // Agachada completa y se para con impulso.
   for(const h of [.15,.3,.45,.5,.5,.5,.5,.3,.1,-.1,-.16,-.12,-.05,0])d.feed(pose({body:h*T,noFeet}));
   d.feed(pose({noFeet}),20);
   assert.equal(d.count.duck,1);
   assert.equal(d.count.jump,0,'levantarse de agachado con impulso no es saltar'+(noFeet?' (sin pies)':''));
  }finally{d.restore();}
 }
});

test('salto con amague: baja un poco, despega y los pies dejan el piso',async()=>{
 const d=await detector();
 try{
  for(const h of [.06,.12,.12,.04,-.25,-.5,-.55,-.4,-.15,0])d.feed(pose({body:h*T}));
  d.feed(pose(),20);
  assert.equal(d.count.jump,1);
  assert.equal(d.count.duck,0);
 }finally{d.restore();}
});

test('distintos tamaños: un chico lejos y alguien alto cerca calibran, saltan y se agachan',async()=>{
 for(const scale of [.72,1.3]){
  const d=await detector({scale});
  try{
   for(const h of [.15,.35,.5,.5,.35,.15])d.feed(pose({body:-h*T,scale}));
   d.feed(pose({scale}),20);
   for(const h of [.15,.3,.45])d.feed(pose({body:h*T,scale}));
   d.feed(pose({body:.45*T,scale}),8);
   for(const h of [.3,.15,0])d.feed(pose({body:h*T,scale}));
   d.feed(pose({scale}),20);
   assert.deepEqual([d.count.jump,d.count.duck,d.count.duckEnd,d.count.lost],[1,1,1,0],'escala '+scale);
  }finally{d.restore();}
 }
});

test('cámara lenta: un cuadro erróneo mientras se agacha no es un salto',async()=>{
 for(const noFeet of [false,true]){
  const d=await detector({noFeet});
  try{
   d.feed(pose({noFeet}),20,100);
   // Agachada corta (no llega a agachado) y un cuadro en el que el detector ve todo el cuerpo más arriba.
   d.feed(pose({body:.22*T,noFeet}),3,100);
   d.feed(pose({body:-.2*T,noFeet}),1,100);
   d.feed(pose({body:.22*T,noFeet}),3,100);
   d.feed(pose({noFeet}),15,100);
   assert.equal(d.count.jump,0,noFeet?'sin pies':'con pies');
  }finally{d.restore();}
 }
});

test('inclinarse hacia la cámara cuenta como agacharse; acercarse caminando no',async()=>{
 const d=await detector();
 try{
  // Inclinado: hombros un poco más abajo, más anchos (más cerca) y el torso se ve más corto.
  for(const k of [.3,.6,1])d.feed(pose({shoulders:.12*T*k,wide:1+.22*k,head:.1*T*k}));
  d.feed(pose({shoulders:.12*T,wide:1.22,head:.1*T}),6);
  assert.equal(d.count.duck,1,'inclinarse cuenta');
  for(const k of [.6,.2,-.2,0])d.feed(pose({shoulders:.12*T*k,wide:1+.22*Math.max(0,k)}));
  d.feed(pose(),20);
  assert.equal(d.count.duckEnd,1);
  assert.equal(d.count.jump,0,'enderezarse no es saltar');
  // Un paso hacia la cámara: todo el cuerpo se ve más grande, en proporción.
  for(const sc of [1.04,1.08,1.12,1.15])d.feed(pose({scale:sc}));
  d.feed(pose({scale:1.15}),20);
  assert.equal(d.count.duck,1,'acercarse no es agacharse');
  assert.equal(d.count.jump,0);
 }finally{d.restore();}
});

test('calibra con la cámara lenta (5 y 6 fps) y no se queda en 100 %',async()=>{
 for(const ms of [200,170]){
  const d=await detector({},ms);
  try{
   assert.match(d.p.lastStatus,/✅|Calibrando/);
   d.feed(pose(),5,ms);
   assert.match(d.p.lastStatus,/✅/,'quedó calibrado a '+Math.round(1000/ms)+' fps');
  }finally{d.restore();}
 }
});

test('de pie en el centro, unas caderas que no se ven siguen siendo una detección parcial',async()=>{
 const d=await detector();
 try{
  const partial=pose();partial[23].visibility=0;
  d.feed(partial,12);
  assert.equal(d.count.lost,1);
 }finally{d.restore();}
});
