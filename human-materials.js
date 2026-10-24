import * as THREE from 'three';
let knit;
// Small knit loops, not a square grid. Physical relief stays below a millimetre.
export function knitSurface(){
 if(knit)return knit;
 const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
 g.fillStyle='#808080';g.fillRect(0,0,512,512);g.lineWidth=1;
 for(let y=-8;y<520;y+=8)for(let x=-8;x<520;x+=8){
  const shift=(Math.floor(y/8)%2)*4;
  g.strokeStyle='#b4b4b4';g.beginPath();g.moveTo(x+shift,y);g.quadraticCurveTo(x+shift+7,y+5,x+shift+2,y+8);g.stroke();
  g.strokeStyle='#666';g.beginPath();g.moveTo(x+shift+2,y);g.quadraticCurveTo(x+shift-3,y+4,x+shift+2,y+8);g.stroke();
 }
 const bump=new THREE.CanvasTexture(c);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.anisotropy=4;
 knit={bumpMap:bump,bumpScale:.0005,roughness:.92,roughnessMap:null};return knit;
}
