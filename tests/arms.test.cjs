const {test}=require('node:test');
const assert=require('node:assert/strict');
test('brazos en espejo, proporciones de cámara y descarte por articulación',async()=>{
 const {armTargets}=await import('../arm-tracking.js');
 const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 lm[11]={x:.6,y:.4,visibility:1};lm[13]={x:.75,y:.4,visibility:1};
 lm[15]={x:.75,y:.2,visibility:1};lm[19]={x:.75,y:.15,visibility:1};
 const t=armTargets(lm);
 assert.deepEqual(t.RightArm,[-1,-0,0]);assert.deepEqual(t.RightForeArm,[-0,1,0]);
 assert.deepEqual(t.RightHand,[-0,1,0]);assert.equal(t.LeftArm,null);
 lm[15].visibility=.2;
 const occluded=armTargets(lm);
 assert.ok(occluded.RightArm);assert.equal(occluded.RightForeArm,null);assert.equal(occluded.RightHand,null);
 lm[13].x=NaN;assert.equal(armTargets(lm).RightArm,null);
});
test('manos descansando conservan carrera, levantar una activa solo ese brazo',async()=>{
 const {armTargets}=await import('../arm-tracking.js');
 const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 lm[11].y=lm[12].y=.3;lm[23].y=lm[24].y=.6;lm[15].y=lm[16].y=.7;
 assert.equal(armTargets(lm).RightWeight,0);assert.equal(armTargets(lm).LeftWeight,0);
 lm[15].y=.3;assert.equal(armTargets(lm).RightWeight,1);assert.equal(armTargets(lm).LeftWeight,0);
});
