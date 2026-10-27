const {harness}=require('./harness.cjs');
const {mkdir}=require('node:fs/promises');
// Partida real desde el menú (con main.js, sin atajos): espera la cuenta atrás
// y toma capturas durante la carrera, como las ve el jugador.
// Uso: node tests/capture-play.cjs [carpeta]
const dir=process.argv[2]||'test-results/play';
(async()=>{
 const env=await harness();
 try{
  await mkdir(dir,{recursive:true});
  const page=await env.browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(env.url,{timeout:240000});
  await page.locator('#playBtn').click({timeout:240000});
  await page.waitForFunction(()=>document.querySelector('#overlay').classList.contains('hidden'),null,{timeout:240000});
  for(let k=0;k<4;k++){
   await page.waitForTimeout(k?2500:5000);
   await page.screenshot({path:`${dir}/carrera-${k}.png`,timeout:240000});
  }
  const served=await page.evaluate(async()=>(await (await fetch('./world.js',{cache:'no-store'})).text()).includes('street-textures'));
  console.log('Partida →',dir,'| world.js nuevo:',served,'| errores:',errors.length?errors:'ninguno');
 }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
