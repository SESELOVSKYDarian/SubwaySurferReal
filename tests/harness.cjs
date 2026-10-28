const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function harness(){
 const server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   const content=await readFile(file);
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.mjs':'text/javascript','.wasm':'application/wasm','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':type});res.end(content);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({
   executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
   args:[...(process.env.FAKE_CAMERA==='1'?['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']:[]),...(process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[]),...(process.env.SOFTWARE_WEBGL==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])],
  });
 }catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
 return {browser,url:`http://127.0.0.1:${server.address().port}`,async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={harness};
