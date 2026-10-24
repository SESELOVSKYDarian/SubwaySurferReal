"""Photo-inspired accessories, sweater ribs and police cap. Executed by build_student.py --professor."""
def tube(label, path, radius, material, weights, sides=8):
 points=[];faces=[];path=np.asarray(path,dtype=float)
 for k,center in enumerate(path):
  tangent=path[min(k+1,len(path)-1)]-path[max(0,k-1)];tangent/=max(np.linalg.norm(tangent),1e-8)
  axis=np.array([0.,0.,1.]) if abs(tangent[2])<.9 else np.array([0.,1.,0.])
  u=np.cross(tangent,axis);u/=np.linalg.norm(u);v=np.cross(tangent,u)
  for j in range(sides):points.append(center+radius*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides)))
 for k in range(len(path)-1):
  for j in range(sides):
   a=k*sides+j;b=k*sides+(j+1)%sides;faces.append([a,b,b+sides,a+sides])
 addmesh(label,points,faces,material,weights)

def rib_ring(y,rx,rz,height):
 points=[];faces=[];n=64 if HIGH else 40
 for ring in range(3):
  for j in range(n):
   a=j*math.pi*2/n;ripple=1+.009*math.cos(j*math.pi)
   points.append([rx*math.sin(a)*ripple,y+height*ring/2,-rz*math.cos(a)*ripple])
 for k in range(2):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;faces.append([a,a+n,b+n,b])
 addmesh('KnitTrim',points,faces,rib,coatweights)
# Boundary-following knit trim is authored by realistic_sweater().

# Rectangular spectacles with rounded corners, bridge and actual side arms.
eye_centers=[joint('joint-'+side+'-eye') for side in ['l','r']]
for center in eye_centers:
 x,y,z=center;z-=.060
 path=[];rx=.039;ry=.025;corner=.007
 for cx,cy,start in [(rx-corner,ry-corner,0),(-rx+corner,ry-corner,90),(-rx+corner,-ry+corner,180),(rx-corner,-ry+corner,270)]:
  for j in range(5 if HIGH else 3):
   a=math.radians(start+j*90/((5 if HIGH else 3)-1))
   path.append([x+cx+corner*math.cos(a),y+cy+corner*math.sin(a),z])
 path.append(path[0]);tube('Spectacles',path,.0038,frames,fixed('Head'),8 if HIGH else 6)
 panel('Lenses',[[x-rx+.004,y-ry+.004,z+.001],[x+rx-.004,y-ry+.004,z+.001],[x+rx-.004,y+ry-.004,z+.001],[x-rx+.004,y+ry-.004,z+.001]],lens,fixed('Head'))
 sign=1 if x>0 else -1
 tube('Spectacles',[[x+sign*rx,y+.006,z],[sign*.115,y+.003,z+.02],[sign*.123,y-.003,.025]],.0035,frames,fixed('Head'),6)
left,right=sorted(eye_centers,key=lambda p:p[0])
z=min(left[2],right[2])-.061;y=(left[1]+right[1])/2+.007
tube('Spectacles',[[left[0]+.036,y,z],[0,y+.005,z-.006],[right[0]-.036,y,z]],.0032,frames,fixed('Head'),6)

# Beard and mustache follow the anatomical skin surface.

# Peaked police cap: crown, black visor, band and small raised shield.
n=48 if HIGH else 28;points=[];faces=[]
cap_rings=[(1.993,.126,.140),(2.012,.130,.145),(2.065,.143,.150),(2.104,.108,.120)]
for y,rx,rz in cap_rings:
 for j in range(n):a=2*math.pi*j/n;points.append([rx*math.sin(a),y,-rz*math.cos(a)+.005])
for k in range(len(cap_rings)-1):
 for j in range(n):a=k*n+j;b=k*n+(j+1)%n;faces.append([a,a+n,b+n,b])
faces.extend([list(range(n)),list(reversed(range((len(cap_rings)-1)*n,len(cap_rings)*n)))])
addmesh('PoliceCap',points,faces,cap,fixed('Head'))
# Wide visor protrudes toward the face (-z), not toward the back of the head.
curve=[];count=32 if HIGH else 20
for j in range(count+1):
 a=-math.pi/2+math.pi*j/count
 curve.append([.143*math.sin(a),2.004-.014*math.cos(a),-.087-.153*math.cos(a)])
points=curve+[[x,y-.009,z] for x,y,z in curve];length=len(curve)
faces=[list(reversed(range(length))),list(range(length,length*2))]
for j in range(length):k=(j+1)%length;faces.append([j,k,k+length,j+length])
addmesh('PoliceVisor',points,faces,visor,fixed('Head'))
cord=[]
for j in range(25):
 a=-1.07+2.14*j/24;cord.append([.131*math.sin(a),2.014,-.148*math.cos(a)])
tube('PoliceInsignia',cord,.0018,gold,fixed('Head'),6)
panel('PoliceInsignia',[[-.019,2.052,-.148],[.019,2.052,-.148],[.016,2.028,-.145],[0,2.016,-.142],[-.016,2.028,-.145]],gold,fixed('Head'))
sphere('PoliceInsignia',[0,2.041,-.151],[.006,.007,.002],gold,fixed('Head'),10,6)

# Fit the cap to the crown rather than the rear of the generic skull.
for label in ['PoliceCap','PoliceVisor','PoliceInsignia']:
 for P,N,F,J,W,UV,material in primitives.get(label,[]):
  P[:,1]-=.035;P[:,2]-=.060
# Black watch on the left wrist, like the reference photos.
wrist=positions[B['LeftHand']]*.87+positions[B['LeftForeArm']]*.13
tangent=positions[B['LeftHand']]-positions[B['LeftForeArm']];tangent/=np.linalg.norm(tangent)
u=np.cross(tangent,[0,0,1]);u/=np.linalg.norm(u);v=np.cross(tangent,u)
strap=[wrist+.053*(u*math.cos(j*2*math.pi/32)+v*math.sin(j*2*math.pi/32)) for j in range(33)]
tube('Wristwatch',strap,.009,frames,fixed('LeftForeArm'),6)
sphere('Wristwatch',wrist+np.array([0,0,-.05]),[.026,.031,.009],frames,fixed('LeftForeArm'),12,8)
