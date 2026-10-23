const {harness}=require('./harness.cjs');
(async()=>{
 const env=await harness();
 try{
  const page=await env.browser.newPage({viewport:{width:960,height:540}});
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(env.url);
  const result=await page.evaluate(async()=>{
   let seed=77;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   const {Game}=await import('./game.js');const game=new Game(document.querySelector('#game'));
   await Promise.all([game.characterReady,game.officerReady]);game.start();
   const gl=game.renderer.getContext();const debug=gl.getExtension('WEBGL_debug_renderer_info');
   const renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable';
   const pixel=new Uint8Array(4),renders=[],intervals=[];let previous;
   for(let i=0;i<35;i++){
    const timestamp=await new Promise(requestAnimationFrame);
    if(i>=5&&previous!==undefined)intervals.push(timestamp-previous);previous=timestamp;
    const start=performance.now();game.update(1/60);
    // Leer un píxel espera al trabajo gráfico: no medir solo la cola de comandos.
    gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    if(i>=5)renders.push(performance.now()-start);
   }
   const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
   const sorted=[...renders].sort((a,b)=>a-b);
   return {renderer,viewport:'960x540',quality:game.quality,pixelRatio:game.pixelRatio,samples:renders.length,
    frameMeanMs:+average(intervals).toFixed(2),fps:+(1000/average(intervals)).toFixed(2),
    renderMeanMs:+average(renders).toFixed(2),renderP95Ms:+sorted[Math.ceil(sorted.length*.95)-1].toFixed(2),
    drawCalls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles};
  });console.log(JSON.stringify(result,null,2));
 }finally{await env.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
