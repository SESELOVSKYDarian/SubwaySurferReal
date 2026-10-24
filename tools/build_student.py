"""Build the local technical-school character from the CC0 MakeHuman base.
Run with Python 3 + numpy. No Blender, server or remote assets at game runtime.
Garment, rig and accessories are authored here; no soldier geometry is retained.
"""
import gzip,json,math,struct,pathlib,sys
HIGH = '--low' not in sys.argv
TEACHER = '--professor' in sys.argv
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
verts=[];texcoords=[];groups={};uv_groups={};name=''
with gzip.open(ROOT/'assets/characters/source/makehuman-base.obj.gz','rt') as file:
 for line in file:
  if line.startswith('v '):verts.append(list(map(float,line.split()[1:4])))
  elif line.startswith('vt '):texcoords.append(list(map(float,line.split()[1:3])))
  elif line.startswith('g '):name=line[2:].strip();groups.setdefault(name,[]);uv_groups.setdefault(name,[])
  elif line.startswith('f '):
   groups[name].append([int(x.split('/')[0])-1 for x in line.split()[1:]])
   uv_groups[name].append([texcoords[int(x.split('/')[1])-1] for x in line.split()[1:]])
V=np.array(verts)
if TEACHER:
 for target,weight in [('caucasian-male-old',.65),('caucasian-male-young',.35),('universal-male-old-averagemuscle-maxweight',.18),('universal-male-young-averagemuscle-maxweight',.10)]:
  with gzip.open(ROOT/'assets/characters/source/realism'/(target+'.target.gz'),'rt') as f:
   for line in f:
    tokens=line.split()
    if len(tokens)==4 and tokens[0].isdigit():V[int(tokens[0])]+=np.array(list(map(float,tokens[1:])))*weight
minimum=min(V[i,1] for face in groups['body'] for i in face)
S=2.03/(max(V[i,1] for face in groups['body'] for i in face)-minimum)
def convert(p):
 q=np.array([p[0]*S,(p[1]-minimum)*S,-p[2]*S])
 if TEACHER:
  y=q[1]
  if y>1.72:
   jaw=math.exp(-((y-1.84)/.09)**2)
   q[0]*=1.03+.025*jaw
   # Nariz y mentón más definidos, con mejillas y mandíbula más anchas.
   if q[2]<-.055:
    q[2]-=.013*math.exp(-(q[0]/.038)**2)*math.exp(-((y-1.845)/.035)**2)
  else:q[0]*=1.02 if y>1.05 else 1.02
 return q
def joint(name):
 ids={i for face in groups[name] for i in face};return convert(V[list(ids)].mean(axis=0))
bones=[];positions=[];parents=[]
def bone(name,p,parent=None):
 bones.append(name);positions.append(np.array(p));parents.append(bones.index(parent) if parent else None)
 return len(bones)-1
bone('Hips',joint('joint-pelvis'))
bone('Spine',joint('joint-spine-3'),'Hips')
bone('Spine2',joint('joint-spine-1'),'Spine')
bone('Neck',joint('joint-neck'),'Spine2')
bone('Head',joint('joint-head'),'Neck')
for side,short in [('Left','l'),('Right','r')]:
 bone(side+'Arm',joint('joint-'+short+'-shoulder'),'Spine2')
 bone(side+'ForeArm',joint('joint-'+short+'-elbow'),side+'Arm')
 bone(side+'Hand',joint('joint-'+short+'-hand'),side+'ForeArm')
 bone(side+'UpLeg',joint('joint-'+short+'-upper-leg'),'Hips')
 bone(side+'Leg',joint('joint-'+short+'-knee'),side+'UpLeg')
 bone(side+'Foot',joint('joint-'+short+'-ankle'),side+'Leg')
 bone(side+'ToeBase',joint('joint-'+short+'-foot-1'),side+'Foot')
B={name:i for i,name in enumerate(bones)}
materials=[]
def mat(name,color,rough=.8,double=False):
 materials.append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':0,'roughnessFactor':rough},'doubleSided':double});return len(materials)-1
skin=mat('Skin',[.58,.35,.23],.8);coat=mat('StudentCoat',[.025,.055,.13],.92,True)
shirt=mat('Shirt',[.73,.74,.69],.9);pants=mat('Trousers',[.025,.035,.055],.95)
shoe=mat('Shoes',[.015,.017,.019],.72);hair=mat('Hair',[.035,.021,.014],.95)
eye=mat('EyeWhite',[.65,.67,.62],.4);iris=mat('Iris',[.075,.045,.025],.35)
pupil=mat('Pupil',[.005,.004,.003],.3);buttons=mat('Buttons',[.01,.015,.025],.55)
if TEACHER:
 materials[skin]['pbrMetallicRoughness']['baseColorFactor']=[.64,.46,.37,1]
 materials[coat].update(name='TeacherSweater')
 materials[coat]['pbrMetallicRoughness']['baseColorFactor']=[.045,.067,.035,1]
 materials[shoe]['pbrMetallicRoughness']['baseColorFactor']=[.105,.073,.040,1]
 materials[pants]['pbrMetallicRoughness']['baseColorFactor']=[.010,.012,.014,1]
 materials[hair].update(name='GrayHair')
 materials[hair]['pbrMetallicRoughness']['baseColorFactor']=[.37,.39,.36,1]
 beard=mat('GrayBeard',[.37,.39,.36],.95)
 frames=mat('GlassesFrames',[.012,.014,.016],.36)
 cap=mat('PoliceCap',[.012,.023,.050],.82)
 visor=mat('PoliceVisor',[.008,.011,.014],.42,True)
 gold=mat('PoliceBadge',[.55,.35,.075],.4,True)
 materials[gold]['pbrMetallicRoughness']['metallicFactor']=.65
 rib=mat('SweaterRib',[.032,.048,.026],.95,True)
 lens=mat('GlassesLenses',[.65,.73,.78],.18,True)
 materials[lens]['pbrMetallicRoughness']['baseColorFactor'][3]=.075
 materials[lens]['alphaMode']='BLEND'
# Each primitive owns topology and UVs; bones use model axes and local translations.
primitives={}
if TEACHER:exec((ROOT/'tools/professor_realism.py').read_text(),globals())
def refine_skin(points, faces):
 # Una pasada Catmull-Clark conserva la anatomía y suaviza cara/manos.
 P=np.asarray(points,dtype=np.float64);centers=np.array([P[f].mean(axis=0) for f in faces])
 edges={};adj=[[] for _ in P]
 for fi,f in enumerate(faces):
  for i,a in enumerate(f):
   b=f[(i+1)%len(f)];edges.setdefault(tuple(sorted((a,b))),[]).append(fi);adj[a].append(fi)
 output=P.copy();neighbors=[[] for _ in P];boundary=[[] for _ in P]
 for (a,b),fs in edges.items():
  neighbors[a].append(b);neighbors[b].append(a)
  if len(fs)==1:boundary[a].append(b);boundary[b].append(a)
 for i,p in enumerate(P):
  if len(boundary[i])==2:target=.75*p+.125*P[boundary[i]].sum(axis=0)
  elif neighbors[i]:
   n=len(neighbors[i]);F=centers[list(set(adj[i]))].mean(axis=0);R=((P[neighbors[i]]+p)/2).mean(axis=0)
   target=(F+2*R+(n-3)*p)/n
  else:target=p
  # Mantener los rasgos del original en los ojos y la boca.
  output[i]=p*.55+target*.45
 points=list(output);edge_ids={}
 for (a,b),fs in edges.items():
  edge_ids[(a,b)]=len(points)
  points.append((P[a]+P[b]+centers[fs].sum(axis=0))/4 if len(fs)==2 else (P[a]+P[b])/2)
 face_ids=[]
 for c in centers:face_ids.append(len(points));points.append(c)
 result=[]
 for fi,f in enumerate(faces):
  for i,a in enumerate(f):
   prev=f[(i-1)%len(f)];nxt=f[(i+1)%len(f)]
   result.append([a,edge_ids[tuple(sorted((a,nxt)))],face_ids[fi],edge_ids[tuple(sorted((prev,a)))]])
 return points,result
def addmesh(label,points,faces,material,weights,uvs=None):
 if HIGH and label=='Human' and material==skin:
  if TEACHER:
   head_ids=[i for i,f in enumerate(faces) if min(points[k][1] for k in f)>1.55]
   rest_ids=[i for i in range(len(faces)) if i not in set(head_ids)]
   head=[faces[i] for i in head_ids];rest=[faces[i] for i in rest_ids]
   if isinstance(weights,np.ndarray):weights=refined_weights(weights,head)
   if uvs is not None:
    points,head,huv=refine_uv(points,head,[uvs[i] for i in head_ids]);uvs=huv+[uvs[i] for i in rest_ids]
   else:points,head=refine_skin(points,head)
   faces=head+rest
  else:points,faces=refine_skin(points,faces)
 P=np.array(points,dtype=np.float32);F=[]
 for f in faces:
  for k in range(1,len(f)-1):F.append([f[0],f[k],f[k+1]])
 F=np.array(F,dtype=np.uint32);N=np.zeros_like(P)
 for tri in F:
  n=np.cross(P[tri[1]]-P[tri[0]],P[tri[2]]-P[tri[0]])
  for i in tri:N[i]+=n
 N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-8)
 if uvs is not None:
  P,N,F,custom_uv,split_indices=split_uv(P,N,faces,uvs)
  if isinstance(weights,np.ndarray):weights=weights[split_indices]
 J=np.zeros((len(P),4),np.uint16);W=np.zeros((len(P),4),np.float32)
 for i,p in enumerate(P):
  ws={name:float(w) for name,w in zip(bones,weights[i]) if w>1e-7} if isinstance(weights,np.ndarray) else weights(p) if callable(weights) else weights
  total=sum(ws.values())
  for k,(bn,w) in enumerate(sorted(ws.items(),key=lambda x:-x[1])[:4]):J[i,k]=B[bn];W[i,k]=w/total
  W[i]/=max(W[i].sum(),1e-8)
 UV=custom_uv if uvs is not None else np.stack([P[:,0]*4,P[:,1]*4],axis=1).astype(np.float32)
 if TEACHER and material==beard:
  shift=joint('joint-mouth')[1]-1.8342309816374425
  UV=np.stack([(P[:,0]+.12)/.24,(P[:,1]-1.72-shift)/.16],axis=1).astype(np.float32)
 primitives.setdefault(label,[]).append((P,N,F,J,W,UV,material))
 if TEACHER and label=='Human' and material==skin:
  mouth=joint('joint-mouth').copy();mouth[1]-=.040; jaw=joint('joint-jaw')
  chosen=[]
  for tri in F:
   c=P[tri].mean(axis=0);n=N[tri].mean(axis=0)
   beard_top=mouth[1]+.008+.040*min(abs(c[0])/.10,1)
   in_beard=(jaw[1]-.012<c[1]<beard_top and abs(c[0])<.108 and c[2]<-.07 and n[2]<.30)
   leave_lips=abs(c[0])<.035 and mouth[1]-.012<c[1]<mouth[1]+.012
   moustache=abs(c[0])<.05 and mouth[1]+.014<c[1]<mouth[1]+.031 and c[2]<-.08 and n[2]<.25
   if (in_beard and not leave_lips) or moustache:chosen.append(tri)
  ids=sorted({int(i) for tri in chosen for i in tri});mapping={i:k for k,i in enumerate(ids)}
  if ids:addmesh('FacialHair',P[ids]+N[ids]*.0035,[[mapping[int(i)] for i in f] for f in chosen],beard,fixed('Head'))
def fixed(name):return {name:1.}
def blend(p,choices):
 scores={}
 for name,end in choices:
  a=positions[B[name]];b=positions[B[end]];d=b-a;t=np.clip(np.dot(p-a,d)/max(np.dot(d,d),1e-8),0,1)
  distance=np.linalg.norm(p-(a+t*d));scores[name]=1/(.015+distance)**4
 top=sorted(scores.items(),key=lambda x:-x[1])[:3];return dict(top)
def skinweights(p):
 if p[1]>1.80:return fixed('Head')
 if p[1]>1.60:return fixed('Neck')
 if TEACHER and abs(p[0])>.33 and p[1]<1.55:
  side='Left' if p[0]>0 else 'Right'
  if abs(p[0])>.61:return fixed(side+'Hand')
  return blend(p,[(side+'Arm',side+'ForeArm'),(side+'ForeArm',side+'Hand')])
 if abs(p[0])>.45:return fixed(('Left' if p[0]>0 else 'Right')+'Hand')
 side='Left' if p[0]>0 else 'Right'
 if p[1]<.16:return fixed(side+'Foot')
 return blend(p,[(side+'UpLeg',side+'Leg'),(side+'Leg',side+'Foot')])
# The covered torso and upper thighs are omitted. There is no bare body under the coat.
for material in [skin,pants]:
 faces=[];selected_uv=[]
 for f,face_uv in zip(groups['body'],uv_groups['body']):
  center=V[f].mean(axis=0);p=convert(center)
  exposed=(p[1]>1.72 or (p[1]>1.63 and abs(p[0])<.115) or (abs(p[0])>.47 and p[1]<1.43)) if TEACHER else (p[1]>1.72 or (abs(p[0])>.50 and p[1]<1.37))
  if (material==skin and exposed) or (material==pants and .14<p[1]<(1.01 if TEACHER else .77)):
   faces.append(list(reversed(f)));selected_uv.append(list(reversed(face_uv)))
 ids=sorted({i for f in faces for i in f});mapping={idx:i for i,idx in enumerate(ids)}
 points=[convert(V[i]) for i in ids]
 weights=anatomy_weights[ids] if TEACHER else skinweights
 addmesh('Human',points,[[mapping[i] for i in f] for f in faces],material,weights,selected_uv if TEACHER and material==skin else None)
if not TEACHER:
 # Actual eye surfaces, not painted dots on a helmet.
 for short in ['l','r']:
  fs=groups['helper-'+short+'-eye'];ids=sorted({i for f in fs for i in f});mapping={idx:i for i,idx in enumerate(ids)}
  addmesh('Face',[convert(V[i]) for i in ids],[[mapping[i] for i in reversed(f)] for f in fs],eye,fixed('Head'))
def sphere(label,center,radii,material,weights,segments=16,rings=10):
 points=[];faces=[]
 for y in range(rings+1):
  a=math.pi*y/rings
  for x in range(segments):
   b=2*math.pi*x/segments;points.append(np.array(center)+np.array([math.sin(a)*math.cos(b),math.cos(a),math.sin(a)*math.sin(b)])*radii)
 for y in range(rings):
  for x in range(segments):
   a=y*segments+x;b=y*segments+(x+1)%segments;c=b+segments;d=a+segments;faces.append([a,b,c,d])
 addmesh(label,points,faces,material,weights)
if not TEACHER:
 for short in ['l','r']:
  center=joint('joint-'+short+'-eye');center[2]-=.014
  sphere('Face',center,[.009,.010,.005],iris,fixed('Head'),12,8)
  center[2]-=.004;sphere('Face',center,[.0045,.006,.003],pupil,fixed('Head'),10,6)
 # Scalp follows the anatomical head. Offset avoids coplanar hair/skin flicker.
 fs=[]
 for face in groups['body']:
  c=V[face].mean(axis=0)
  if c[1]>7.78 or (c[1]>7.10 and c[2]<.10) or (c[1]>7.4 and abs(c[0])>.65):fs.append(list(reversed(face)))
 ids=sorted({i for f in fs for i in f});mapping={i:k for k,i in enumerate(ids)}
 points=[]
 for i in ids:
  p=convert(V[i]);d=p-convert([0,7.65,.05]);p+=d/max(np.linalg.norm(d),1e-5)*.006;points.append(p)
 addmesh('Hair',points,[[mapping[i] for i in f] for f in fs],hair,fixed('Head'))
 # Hair follows the scalp directly; no separate floating quiff/helmet.
 for short in ['l','r']:
  center=joint('joint-'+short+'-eye');center[1]+=.023;center[2]-=.008
  sphere('Face',center,[.022,.0035,.005],hair,fixed('Head'),12,6)
for side in ['Left','Right']:
 ankle=positions[B[side+'Foot']]
 points=[];faces=[];segments=32 if HIGH else 20
 # Continuous shoe shell from heel/cuff to toe, with a nearly flat sole.
 # Separate ellipsoids made the toes look detached during a running stride.
 sections=[(.06,.055,.015,.20),(0,.075,.01,.23),(-.12,.10,.01,.125),(-.23,.085,.01,.09),(-.32,.025,.018,.05)]
 if TEACHER:sections=[(.06,.052,.012,.20),(0,.068,.01,.23),(-.10,.080,.01,.15),(-.20,.075,.01,.105),(-.26,.045,.015,.075)]
 for z,width,bottom,top in sections:
  for j in range(segments):
   angle=j*2*math.pi/segments
   points.append([ankle[0]+width*math.sin(angle),(top+bottom)/2+(top-bottom)/2*math.cos(angle),z])
 for k in range(len(sections)-1):
  for j in range(segments):
   a=k*segments+j;b=k*segments+(j+1)%segments;faces.append([a,b,b+segments,a+segments])
 faces.append(list(reversed(range(segments))))
 faces.append(list(range((len(sections)-1)*segments,len(sections)*segments)))
 addmesh('Clothes',points,faces,shoe,fixed(side+'Foot'))
# Long coat: tailored waist, front opening/lapels and split rear hem.
rings=[(.67,.27,.17,.012),(.75,.26,.165,.01),(.99,.235,.15,.008),(1.2,.235,.15,.008),(1.47,.26,.17,.015),(1.60,.23,.15,.20),(1.72,.105,.09,.72)]
if TEACHER:rings=[(.94,.29,.21,0),(.98,.31,.23,0),(1.08,.33,.25,0),(1.22,.34,.24,0),(1.36,.33,.21,0),(1.49,.32,.19,0),(1.67,.285,.17,0),(1.72,.105,.09,0)]
points=[];faces=[];segments=64 if HIGH else 48
for y,rx,rz,gap in rings:
 for i in range(segments+1):
  a=gap+(2*math.pi-2*gap)*i/segments;points.append([rx*math.sin(a),y,-rz*math.cos(a)])
for ring in range(len(rings)-1):
 for i in range(segments):
  # Small vent at the lower back prevents the hem bridging both thighs rigidly.
  if not TEACHER and ring==0 and abs(i-segments/2)<1:continue
  a=ring*(segments+1)+i;faces.append([a,a+segments+1,a+segments+2,a+1])
def coatweights(p):
 if TEACHER:
  t=float(np.clip((p[1]-1.02)/.58,0,1));return {'Hips':max(.001,1-t),'Spine2':max(.001,t)}
 if p[1]<1.06:
  side='Left' if p[0]>0 else 'Right';leg=np.clip((1.06-p[1])/.44,0,1)*.55
  return {'Hips':1-leg,side+'UpLeg':leg}
 t=float(np.clip((p[1]-1.06)/.5,0,1));return {'Hips':max(.01,1-t),'Spine2':max(.01,t)}
addmesh('Coat',points,faces,coat,coatweights)
# Sleeves follow shoulder/elbow/wrist instead of being rigid floating pieces.
for side in ['Left','Right']:
 shoulder=positions[B[side+'Arm']].copy();shoulder[0]*=1 if TEACHER else .86
 if not TEACHER:sphere('Coat',[shoulder[0],shoulder[1]-.025,shoulder[2]],[.087,.075,.085],coat,{side+'Arm':.5,'Spine2':.5},16,10)
 elbow=positions[B[side+'ForeArm']];wrist=positions[B[side+'Hand']]
 centers=[(shoulder,.085),(shoulder*.5+elbow*.5,.078),(elbow,.067),(elbow*.4+wrist*.6,.061),(wrist,.048)]
 if TEACHER:
  end=elbow*.40+wrist*.60
  inset=shoulder.copy();inset[0]*=.78;inset[1]-=.025
  centers=[(inset,.108),(shoulder*.5+elbow*.5,.097),(elbow,.083),(end,.074)]
 points=[];faces=[];segments=32 if HIGH else 20
 for k,(center,radius) in enumerate(centers):
  tangent=centers[min(k+1,len(centers)-1)][0]-centers[max(0,k-1)][0];tangent/=np.linalg.norm(tangent)
  u=np.cross(tangent,[0,0,1]);u/=np.linalg.norm(u);v=np.cross(tangent,u)
  for j in range(segments):points.append(center+radius*(math.cos(j*2*math.pi/segments)*u+math.sin(j*2*math.pi/segments)*v))
 for k in range(len(centers)-1):
  for j in range(segments):a=k*segments+j;b=k*segments+(j+1)%segments;faces.append([a,b,b+segments,a+segments])
 faces.append(list(reversed(range(segments))))
 addmesh('Coat',points,faces,coat,lambda p,s=side:blend(p,[(s+'Arm',s+'ForeArm'),(s+'ForeArm',s+'Hand')]))
def panel(label,coordinates,material,weights):addmesh(label,coordinates,[list(reversed(range(len(coordinates))))],material,weights)
if not TEACHER:
 panel('Clothes',[[-.085,1.55,-.155],[.085,1.55,-.155],[.08,1.71,-.105],[-.08,1.71,-.105]],shirt,coatweights)
 for sign in [-1,1]:
  # Folded collar and lapel, offset from the coat surface.
  panel('Coat',[[sign*.015,1.39,-.177],[sign*.135,1.55,-.177],[sign*.11,1.70,-.105],[sign*.045,1.65,-.13]],coat,coatweights)
  for y,rx,rz in [(1.05,.17,.163),(1.47,.15,.174)]:
   if y>1.4 and sign<0:continue
   panel('Coat',[[sign*(rx-.065),y-.08,-rz],[sign*(rx+.065),y-.08,-rz],[sign*(rx+.065),y+.035,-rz],[sign*(rx-.065),y+.035,-rz]],coat,coatweights)
 for y in [1.30,1.14,.98,.82]:sphere('Clothes',[.012,y,-.161 if y>1.0 else -.17],[.014,.014,.007],buttons,coatweights,10,6)
if TEACHER:
 primitives.pop('Coat',None);primitives.pop('Clothes',None)
 realistic_sweater();realistic_eyes();realistic_hair();realistic_shoes()
 exec((ROOT/'tools/professor_details.py').read_text(),globals())
# Write a native GLB with one rig shared by every garment and face primitive.
buffer=bytearray();views=[];accessors=[]
def acc(array,kind,component=5126):
 array=np.asarray(array,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);
 while len(buffer)%4:buffer.append(0)
 offset=len(buffer);buffer.extend(array.tobytes());views.append({'buffer':0,'byteOffset':offset,'byteLength':array.nbytes})
 count=len(array);entry={'bufferView':len(views)-1,'componentType':component,'count':count,'type':kind}
 if kind=='VEC3' and component==5126:entry.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
 accessors.append(entry);return len(accessors)-1
nodes=[{'name':'ProfessorPolice' if TEACHER else 'TechnicalStudent','children':[]}]
for i,name in enumerate(bones):
 parent=parents[i];translation=positions[i]-(positions[parent] if parent is not None else 0)
 nodes.append({'name':'mixamorig'+name,'translation':translation.tolist(),'children':[]})
 (nodes[parent+1]['children'] if parent is not None else nodes[0]['children']).append(i+1)
ibm=[]
for p in positions:
 matrix=np.eye(4);matrix[:3,3]=-p;ibm.append(matrix.T.flatten())
inverse=acc(ibm,'MAT4');meshes=[]
for label,parts in primitives.items():
 # Merge repeated pocket/button/sleeve primitives sharing a material.
 # A coat is one draw, rather than one draw per garment panel.
 grouped={}
 for part in parts:grouped.setdefault(part[-1],[]).append(part)
 merged=[]
 for material,entries in grouped.items():
  arrays=[[],[],[],[],[],[]];offset=0
  for P,N,F,J,W,UV,_ in entries:
   for target,data in zip(arrays,[P,N,F+offset,J,W,UV]):target.append(data)
   offset+=len(P)
  merged.append((*[np.concatenate(array) for array in arrays],material))
 parts=merged
 entries=[]
 for P,N,F,J,W,UV,material in parts:
  entries.append({'attributes':{'POSITION':acc(P,'VEC3'),'NORMAL':acc(N,'VEC3'),'TEXCOORD_0':acc(UV,'VEC2'),'JOINTS_0':acc(J,'VEC4',5123),'WEIGHTS_0':acc(W,'VEC4')},'indices':acc(F.flatten(),'SCALAR',5125),'material':material})
 meshes.append({'name':label,'primitives':entries});nodes.append({'name':label,'mesh':len(meshes)-1,'skin':0});nodes[0]['children'].append(len(nodes)-1)
for n in nodes:
 if not n.get('children'):n.pop('children',None)
j={'asset':{'version':'2.0','generator':'Technical-school character builder','copyright':'CC0 MakeHuman base; authored coat and rig; see ATTRIBUTION.md'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'skins':[{'joints':list(range(1,len(bones)+1)),'inverseBindMatrices':inverse,'skeleton':1}],'materials':materials,'buffers':[{'byteLength':len(buffer)}],'bufferViews':views,'accessors':accessors}
if TEACHER:realism_textures()
raw=json.dumps(j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);buffer+=b'\0'*((-len(buffer))%4)
output=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(buffer))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(buffer),0x004e4942)+buffer
stem='professor-police' if TEACHER else 'technical-student'
path=ROOT/'assets/characters'/(stem+('' if HIGH else '-low')+'.glb')
temporary=path.with_suffix('.tmp');temporary.write_bytes(output);temporary.replace(path)
print(path,len(output),'bytes',len(bones),'bones',sum(len(p[2]) for parts in primitives.values() for p in parts),'triangles')
