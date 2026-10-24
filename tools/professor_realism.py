"""UV-preserving anatomy, fitted official eye/hair meshes and a continuous sweater.
Helpers are used only for the professor profile; the student export is unchanged.
"""
def mapped_anatomy_weights():
 data=json.loads(gzip.decompress((ROOT/'assets/characters/source/realism/default_weights.mhw.gz').read_bytes()))
 weights=np.zeros((len(V),len(bones)),dtype=float)
 for name,entries in data['weights'].items():
  side='Left' if name.endswith('.L') else 'Right'
  if name.startswith(('upperarm','shoulder')):target=side+'Arm'
  elif name.startswith('lowerarm'):target=side+'ForeArm'
  elif name.startswith(('wrist','finger','metacarpal')):target=side+'Hand'
  elif name.startswith('upperleg'):target=side+'UpLeg'
  elif name.startswith('lowerleg'):target=side+'Leg'
  elif name.startswith('foot'):target=side+'Foot'
  elif name.startswith('toe'):target=side+'ToeBase'
  elif name.startswith(('clavicle','breast')) or name in ['spine01','spine02']:target='Spine2'
  elif name in ['spine03','spine04']:target='Spine'
  elif name.startswith('neck'):target='Neck'
  elif name in ['root','spine05'] or name.startswith('pelvis'):target='Hips'
  else:
   center=np.average(V[[i for i,w in entries]],weights=[w for i,w in entries],axis=0)
   target='Head' if convert(center)[1]>1.60 else 'Hips'
  for i,w in entries:weights[i,B[target]]+=w
 total=weights.sum(axis=1);weights[total==0,B['Hips']]=1
 return weights/np.maximum(weights.sum(axis=1,keepdims=True),1e-10)

anatomy_weights=mapped_anatomy_weights()

def refined_weights(weights,faces):
 edges={}
 for face in faces:
  for i,a in enumerate(face):edges.setdefault(tuple(sorted((a,face[(i+1)%len(face)]))),True)
 extra=[(weights[a]+weights[b])/2 for a,b in edges]
 centers=[weights[face].mean(axis=0) for face in faces]
 return np.concatenate([weights,np.asarray(extra),np.asarray(centers)])

def refine_uv(points,faces,uvs):
 result_points,result_faces=refine_skin(points,faces)
 out=[]
 for face,uv in zip(faces,uvs):
  uv=np.asarray(uv);middle=uv.mean(axis=0)
  for i in range(len(face)):
   out.append([uv[i],(uv[i]+uv[(i+1)%len(face)])/2,middle,(uv[(i-1)%len(face)]+uv[i])/2])
 return result_points,result_faces,out

def split_uv(P,N,faces,uvs):
 mapping={};points=[];normals=[];coords=[];triangles=[]
 for face,uv in zip(faces,uvs):
  indices=[]
  for index,coord in zip(face,uv):
   key=(int(index),round(float(coord[0]),7),round(float(coord[1]),7))
   if key not in mapping:
    mapping[key]=len(points);points.append(P[index]);normals.append(N[index]);coords.append([coord[0],1-coord[1]])
   indices.append(mapping[key])
  for i in range(1,len(indices)-1):triangles.append([indices[0],indices[i],indices[i+1]])
 return np.asarray(points,dtype=np.float32),np.asarray(normals,dtype=np.float32),np.asarray(triangles,dtype=np.uint32),np.asarray(coords,dtype=np.float32),np.array([key[0] for key in mapping],dtype=int)

def read_proxy(folder,name,with_weights=False):
 path=ROOT/'assets/characters/source/realism'/folder
 vertices=[];uv=[];faces=[];face_uv=[]
 for line in (path/(name+'.obj')).read_text().splitlines():
  if line.startswith('v '):vertices.append(list(map(float,line.split()[1:4])))
  elif line.startswith('vt '):uv.append(list(map(float,line.split()[1:3])))
  elif line.startswith('f '):
   tokens=[t.split('/') for t in line.split()[1:]]
   # z is mirrored by convert(), so reverse polygon winding and UV corners.
   faces.append([int(t[0])-1 for t in reversed(tokens)])
   face_uv.append([uv[int(t[1])-1] for t in reversed(tokens)])
 scale=np.ones(3);mapping=[];reading=False
 for line in (path/(name+'.mhclo')).read_text().splitlines():
  tokens=line.split()
  if not tokens or tokens[0].startswith('#'):continue
  if tokens[0] in ['x_scale','y_scale','z_scale']:
   axis={'x_scale':0,'y_scale':1,'z_scale':2}[tokens[0]];a,b=int(tokens[1]),int(tokens[2]);scale[axis]=abs(V[a,axis]-V[b,axis])/float(tokens[3])
  elif tokens[0]=='verts':reading=True
  elif reading:
   if len(tokens)==9:
    try:mapping.append(list(map(float,tokens)))
    except ValueError:reading=False
   elif len(tokens)==1 and tokens[0].isdigit():mapping.append([int(tokens[0])])
   else:reading=False
 if len(mapping)!=len(vertices):raise ValueError(f'{name}: proxy mappings {len(mapping)} vs vertices {len(vertices)}')
 points=[];proxy_weights=[]
 for record in mapping:
  if len(record)==1:p=V[record[0]]
  else:p=(V[np.array(record[:3],dtype=int)]*np.array(record[3:6])[:,None]).sum(axis=0)+np.array(record[6:])*scale
  points.append(convert(p))
  if with_weights:
   if len(record)==1:w=anatomy_weights[record[0]]
   else:w=(anatomy_weights[np.array(record[:3],dtype=int)]*np.array(record[3:6])[:,None]).sum(axis=0)
   w=np.maximum(w,0);proxy_weights.append(w/max(w.sum(),1e-9))
 if with_weights:return np.asarray(points),faces,face_uv,np.asarray(proxy_weights)
 return np.asarray(points),faces,face_uv

def realistic_eyes():
 name='high-poly' if HIGH else 'low-poly'
 P,F,UV=read_proxy('eyes',name)
 addmesh('RealisticEyes',P,F,eye,fixed('Head'),UV)

def realistic_shoes():
 P,F,UV,W=read_proxy('shoes','shoes01',True)
 addmesh('LeatherShoes',P,F,shoe,W,UV)

def realistic_hair():
 P,F,UV=read_proxy('hair','short02')
 # The cap covers the crown. Prevent card tips poking through its fabric.
 P[:,1]=np.minimum(P[:,1],1.970)
 addmesh('GrayHairCards',P,F,hair,fixed('Head'),UV)

def realistic_sweater():
 allpoints=np.asarray([convert(p) for p in V]);normals=np.zeros_like(allpoints)
 for face in groups['body']:
  face=list(reversed(face));a,b,c=allpoints[face[:3]];n=np.cross(b-a,c-a)
  for index in face:normals[index]+=n
 normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-8)
 neck_y=positions[B['Neck']][1]-.040
 # Clip exact garment boundaries instead of discarding entire boundary faces.
 def clip(poly,field):
  result=[]
  for i,A in enumerate(poly):
   B=poly[(i+1)%len(poly)];fa,fb=field(A[:3]),field(B[:3]);ina,inb=fa>=0,fb>=0
   if ina:result.append(A)
   if ina!=inb:
    lo,hi=0.,1.
    for _ in range(18):
     t=(lo+hi)/2
     if (field((A+(B-A)*t)[:3])>=0)==ina:lo=t
     else:hi=t
    result.append(A+(B-A)*((lo+hi)/2))
  return result
 selected=[]
 for face in groups['body']:
  poly=[np.concatenate([allpoints[i],normals[i],anatomy_weights[i]]) for i in reversed(face)]
  for field in [lambda p:p[1]-.97,lambda p:neck_y-p[1],lambda p:max(.34-abs(p[0]),p[1]-1.345)]:
   poly=clip(poly,field)
   if len(poly)<3:break
  if len(poly)>=3:selected.append(poly)
 points=[];faces=[];vertex_weights=[];mapping={}
 for poly in selected:
  f=[]
  for item in poly:
   p=item[:3].copy();n=item[3:6];angle=math.atan2(p[0],-p[2])
   # Relaxed fit over abdomen, retaining the continuous shoulders and arms.
   if abs(p[0])<.34 and p[1]<1.58:
    weight=float(np.clip((1.58-p[1])/.18,0,1))
    rx=.285+.020*math.exp(-((p[1]-1.13)/.18)**2);rz=.195+.040*math.exp(-((p[1]-1.13)/.18)**2)
    radial=math.sqrt((p[0]/rx)**2+(p[2]/rz)**2)
    if radial<1 and radial>.01:p[[0,2]]*=1+weight*(1/radial-1)
   fold=.0035*math.sin(angle*11+p[1]*40)*math.exp(-((p[1]-1.04)/.11)**2)
   p+=n*(.013+fold)
   # Keep the neckline/hem/cuffs planar after adding cloth thickness.
   if abs(item[1]-.97)<1e-4:p[1]=.97
   if abs(item[1]-neck_y)<1e-4:p[1]=neck_y
   if abs(item[1]-1.345)<1e-4 and abs(item[0])>.34:p[1]=1.345
   key=tuple(np.round(p,6))
   if key not in mapping:mapping[key]=len(points);points.append(p);vertex_weights.append(item[6:])
   f.append(mapping[key])
  if len(set(f))>=3:faces.append(f)
 vertex_weights=np.array(vertex_weights)
 if HIGH:
  vertex_weights=refined_weights(vertex_weights,faces);points,faces=refine_skin(points,faces)
 addmesh('Coat',points,faces,coat,vertex_weights)
 # Trim follows the actual garment boundary, rather than a separate floating ring.
 counts={}
 for f in faces:
  for i,a in enumerate(f):
   b=f[(i+1)%len(f)];key=tuple(sorted((a,b)));counts[key]=counts.get(key,0)+1
 P=np.asarray(points);trim_points=[];trim_faces=[];trim_weights=[]
 garment_normals=np.zeros_like(P)
 for face in faces:
  n=np.cross(P[face[1]]-P[face[0]],P[face[2]]-P[face[0]])
  for i in face:garment_normals[i]+=n
 garment_normals/=np.maximum(np.linalg.norm(garment_normals,axis=1,keepdims=True),1e-8)
 for (a,b),count in counts.items():
  if count!=1:continue
  center=(P[a]+P[b])/2
  if center[1]<1.04:delta=np.array([0,.026,0])
  elif abs(center[0])>.36:
   side='Left' if center[0]>0 else 'Right';delta=positions[B[side+'Arm']]-center;delta=delta/np.linalg.norm(delta)*.025
  else:delta=np.array([0,-.018,0])
  offset=len(trim_points);trim_weights.extend([vertex_weights[a],vertex_weights[b],vertex_weights[b],vertex_weights[a]]);trim_points.extend([P[a]+garment_normals[a]*.0015,P[b]+garment_normals[b]*.0015,P[b]+delta+garment_normals[b]*.0015,P[a]+delta+garment_normals[a]*.0015]);trim_faces.append([offset,offset+1,offset+2,offset+3])
 addmesh('KnitTrim',trim_points,trim_faces,rib,np.array(trim_weights))


def realism_textures():
 names=['professor-skin-albedo.jpg','professor-skin-normal.png','professor-skin-mr.png','professor-eyes.png','professor-hair.png','professor-hair-normal.png','professor-shoes.jpg','professor-shoes-normal.png']
 j['images']=[{'uri':'textures/'+n} for n in names]
 j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
 j['textures']=[{'source':i,'sampler':0} for i in range(len(names))]
 materials[skin]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],baseColorTexture={'index':0},metallicRoughnessTexture={'index':2},roughnessFactor=1)
 materials[skin]['normalTexture']={'index':1,'scale':.65}
 materials[eye]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],baseColorTexture={'index':3},roughnessFactor=.12)
 materials[eye].update(alphaMode='MASK',alphaCutoff=.05)
 materials[hair]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],baseColorTexture={'index':4},roughnessFactor=.65)
 materials[hair].update(alphaMode='MASK',alphaCutoff=.4,doubleSided=True,normalTexture={'index':5,'scale':.35})
 materials[shoe]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],baseColorTexture={'index':6},roughnessFactor=.64)
 materials[shoe]['normalTexture']={'index':7,'scale':.55}

