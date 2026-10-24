import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from './materials.js';

// Prototipos estáticos: se fusionan por material una sola vez, luego se comparten.
export function schoolProps() {
  const metal = new THREE.MeshStandardMaterial({ color: 0x5b6461, metalness: .75, roughness: .65, ...surface('metal') });
  const edge = new THREE.MeshStandardMaterial({ color: 0x202528, roughness: .8 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xdddcd2, roughness: .85 });
  const green = new THREE.MeshStandardMaterial({ color: 0x158f67, metalness: .15, roughness: .4 });
  const wood = new THREE.MeshStandardMaterial({ name: 'SchoolGreen', map: woodTexture(), roughness: .82,
    emissive: 0x07551a, emissiveIntensity: .22, ...surface('wood') });
  const deskMetal = new THREE.MeshStandardMaterial({ name: 'GreenDeskFrame', color: 0x52a84e, roughness: .75, metalness: .25 });
  const pencil = new THREE.MeshStandardMaterial({ color: 0x7c8581, roughness: .95 });
  const make = (name, build) => {
    const batches = new Map();
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
      geo.rotateX(rx).rotateZ(rz).translate(x,y,z);
      const plain = geo.index ? geo.toNonIndexed() : geo.clone();geo.dispose();
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(plain);
    };
    const box = (w,h,d) => new THREE.BoxGeometry(w,h,d);
    build(add, box);
    const group = new THREE.Group();group.name = name;
    for (const [mat, parts] of batches) {
      const geometry = mergeGeometries(parts);parts.forEach(p=>p.dispose());
      const mesh = new THREE.Mesh(geometry, mat);mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  };
  const board = make('DraftingBoard', (add, box) => {
    // Superficie inclinada, canto oscuro, regla paralela verde y patas plegables.
    const tilt = .38, y = .70;
    add(new RoundedBoxGeometry(1.92,.055,1.08,1,.018),edge,0,y,0,tilt);
    const top = (geo,mat,x,z,height) => add(geo,mat,x,
      y-Math.sin(tilt)*z+Math.cos(tilt)*height,
      Math.cos(tilt)*z+Math.sin(tilt)*height,tilt);
    top(box(1.84,.009,1.00),paper,0,0,.035);
    top(box(1.87,.025,.075),green,0,.09,.052);
    for (const x of [-.83,.83]) {
      add(box(.035,.68,.035),metal,x,.34,.12,-.32);
      add(box(.035,.65,.035),metal,x,.34,-.18,.36);
      add(box(.14,.025,.58),edge,x,.018,0);
      for(const z of [-.43,.45])add(new THREE.CylinderGeometry(.023,.023,.025,10),metal,x,y+Math.sin(-tilt)*z+.04,z);
    }
    // Líneas técnicas y marcas de escala en vez de una superficie vacía.
    for(let i=0;i<16;i++)top(box(.004,.004,i%5===0?.035:.018),paper,-.72+i*.095,.09,.066);
    for(const z of [-.29,-.13])top(box(.50,.003,.003),pencil,-.30,z,.041);
    top(box(.003,.003,.16),pencil,-.55,-.21,.041);
  });
  const desk = make('BrokenSchoolDesk', (add, box) => {
    // Pasillo libre bajo el tablero: las patas quedan en los extremos del carril.
    for (const x of [-.98,.98]) {
      for(const z of [-.29,.29])add(box(.055,1.55,.055),deskMetal,x,.775,z,0,x*.025);
      add(box(.055,.06,.66),deskMetal,x,.10,0);
      add(box(.055,.06,.63),deskMetal,x,1.43,0);
    }
    add(box(2.08,.09,.24),wood,0,1.55,-.24);
    add(box(.86,.085,.28),wood,-.60,1.55,.04,0,-.025);
    add(box(.91,.085,.25),wood,.57,1.54,.06,0,.035);
    add(box(1.84,.085,.13),wood,-.04,1.55,.27);
    // Astillas geométricas alrededor del hueco central; sin piezas bajo el jugador.
    for(const [x,z,a] of [[-.13,-.02,.22],[.13,.12,-.3],[-.23,.18,.08]])
      add(box(.20,.035,.055),wood,x,1.56,z,0,a);
    for(const x of [-.9,.9])for(const z of [-.22,.24])
      add(new THREE.CylinderGeometry(.017,.017,.012,8),deskMetal,x,1.60,z);
  });
  return {board, desk};
}

function woodTexture() {
  const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');
  g.fillStyle='#329947';g.fillRect(0,0,512,256);
  let seed=93;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<180;i++){
    g.strokeStyle=`rgba(${i%2?'10,47,19':'161,214,108'},${.06+random()*.18})`;
    g.beginPath();const y=random()*256;g.moveTo(0,y);g.bezierCurveTo(160,y+random()*8,350,y-random()*7,512,y+random()*4);g.stroke();
  }
  g.lineWidth=2;
  for(let i=0;i<36;i++){g.strokeStyle=i%3?'#b9a47f':'#38342a';g.beginPath();const x=random()*512,y=random()*256;g.moveTo(x,y);g.lineTo(x+random()*80-40,y+random()*18);g.stroke();}
  g.font='italic 18px sans-serif';g.fillStyle='#343a35';g.fillText('TÉCNICA · 6°',120,170);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
