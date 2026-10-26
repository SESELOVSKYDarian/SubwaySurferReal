import bpy, math
from mathutils import Vector
from mathutils.kdtree import KDTree
from pathlib import Path
R=Path(__file__).resolve().parents[1];A=R/'assets/characters'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(A/'source/teen-boy/game-rig-reference.glb'))
reference=list(bpy.context.scene.objects);rig=next(o for o in reference if o.type=='ARMATURE')
samples=[]
for o in reference:
 if o.type!='MESH' or not o.data.materials:continue
 for v in o.data.vertices:
  weights=[(o.vertex_groups[g.group].name,g.weight) for g in v.groups]
  samples.append((o.matrix_world@v.co,weights))
kd=KDTree(len(samples))
for i,(p,w) in enumerate(samples):kd.insert(p,i)
kd.balance()
bpy.ops.import_scene.gltf(filepath=str(A/'source/teen-boy/original.glb'))
new=[o for o in bpy.context.scene.objects if o not in reference];meshes=[o for o in new if o.type=='MESH' and o.data.materials]
for o in new:
 if o.type=='ARMATURE':o.data.pose_position='REST'
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));scale=2.05/(hi.z-lo.z)
print('Source bounds',lo,hi)
for o in meshes:
 world=o.matrix_world.copy()
 for v in o.data.vertices:v.co=(world@v.co-Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z)))*scale
 o.parent=None;o.matrix_world=__import__('mathutils').Matrix.Identity(4);o.modifiers.clear();o.vertex_groups.clear()
 for b in rig.data.bones:o.vertex_groups.new(name=b.name)
 for v in o.data.vertices:
  v.co.x=-v.co.x;v.co.y=-v.co.y
  x,y,z=v.co
  if abs(x)>.24 and z>1.15:
   sign=1 if x>0 else -1;angle=-sign*1.0*min(1,(abs(x)-.24)/.10);dx=x-sign*.24;dz=z-1.69
   v.co.x=sign*.24+math.cos(angle)*dx-math.sin(angle)*dz;v.co.z=1.69+math.sin(angle)*dx+math.cos(angle)*dz
  near=kd.find_n(v.co,3);weights={}
  for _,idx,d in near:
   factor=1/max(d,.005)**3
   for name,w in samples[idx][1]:weights[name]=weights.get(name,0)+w*factor
  chosen=sorted(weights.items(),key=lambda t:-t[1])[:4];total=sum(w for _,w in chosen)
  for name,w in chosen:
   if total:o.vertex_groups[name].add([v.index],w/total,'REPLACE')
 mod=o.modifiers.new('GameSkeleton','ARMATURE');mod.object=rig
 if any('shoes' in mat.name.lower() for mat in o.data.materials):
  for mat in o.data.materials:
   existing=bpy.data.materials.get('Shoes')
   if existing and existing!=mat:existing.name='ReferenceShoes'
   mat.name='Shoes'
for o in new:
 if o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
for o in reference:
 if o!=rig:bpy.data.objects.remove(o,do_unlink=True)
for o in bpy.context.scene.objects:o.select_set(True)
for low in [False,True]:
 if low:
  for o in meshes:
   bpy.context.view_layer.objects.active=o
   m=o.modifiers.new('MobileLOD','DECIMATE');m.ratio=.36;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.export_scene.gltf(filepath=str(A/('technical-student-low.glb' if low else 'technical-student.glb')),export_format='GLB',use_selection=True,export_animations=False)
