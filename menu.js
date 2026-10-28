import { GameMusic } from './music.js';

const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let context=null,enabled=read('menuSound',true),volume=read('menuVolume',.55),lastHover=0;
export const backgroundMusic=new GameMusic();
backgroundMusic.setPreferences(enabled,volume);
export function sound(kind='click'){
 if(!enabled||!context||context.state!=='running')return;
 const notes={hover:[330],click:[430,650],start:[330,440,660],coin:[880,1320],jump:[300,600],duck:[250,150],lose:[260,180,100]};
 (notes[kind]||notes.click).forEach((hz,i)=>{const t=context.currentTime+i*.065,osc=context.createOscillator(),gain=context.createGain();osc.type=kind==='coin'?'sine':'triangle';osc.frequency.setValueAtTime(hz,t);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.09*volume,t+.009);gain.gain.exponentialRampToValueAtTime(.001,t+.11);osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+.13);});
}
function unlock(){if(!enabled)return;backgroundMusic.unlock();try{context??=new (window.AudioContext||window.webkitAudioContext)();context.resume().catch(()=>{});}catch{}}
export const characters=[
 {id:'technical-student',name:'El pibe',image:'teen.png',description:'Remera negra · zapatillas blancas'},
 {id:'classic-student',name:'El técnico',image:'classic.png',description:'Guardapolvo azul · listo para el taller'},
 {id:'hoodie-student',name:'La del buzo',image:'hoodie.png',description:'Buzo gris · paso decidido'},
 {id:'phone-student',name:'La conectada',image:'smartphone.png',description:'Remera negra · siempre en línea'},
];
export function initMenu(game,session){
 let selected='technical-student';try{selected=localStorage.getItem('runnerCharacter')||selected;}catch{}
 $('selected-name').textContent=characters.find(c=>c.id===selected)?.name||'El pibe';
 document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
 document.addEventListener('pointerover',e=>{if(e.target.closest('button')&&performance.now()-lastHover>100){lastHover=performance.now();sound('hover');}});
 document.addEventListener('click',e=>{if(e.target.closest('button'))sound('click');});
 const syncSound=()=>{backgroundMusic.setPreferences(enabled,volume);const b=$('sound-toggle');b.setAttribute('aria-pressed',String(enabled));b.setAttribute('aria-label',enabled?'Desactivar sonido':'Activar sonido');b.querySelector('span').textContent=enabled?'SONIDO ON':'SONIDO OFF';};syncSound();
 $('sound-toggle').onclick=()=>{enabled=!enabled;save('menuSound',enabled);if(enabled)unlock();syncSound();};
 $('sound-volume').value=Math.round(volume*100);$('sound-volume').oninput=e=>{volume=Number(e.target.value)/100;save('menuVolume',volume);backgroundMusic.setPreferences(enabled,volume);};
 const open=id=>{const d=$(id);if(!d.open)d.showModal();};
 $('settingsBtn').onclick=()=>open('settings-dialog');
 const showCharacters=()=>open('characters-dialog');$('charactersBtn').onclick=showCharacters;$('quick-character').onclick=showCharacters;
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 document.querySelectorAll('.menu-dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
 for(const c of characters){const b=document.createElement('button');b.className='character-card';b.setAttribute('aria-pressed',String(c.id===selected));b.dataset.character=c.id;
  const img=document.createElement('img');img.src='assets/menu/'+c.image;img.alt=c.name;const name=document.createElement('strong');name.textContent=c.name;const desc=document.createElement('span');desc.textContent=c.description;b.append(img,name,desc);
  b.onclick=()=>{if(c.id===selected){$('characters-dialog').close();return;}try{localStorage.setItem('runnerCharacter',c.id);}catch{$('character-status').textContent='No se pudo guardar la selección en este navegador.';return;}$('character-status').textContent='Cargando '+c.name+'…';b.disabled=true;location.reload();};$('character-grid').append(b);
 }
 const achievements=[['Primer recreo',100,'Sumá 100 puntos.'],['Llegás a tiempo',500,'Sumá 500 puntos.'],['Leyenda de la Técnica',2000,'Sumá 2.000 puntos.']];
 const drawAchievements=()=>{const best=read('menuBest',0);$('achievement-list').replaceChildren();for(const [name,goal,desc] of achievements){const row=document.createElement('div');row.className='achievement'+(best>=goal?' earned':'');const icon=document.createElement('img');icon.src='assets/menu/icons/trophy.svg';icon.alt=best>=goal?'Desbloqueado':'Pendiente';const content=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=name;p.textContent=desc+' '+Math.min(best,goal)+' / '+goal;content.append(h,p);row.append(icon,content);$('achievement-list').append(row);}};
 $('achievementsBtn').onclick=()=>{drawAchievements();open('achievements-dialog');};
 window.addEventListener('runner:gameover',e=>{save('menuBest',Math.max(read('menuBest',0),Math.floor(e.detail.score)));sound('lose');});
 const home=document.createElement('button');home.id='return-menu';home.textContent='Volver al menú';home.onclick=()=>{window.dispatchEvent(new Event('runner:menu'));session.cancel();session.pending=session.manual=false;game.reset();$('pause').classList.add('hidden');$('overlay').classList.remove('hidden');};document.querySelector('.pause-box').append(home);
}
