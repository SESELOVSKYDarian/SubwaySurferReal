const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const {once}=require('node:events');
const readline=require('node:readline');
const python=process.env.PYTHON_PATH||(process.platform==='win32'?'python':'python3');
const script=path.resolve(__dirname,'../tools/audio_playlist.py');

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'audio-playlist-'));
 const folder=path.join(root,'assets','audio');fs.mkdirSync(folder,{recursive:true});
 return {root,folder,clean(){
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('audio-playlist-'));
  fs.rmSync(root,{recursive:true,force:true});
 }};
}
function run(command,args,cwd){
 const result=spawnSync(command,args,{cwd,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||String(result.error));return result.stdout;
}
const read=f=>JSON.parse(fs.readFileSync(path.join(f.folder,'playlist.json'),'utf8')).tracks;

test('lista MP3: nombres con espacios, signos, Unicode, subcarpetas y extensiones en mayúsculas',()=>{
 const f=fixture();
 try{
  for(const name of ['A.mp3','Canción #1 😎.MP3','notes.txt','playlist.json'])fs.writeFileSync(path.join(f.folder,name),'');
  fs.mkdirSync(path.join(f.folder,'extra'));fs.writeFileSync(path.join(f.folder,'extra','tema%.mp3'),'');
  run(python,[script,'--root',f.root],f.root);
  assert.deepEqual(read(f).map(decodeURIComponent),['A.mp3','Canción #1 😎.MP3','extra/tema%.mp3']);
  assert.ok(read(f)[1].includes('%23'));
 }finally{f.clean();}
});

test('lista del commit: incluye solo MP3 añadidos al índice y refleja bajas',()=>{
 const f=fixture();
 try{
  run('git',['init','--quiet'],f.root);
  fs.writeFileSync(path.join(f.folder,'incluido.mp3'),'a');fs.writeFileSync(path.join(f.folder,'sin-subir.mp3'),'b');
  run('git',['add','--','assets/audio/incluido.mp3'],f.root);
  run(python,[script,'--root',f.root,'--staged','--stage'],f.root);
  assert.deepEqual(read(f),['incluido.mp3']);
  assert.deepEqual(JSON.parse(run('git',['show',':assets/audio/playlist.json'],f.root)).tracks,['incluido.mp3']);
  run('git',['rm','--cached','--','assets/audio/incluido.mp3'],f.root);
  run(python,[script,'--root',f.root,'--staged','--stage'],f.root);assert.deepEqual(read(f),[]);
 }finally{f.clean();}
});

test('servidor local: detecta altas y bajas sin reiniciar ni editar la lista',{timeout:15000},async()=>{
 const f=fixture();let server;
 try{
  const code=`import sys, functools, http.server;sys.path.insert(0,${JSON.stringify(path.dirname(script))});from serve import NoCache;s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(NoCache,directory=${JSON.stringify(f.root)}));print(s.server_address[1],flush=True);s.serve_forever()`;
  server=spawn(python,['-u','-c',code],{stdio:['ignore','pipe','ignore']});
  const lines=readline.createInterface({input:server.stdout});
  const [port]=await once(lines,'line'),url=`http://127.0.0.1:${port}/assets/audio/playlist.json`;
  const first=await fetch(url);assert.deepEqual((await first.json()).tracks,[]);
  assert.match(first.headers.get('cache-control'),/no-store/);
  fs.writeFileSync(path.join(f.folder,'nueva # canción.MP3'),'a');
  const next=await (await fetch(url)).json();assert.deepEqual(next.tracks.map(decodeURIComponent),['nueva # canción.MP3']);
  fs.unlinkSync(path.join(f.folder,'nueva # canción.MP3'));
  assert.deepEqual((await (await fetch(url)).json()).tracks,[]);
  lines.close();
 }finally{
  if(server&&server.exitCode===null){server.kill();await once(server,'exit');}
  f.clean();
 }
});
