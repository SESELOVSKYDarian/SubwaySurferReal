const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
let env;
before(async()=>env=await harness());
after(async()=>env?.close());
test('historia: intro real, casa, regreso con calibración, victoria y cancelación',{timeout:60000},async()=>{
 const p=await env.browser.newPage();
 await p.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 try {
  await p.goto(env.url);
  await p.evaluate(async()=>{
   const {StoryMode}=await import('./story.js');
   const game={state:'ready',distance:0,coinCount:7,reset(){this.state='ready';this.distance=0},clearTrack(){this.cleared=true}};
   const session={requests:0,request(){this.requests++}};
   const leaderboard={offerScore(...args){this.result=args}};
   window.flow=new StoryMode({game,session,leaderboard,flash(){},sound(){}});
   window.flow.start();
  });
  const player=p.locator('#story-player');
  await p.waitForFunction(()=>document.querySelector('#story-player').readyState>=2);
  assert.match(await player.getAttribute('src'),/introduccion.mp4$/);
  assert.equal(await player.evaluate(v=>Math.round(v.duration)),28);
  await p.locator('#story-skip').click();
  assert.equal(await p.evaluate(()=>flow.phase),'ida');
  assert.equal(await p.evaluate(()=>flow.session.requests),1);
  await p.evaluate(()=>{flow.game.distance=flow.game.legEnd;flow.game.state='waiting';void flow.onLegEnd()});
  await p.waitForFunction(()=>document.querySelector('#story-player').getAttribute('src')?.endsWith('recoger-guardapolvo.mp4')&&document.querySelector('#story-player').readyState>=2);
  assert.equal(await player.evaluate(v=>Math.round(v.duration)),24);
  // Simula el final natural, el mismo evento que emite el reproductor.
  await player.evaluate(v=>v.dispatchEvent(new Event('ended')));
  await p.waitForFunction(()=>flow.session.requests===2);
  assert.equal(await p.evaluate(()=>flow.phase),'vuelta');
  assert.equal(await p.evaluate(()=>flow.game.state),'waiting');
  assert.equal(await p.evaluate(()=>flow.game.cleared),true);
  await p.evaluate(()=>{flow.game.distance=flow.game.legEnd;void flow.onLegEnd()});
  await p.waitForFunction(()=>document.querySelector('#story-player').getAttribute('src')?.endsWith('final-victoria.mp4'));
  await p.keyboard.press('Escape');
  await p.waitForFunction(()=>flow.leaderboard.result);
  assert.deepEqual(await p.evaluate(()=>flow.leaderboard.result),[7,7,'story']);
  await p.evaluate(()=>{void flow.start();flow.cancel()});
  assert.equal(await p.evaluate(()=>flow.active),false);
  assert.equal(await p.locator('#story-video').evaluate(e=>e.classList.contains('hidden')),true);
  assert.equal(await player.getAttribute('src'),null);
 } finally {await p.close()}
});
