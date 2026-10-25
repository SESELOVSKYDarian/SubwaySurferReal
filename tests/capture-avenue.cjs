const { harness } = require('./harness.cjs');
const { mkdir, writeFile, readFile } = require('node:fs/promises');

(async()=>{
  const env=await harness();
  try{
    await mkdir('test-results',{recursive:true});
    const page=await env.browser.newPage({viewport:{width:1120,height:720}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.goto(env.url);
    const stats=await page.evaluate(async()=>{
      const {Game}=await import('./game.js'),{ROUTE_LENGTH}=await import('./avenue-route.js');
      const game=window.avenueDemo=new Game(document.querySelector('#game'));
      await Promise.all([game.characterReady,game.officerReady]);
      game.setQuality('balanced');game.start();game.nextSpawn=Infinity;
      document.querySelector('#quality').value='balanced';
      document.querySelector('#overlay').classList.add('hidden');document.querySelector('#cam').style.display='none';
      const samples=[];
      for(let distance=0;distance<ROUTE_LENGTH;distance+=24){
        game.world.update(0,distance);
        let meshes=0,triangles=0;
        for(const b of game.world.buildings)if(b.group.visible)b.group.traverseVisible(m=>{
          if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}
        });
        samples.push({distance,meshes,triangles});
      }
      return {samples,avgMeshes:samples.reduce((n,s)=>n+s.meshes,0)/samples.length,maxMeshes:Math.max(...samples.map(s=>s.meshes)),avgTriangles:samples.reduce((n,s)=>n+s.triangles,0)/samples.length,maxTriangles:Math.max(...samples.map(s=>s.triangles))};
    });
    for(const [name,distance] of [['costa',0],['bendu',36],['ypf',940],['maderera',1900],['tecnica-5',1970]]){
      await page.evaluate(async distance=>{
        const {routeState}=await import('./avenue-route.js');
        const g=window.avenueDemo;g.distance=distance;g.time=1;g.update(0);
        const route=routeState(distance);
        document.querySelector('#route-zone').textContent=`${route.zone} · Vuelta ${route.lap}`;
      },distance);
      await page.screenshot({path:`test-results/jb-justo-${name}.png`,timeout:60000});
    }
    for(const [name,distance,targetZ] of [['bendu',0,-58],['maderera',1900,-43],['tecnica-5',1970,-34]]){
      await page.evaluate(async({distance,targetZ})=>{
        const {routeState}=await import('./avenue-route.js');
        const g=window.avenueDemo;g.distance=distance;g.update(0);
        const route=routeState(distance);
        document.querySelector('#route-zone').textContent=`${route.zone} · Vuelta ${route.lap}`;
        g.camera.position.set(7,13,12);g.camera.lookAt(-17,8,targetZ);
        g.renderer.render(g.scene,g.camera);
      },{distance,targetZ});
      await page.screenshot({path:`test-results/jb-justo-${name}-detalle.png`,timeout:60000});
    }
    if(errors.length)throw Error(errors.join('\n'));
    await writeFile('test-results/avenue-after.json',JSON.stringify(stats,null,2));
    let before;try{before=JSON.parse(await readFile('test-results/avenue-before.json','utf8'));}catch{}
    console.log(JSON.stringify({avgMeshes:stats.avgMeshes,maxMeshes:stats.maxMeshes,avgTriangles:stats.avgTriangles,maxTriangles:stats.maxTriangles,
      ...(before?{meshChangePercent:(stats.avgMeshes/before.avgMeshes-1)*100,triangleChangePercent:(stats.avgTriangles/before.avgTriangles-1)*100}:{})},null,2));
  }finally{await env.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
