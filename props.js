import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from './materials.js';

// Pieza acuñada: canto estriado, borde biselado y denominación en relieve.
// Toda la geometría se comparte entre las instancias; no necesita textura brillante.
export function mintCoin() {
  const parts = [];
  const profile = [[0,-.042],[.347,-.042],[.375,-.032],[.38,-.018],
    [.38,.018],[.375,.032],[.347,.042],[0,.042]].map(([r,y])=>new THREE.Vector2(r,y));
  parts.push(new THREE.LatheGeometry(profile,32).rotateX(Math.PI/2));
  const numeral = new THREE.Shape();
  numeral.moveTo(-.10,.10);numeral.lineTo(.01,.21);numeral.lineTo(.085,.21);
  numeral.lineTo(.085,-.15);numeral.lineTo(.15,-.15);numeral.lineTo(.15,-.21);
  numeral.lineTo(-.10,-.21);numeral.lineTo(-.10,-.15);numeral.lineTo(.005,-.15);
  numeral.lineTo(.005,.10);numeral.lineTo(-.055,.045);numeral.closePath();
  for(const side of [-1,1]) {
    parts.push(new THREE.TorusGeometry(.327,.012,4,40).translate(0,0,side*.045));
    const stamp=new THREE.ExtrudeGeometry(numeral,{depth:.008,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.005,bevelThickness:.003});
    if(side<0)stamp.rotateY(Math.PI);
    stamp.translate(0,0,side*.043);parts.push(stamp);
  }
  for(let i=0;i<32;i++){
    const angle=i*Math.PI*2/32;
    parts.push(new THREE.BoxGeometry(.009,.033,.012).rotateZ(angle).translate(Math.sin(angle)*.378,Math.cos(angle)*.378,0));
  }
  // Box/Lathe/Torus/Extrude ofrecen los mismos atributos; unificar índices.
  const plain=parts.map((geometry,index)=>{
    const copy=geometry.index?geometry.toNonIndexed():geometry.clone();
    // Pátina en el número y en el campo, borde pulido: el relieve se distingue
    // incluso cuando la cara refleja el cielo y la moneda ocupa pocos píxeles.
    const tint=new THREE.Color(index===2||index===4?0x76603a:index===0?0xd4c49b:0xffe5b0);
    const colors=new Float32Array(copy.attributes.position.count*3);
    for(let i=0;i<copy.attributes.position.count;i++)tint.toArray(colors,i*3);
    copy.setAttribute('color',new THREE.BufferAttribute(colors,3));
    return copy;
  });
  const geometry=mergeGeometries(plain);
  parts.forEach(part=>part.dispose());plain.forEach(part=>part.dispose());
  geometry.name='MintedCoin';
  const material=new THREE.MeshStandardMaterial({color:0xb9903d,vertexColors:true,metalness:1,roughness:.5,
    ...surface('metal'),envMapIntensity:1.15});
  material.name='BrushedGold';
  const farGeometry=new THREE.LatheGeometry([[0,-.04],[.35,-.04],[.38,0],[.35,.04],[0,.04]].map(([r,y])=>new THREE.Vector2(r,y)),12).rotateX(Math.PI/2);
  farGeometry.name='DistantCoin';
  const farColors=new Float32Array(farGeometry.attributes.position.count*3).fill(1);
  farGeometry.setAttribute('color',new THREE.BufferAttribute(farColors,3));
  return {geometry,farGeometry,material};
}

export function buildShepherd() {
  const root=new THREE.Group();root.name='Shepherd';
  const fur=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.92,...surface('fur')});
  const tan=new THREE.MeshStandardMaterial({color:0x866144,roughness:.92,...surface('fur')});
  const dark=new THREE.MeshStandardMaterial({color:0x211d19,roughness:.78});
  const add=(parent,geometry,material,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  };
  const bodyParts=[
    new THREE.CapsuleGeometry(.23,.47,5,12).rotateX(Math.PI/2).translate(0,.64,.02),
    new THREE.SphereGeometry(.23,12,8).scale(1,1.25,1).translate(0,.64,-.25),
    new THREE.SphereGeometry(.21,12,8).translate(0,.62,.36),
    new THREE.CapsuleGeometry(.15,.22,5,12).rotateX(-.45).translate(0,.88,-.34),
  ];
  const geometries=bodyParts.map(geometry=>geometry.index?geometry.toNonIndexed():geometry.clone());
  const body=mergeGeometries(geometries);
  bodyParts.forEach(geometry=>geometry.dispose());geometries.forEach(geometry=>geometry.dispose());
  const positions=body.attributes.position;const colors=new Float32Array(positions.count*3);
  const color=new THREE.Color(),brown=new THREE.Color(0x9e7650),black=new THREE.Color(0x2b2722);
  for(let i=0;i<positions.count;i++){
    const saddle=THREE.MathUtils.smoothstep(positions.getY(i),.63,.82)*THREE.MathUtils.smoothstep(positions.getZ(i),-.35,0);
    color.copy(brown).lerp(black,saddle);color.toArray(colors,i*3);
  }
  body.setAttribute('color',new THREE.BufferAttribute(colors,3));add(root,body,fur,0,0,0);
  add(root,new THREE.SphereGeometry(.16,14,10),tan,0,1.03,-.47).scale.set(.85,1,1.15);
  add(root,new THREE.CapsuleGeometry(.08,.16,4,10).rotateX(Math.PI/2),tan,0,.99,-.64).scale.x=.8;
  add(root,new THREE.SphereGeometry(.06,10,8),dark,0,.995,-.78).scale.set(.85,.65,.65);
  for(const side of [-1,1]){
    add(root,new THREE.ConeGeometry(.075,.25,4),dark,side*.105,1.24,-.45).rotation.z=-side*.12;
    add(root,new THREE.SphereGeometry(.018,8,6),dark,side*.112,1.065,-.59);
  }
  const legs=[];
  for(const [x,z] of [[-.14,-.28],[.14,-.28],[-.14,.34],[.14,.34]]){
    const pivot=new THREE.Group();pivot.position.set(x,.57,z);root.add(pivot);
    add(pivot,new THREE.CapsuleGeometry(.065,.20,4,8),tan,0,-.12,0);
    add(pivot,new THREE.CapsuleGeometry(.043,.21,4,8),tan,0,-.36,.025);
    add(pivot,new THREE.SphereGeometry(.07,10,6),dark,0,-.51,-.035).scale.set(.8,.5,1.4);
    legs.push(pivot);
  }
  const tail=new THREE.Group();tail.position.set(0,.67,.48);root.add(tail);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(),new THREE.Vector3(0,-.08,.22),new THREE.Vector3(0,-.30,.43),new THREE.Vector3(0,-.35,.53)]);
  add(tail,new THREE.TubeGeometry(curve,8,.055,7,false),dark,0,0,0);
  return {root,legs,tail};
}
