const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const { harness } = require('./harness.cjs');
let env;
before(async()=>{env=await harness();});
after(async()=>{if(env)await env.close();});

async function pageWithGameStub(context) {
  const page=await context.newPage();
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:`
    export class Game {
      constructor(canvas,callbacks){window.testGame=this;this.callbacks=callbacks;this.state='ready';this.distance=0;this.starts=0;}
      start(){this.state='playing';this.starts++;}
      resume(){this.state='playing';}
      update(){} left(){} right(){} jump(){} roll(){} releaseRoll(){} setQuality(){}
      finish(score,coins){this.state='over';this.callbacks.onGameOver(score,coins,'caught');}
    }
  `}));
  await page.goto(env.url);
  await page.waitForFunction(()=>!!window.testGame);
  return page;
}

test('ranking desde el menú, iniciales sin activar controles y persistencia tras recargar',async()=>{
  const context=await env.browser.newContext({viewport:{width:960,height:720}});
  const page=await pageWithGameStub(context),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.locator('#rankingBtn').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ranking-dialog').evaluate(d=>d.open),true);
    assert.equal(await page.locator('#ranking-empty').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.testGame.starts),0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyD');
    assert.equal(await page.evaluate(()=>window.testGame.state),'playing');
    await page.evaluate(()=>window.testGame.finish(1234,12));
    assert.equal(await page.locator('#playBtn img').count(),2);
    assert.match(await page.locator('#playBtn small').textContent(),/Otra carrera/);
    await page.keyboard.press('KeyD'); // Tampoco puede saltarse la espera del formulario.
    await page.waitForFunction(()=>document.querySelector('#score-dialog').open);
    assert.equal(await page.locator('#score-initials').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.type('dap');
    assert.equal(await page.locator('#score-initials').inputValue(),'DAP');
    assert.equal(await page.evaluate(()=>window.testGame.starts),1);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#ranking-dialog').open);
    assert.equal(await page.locator('#ranking-rows tr').count(),1);
    assert.match(await page.locator('#ranking-rows').innerText(),/DAP/);
    assert.match(await page.locator('#ranking-status').innerText(),/guardada.*Puesto 1/);
    await page.reload();await page.locator('#rankingBtn').click();
    assert.match(await page.locator('#ranking-rows').innerText(),/DAP/);
    await page.locator('#close-ranking').click();
    await page.keyboard.press('KeyD');await page.evaluate(()=>window.testGame.finish(2500,20));
    await page.waitForFunction(()=>document.querySelector('#score-dialog').open);
    assert.equal(await page.locator('#score-initials').inputValue(),'');
    await page.locator('#score-initials').fill('abc');await page.locator('#save-score').click();
    assert.match(await page.locator('#ranking-rows tr').first().innerText(),/ABC/);
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:'test-results/ranking.png'});
    for(const width of [320,768]){
      await page.setViewportSize({width,height:540});
      assert.equal(await page.locator('#ranking-dialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('guardar falla sin perder la partida y permite reintentar u omitir',async()=>{
  const context=await env.browser.newContext(),page=await pageWithGameStub(context);
  try{
    await page.keyboard.press('KeyD');await page.evaluate(()=>window.testGame.finish(42,3));
    await page.waitForFunction(()=>document.querySelector('#score-dialog').open);
    await page.locator('#score-initials').fill('AB');assert.equal(await page.locator('#save-score').isDisabled(),true);
    await page.locator('#score-initials').fill('ABC');
    await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('QuotaExceededError');};});
    await page.locator('#save-score').click();
    assert.equal(await page.locator('#score-dialog').evaluate(d=>d.open),true);
    assert.match(await page.locator('#score-error').innerText(),/No se pudo guardar/);
    await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);
    await page.locator('#save-score').click();
    assert.match(await page.locator('#ranking-rows').innerText(),/ABC/);
    await page.locator('#close-ranking').click();
    await page.keyboard.press('KeyD');await page.evaluate(()=>window.testGame.finish(99,4));
    await page.waitForFunction(()=>document.querySelector('#score-dialog').open);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#overlay').evaluate(e=>!e.classList.contains('hidden')),true);
    await page.locator('#rankingBtn').click();
    assert.equal(await page.locator('#ranking-rows tr').count(),1);
  }finally{await context.close();}
});

test('solo muestra diez puntajes y conserva el resto de las partidas en JSON',async()=>{
  const context=await env.browser.newContext(),page=await pageWithGameStub(context);
  try{
    await page.evaluate(async()=>{
      const {RankingStore}=await import('./ranking.js'),store=new RankingStore();
      for(let i=0;i<15;i++)store.save('ABC',i*100,i);
    });
    await page.locator('#rankingBtn').click();
    assert.equal(await page.locator('#ranking-rows tr').count(),10);
    assert.equal(await page.evaluate(async()=>{const {RankingStore}=await import('./ranking.js');return new RankingStore().read().length;}),15);
  }finally{await context.close();}
});
