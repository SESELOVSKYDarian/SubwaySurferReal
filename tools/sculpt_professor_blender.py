"""Blender 4.3 authoring pass. Run after the two build_student.py --professor builds.
Keeps the anatomical UV seams, skeleton and weights; exports the actual game meshes.
"""
import bpy, bmesh, math, json, numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters'

def gauss(value,center,width):return math.exp(-((value-center)/width)**2)
def author(low=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path=OUT/('professor-police-low.glb' if low else 'professor-police.glb')
    bpy.ops.import_scene.gltf(filepath=str(path))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    # Reshape the neckline into a fitted crew neck with Blender mesh editing.
    for name in ['Coat','KnitTrim']:
        obj=bpy.data.objects[name]
        for v in obj.data.vertices:
            x,f,h=v.co
            if h>1.61 and abs(x)<.30:
                t=max(0,min(1,(h-1.61)/.10))**2
                angle=math.atan2(x,f)
                target=Vector((.101*math.sin(angle),.015+.088*math.cos(angle),1.735))
                v.co=v.co.lerp(target,t*.93)
                # The fitted neck must follow the spine, not the shoulders it was cut from.
                original=[(g.group,g.weight) for g in v.groups]
                for index,weight in original:obj.vertex_groups[index].add([v.index],weight*(1-t),'REPLACE')
                obj.vertex_groups['mixamorigNeck'].add([v.index],t,'ADD')
    # Imported glTF: Blender X = lateral, Y = forward, Z = up.
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH' or not obj.data.materials:continue
        skin_ids={p.index for p in obj.data.polygons if obj.data.materials[p.material_index].name=='Skin'}
        skin_vertices={i for p in obj.data.polygons if p.index in skin_ids for i in p.vertices}
        for v in obj.data.vertices:
            x,f,h=v.co
            if obj.name in ['Human','FacialHair'] and (v.index in skin_vertices or obj.name=='FacialHair') and h>1.70:
                # Fuller lower face, less hollow cheeks; preserve eyelids and UVs.
                cheek=gauss(abs(x),.061,.033)*gauss(h,1.835,.045)*gauss(f,.115,.065)
                jaw=gauss(h,1.762,.040)*gauss(f,.09,.10)
                v.co.x+=math.copysign(.006*cheek+.003*jaw,x)
                v.co.y+=.003*cheek
            if obj.name=='Human' and v.index in skin_vertices and 1.62<h<1.79 and abs(x)<.30:
                t=max(0,min(1,(1.79-h)/.055))
                v.co.x=(1-t)*v.co.x+t*max(-.084,min(.084,v.co.x))
                v.co.y=(1-t)*v.co.y+t*max(-.060,min(.085,v.co.y))
                # These covered shoulder/neck remnants must not follow the upper arms.
                for index in [group.group for group in v.groups]:obj.vertex_groups[index].remove([v.index])
                obj.vertex_groups['mixamorigNeck'].add([v.index],1,'REPLACE')
            if obj.name=='Human' and v.index not in skin_vertices and h<.42:
                # Full-length trousers over the shoe collar, not exposed white socks.
                t=max(0,min(1,(.42-h)/.28))
                v.co.z-=.085*t
                side=1 if x>0 else -1
                center=side*.20
                v.co.x=center+(x-center)*(1+.25*t)
                v.co.y*=1+.08*t
            if obj.name in ['Coat','KnitTrim']:
                # Shape the loose sweater without pushing sleeve vertices into the abdomen.
                arm=sum(g.weight for g in v.groups if 'Arm' in obj.vertex_groups[g.group].name or 'Hand' in obj.vertex_groups[g.group].name)
                torso=max(0,1-arm*2)
                v.co.x*=1-.08*gauss(h,1.12,.22)*torso
                v.co.y*=1-.10*gauss(h,1.16,.24)*torso
                # Shallow compression folds above waistband and around bent elbows.
                fold=.0024*math.sin(46*h+7*math.atan2(x,f))*gauss(h,1.06,.065)*torso
                v.co+=v.normal*fold
            if obj.name in ['Spectacles','Lenses']:
                # Smaller frames follow the eyes; reduce the oversized tube thickness.
                v.co.x*=.90
                v.co.z=1.899+(h-1.899)*.78
                v.co.y-=.028
        if obj.name=='Wristwatch':
            center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            for v in obj.data.vertices:v.co=center+(v.co-center)*.73
        # Weld UV seam duplicates while retaining corner UVs, then recalculate smooth normals.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        if obj.name=='Human':
            hidden=[f for f in bm.faces if obj.data.materials[f.material_index].name=='Skin'
                and 1.62<f.calc_center_median().z<1.86 and abs(f.calc_center_median().x)>.095]
            bmesh.ops.delete(bm,geom=hidden,context='FACES')
        if obj.name!='FacialHair':bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free()
        bpy.context.view_layer.objects.active=obj
        if obj.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
        if obj.name=='LeatherShoes':
            obj.data.materials.append(bpy.data.materials['Trousers'])
            for poly in obj.data.polygons:
                if min(obj.data.vertices[i].co.z for i in poly.vertices)>.115:poly.material_index=1
        if obj.name=='Coat':
            bpy.context.view_layer.objects.active=obj
            mod=obj.modifiers.new('Relax cloth surface','SMOOTH');mod.factor=.28;mod.iterations=4
            # Move smoothing before armature: operate in bind pose, preserve weights.
            bpy.ops.object.modifier_move_up(modifier=mod.name)
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for edge in obj.data.edges:edge.use_edge_sharp=False
        for p in obj.data.polygons:p.use_smooth=True
        obj.data.update()
    # A separate ribbed crew-neck band, weighted to the neck, with a closed round profile.
    P=[];F=[];steps=48 if low else 64
    for k in range(6):
        a=2*math.pi*k/6
        for j in range(steps):
            t=j*2*math.pi/steps
            r=.006*math.cos(a)
            P.append(((.100+r)*math.sin(t),.015+(.088+r)*math.cos(t),1.735+.012*math.sin(a)))
    for k in range(6):
        for j in range(steps):F.append((k*steps+j,k*steps+(j+1)%steps,((k+1)%6)*steps+(j+1)%steps,((k+1)%6)*steps+j))
    mesh=bpy.data.meshes.new('CrewNeck');mesh.from_pydata(P,[],F);mesh.materials.append(bpy.data.materials['SweaterRib'])
    collar=bpy.data.objects.new('CrewNeck',mesh);bpy.context.scene.collection.objects.link(collar)
    vg=collar.vertex_groups.new(name='mixamorigNeck');vg.add(list(range(len(P))),1,'REPLACE')
    mod=collar.modifiers.new('Armature','ARMATURE');mod.object=rig
    for poly in mesh.polygons:poly.use_smooth=True
    for mat in bpy.data.materials:
        if not mat.use_nodes:continue
        bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if bs is None:continue
        if mat.name in ['TeacherSweater','SweaterRib']:
            bs.inputs['Base Color'].default_value=(.040,.055,.029,1)
            bs.inputs['Roughness'].default_value=.94
            noise=mat.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=330
            bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.001
            mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        if mat.name=='Skin':
            for node in mat.node_tree.nodes:
                if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.22
        if mat.name=='GrayBeard':
            # UV-mapped short salt-and-pepper hairs, shared by Blender and the browser.
            size=512;rng=np.random.default_rng(701)
            yy,xx=np.mgrid[0:size,0:size];x=xx/(size-1)*.24-.12;y=1.72+(1-yy/(size-1))*.16
            smooth=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
            top=1.802+.040*np.minimum(1,np.abs(x)/.10)
            fade=smooth((top-y)/.018)*smooth((y-1.737)/.014)*smooth((.112-np.abs(x))/.018)
            moustache=smooth((y-1.808)/.005)*smooth((1.825-y)/.004)*smooth((.049-np.abs(x))/.015)
            noise=rng.random((size,size));strands=.5+.5*np.sin(xx*2.3+np.sin(yy*.11)*1.4)
            pixels=np.ones((size,size,4),dtype=np.float32)
            pixels[:,:,:3]=(.22+.48*noise+.18*strands)[:,:,None]
            pixels[:,:,3]=np.maximum(fade,moustache)*(.30+.55*strands)
            img=bpy.data.images.new('Professor salt pepper beard',size,size,alpha=True)
            img.pixels.foreach_set(pixels.ravel());img.filepath_raw=str(OUT/'textures/professor-beard.png');img.file_format='PNG';img.save()
            node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=img
            mat.node_tree.links.new(node.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(node.outputs['Alpha'],bs.inputs['Alpha'])
            bs.inputs['Roughness'].default_value=.9;mat.surface_render_method='DITHERED';mat.use_backface_culling=False
        if mat.name=='Shoes':
            link=next((l for l in mat.node_tree.links if l.to_socket==bs.inputs['Base Color']),None)
            if link:
                source=link.from_socket;mat.node_tree.links.remove(link)
                tint=mat.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(.48,.40,.32,1)
                mat.node_tree.links.new(source,tint.inputs[1]);mat.node_tree.links.new(tint.outputs[0],bs.inputs['Base Color'])
    # Save a packed, editable Blender source with a portrait studio; export game selection only.
    game_objects=list(bpy.context.scene.objects)
    for obj in game_objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_animations=False,export_skins=True,export_yup=True,export_extras=True)
    if low:return
    # Neutral relaxed pose for Blender portrait. Mesh stays in rest pose in the exported GLB.
    for side,sign in [('Left',1),('Right',-1)]:
        bone=next((b for b in rig.pose.bones if b.name.endswith(side+'Arm')),None)
        if bone:
            bone.rotation_mode='XYZ';bone.rotation_euler.y=sign*.15
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
    scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Portrait studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.19,.22,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
    for name,pos,power,size in [('Key',(-3,4,4),400,3),('Fill',(3,2,2.5),180,3),('Rim',(0,-3,3),350,2)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=pos;aim(light,(0,0,1.3))
    data=bpy.data.cameras.new('Portrait');cam=bpy.data.objects.new('Portrait',data);scene.collection.objects.link(cam)
    cam.location=(.45,3.8,1.8);aim(cam,(0,0,1.12));data.type='ORTHO';data.ortho_scale=2.35;scene.camera=cam
    scene.view_settings.view_transform='AgX'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender/professor.blend'),compress=True)
    scene.render.filepath=str(ROOT/'test-results/professor-blender-studio.png')
    bpy.ops.render.render(write_still=True)

author(False)
author(True)
