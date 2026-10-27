const {test}=require('node:test');
const assert=require('node:assert/strict');

test('tocar el límite del colectivo al alejarse no cuenta como choque',async()=>{
 const {obstacleContact}=await import('../collisions.js');
 const bus={mesh:{position:{x:0,z:0}},depth:10};
 for(const direction of [-1,1]) {
  const from=direction*1.1,dt=1/30;
  const target=direction*2.2,to=target+(from-target)*Math.exp(-18*dt);
  assert.equal(obstacleContact(bus,from,to,target,dt,0),null,'Se aleja del costado');
  assert.equal(obstacleContact(bus,from,from,from,dt,0),null,'Permanece fuera');
  const entering=obstacleContact(bus,from,from*Math.exp(-18*dt),0,dt,0);
  assert.equal(entering?.side,true,'Entra por el costado');
 }
});
