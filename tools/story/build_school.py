"""Architectural first pass from five user photographs. Dimensions are estimates."""
import bpy,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=R/'assets/story';O.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color,rough=.6,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=95;n.inputs['Detail'].default_value=2;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.13;b.inputs['Distance'].default_value=.008;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal']);return m
white=material('Pared pintada blanco cálido',(.73,.73,.68));grey=material('Zócalo gris',(.19,.22,.22));steel=material('Hierro verde oscuro',(.037,.075,.052),.38,.65);roof=material('Chapa galvanizada',(.14,.16,.16),.6,.65);wood=material('Madera usada',(.24,.115,.046));floor=material('Baldosa gris',(.39,.4,.37),.38);gold=material('Trofeos latón',(.6,.4,.09),.25,.85);red=material('Rojo escuela',(.45,.035,.028));blue=material('Bandera celeste',(.27,.57,.75));green=material('Logo verde',(.045,.23,.16))
glass=material('Vidrio',(.58,.7,.67),.15);glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.86;glass.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=1.45
lightmat=material('Difusor luminaria',(.9,.88,.72));p=lightmat.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.93,.77,1);p.inputs['Emission Strength'].default_value=3
objects=[]
def box(name,loc,size,mat,bevel=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:m=o.modifiers.new('Cantos físicos','BEVEL');m.width=bevel;m.segments=2
 objects.append(o);return o
def beam(name,a,b,width,mat):
 a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,width,(b-a).length),mat);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def text(name,body,pos,size,mat,rotation=(math.pi/2,0,0)):
 c=bpy.data.curves.new(name,'FONT');c.body=body;c.size=size;c.extrude=.001;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=rotation;c.materials.append(mat);return o
# Hall: entrada y=-12; pared frontal y=12; oficinas derecha x=8.
for x in range(-10,10):
 for y in range(-14,13):box('Baldosa', (x+.5,y+.5,-.045),(.993,.993,.09),floor,.002)
for x in [-10,10]:
 box('Muro lateral', (x,0,3.8),(.2,26,7.6),white);box('Friso gris',(x-.012*(1 if x>0 else -1),0,.65),(.24,26,1.3),grey)
box('Volumen frontal',(-3,12.8,3.1),(13,.2,6.2),white);box('Zócalo frente',(-3,12.65,.65),(13,.16,1.3),grey)
# Continuación lateral observada a la derecha del bloque de las tres ventanas.
box('Pasillo continuación',(6,18,-.05),(6,11,.1),floor)
box('Fondo pasillo',(6,23.5,2),(6,.15,4),white)
box('Jamba paso',(9.3,12.8,2),(.3,.3,4),white)
box('Dintel paso',(6.4,12.8,4.1),(6.1,.3,.25),white)
# Cubierta de bóveda: el vídeo confirma perfiles curvos, no faldones planos.
def crown(x):return 7.4+2.2*math.sqrt(max(0,1-(x/10)**2))
for y in range(-12,14,4):
 for x in [-10,10]:box('Columna',(x,y,3.7),(.22,.22,7.4),white)
 for i in range(24):
  x0=-10+20*i/24;x1=-10+20*(i+1)/24
  beam('Arco cercha',(x0,y,crown(x0)),(x1,y,crown(x1)),.095,steel)
  beam('Cordón inferior curvo',(x0,y,crown(x0)-.40),(x1,y,crown(x1)-.40),.06,steel)
  beam('Celosía curva',(x0,y,crown(x0)-.40),(x1,y,crown(x1)),.035,steel)
for i in range(24):
 x0=-10+20*i/24;x1=-10+20*(i+1)/24
 for y0,y1,transparent in [(-13,-8,False),(-8,-7,True),(-7,0,False),(0,1,True),(1,8,False),(8,9,True),(9,13,False)]:
  vertices=[(x0,y0,crown(x0)+.04),(x1,y0,crown(x1)+.04),(x1,y1,crown(x1)+.04),(x0,y1,crown(x0)+.04)]
  mesh=bpy.data.meshes.new('Bóveda');mesh.from_pydata(vertices,[],[(0,1,2,3)]);o=bpy.data.objects.new('Franja translúcida' if transparent else 'Chapa curva',mesh);bpy.context.collection.objects.link(o);mesh.materials.append(glass if transparent else roof)
for x in range(-10,11):beam('Correa',(x,-13,crown(x)),(x,13,crown(x)),.035,steel)
box('Cierre provisional fondo',(0,25,5),(20,.2,10),white)
# Oficina vidriada derecha, cara principal mirando hacia el hall.
box('Oficina piso alto',(8,1,3.1),(4,13,.14),grey);box('Oficina antepecho',(6,1,.55),(.13,13,1.1),grey)
for y in range(-5,9):
 for z in [2,4.4]:box('Paño vidrio oficina',(6,y+.5,z),(.025,.96,1.75),glass,0)
 for z in [1.1,2.9,3.5,5.3]:beam('Marco horizontal',(6,y,z),(6,y+1,z),.055,steel)
 beam('Montante oficina',(6,y,1.1),(6,y,5.35),.055,steel)
for y in range(-5,9):beam('Baranda alta',(5.6,y,3.2),(5.6,y,4.15),.025,steel)
beam('Pasamanos',(5.6,-5,4.15),(5.6,9,4.15),.045,steel)
for y in [-3,3]:
 for z,mat in [(1.9,blue),(2.25,white),(2.6,blue)]:box('Bandera argentina',(5.94,y,z),(.02,1.1,.35),mat,0)
for i in range(18):box('Escalón oficina',(8.5,-7+i*.23,.09+i*.17),(2,.24,.18),grey)
beam('Pasamanos escalera',(7.4,-7,1.1),(7.4,-3.1,4),.045,steel)
# Cancha izquierda y escalera lateral de referencia.
for x in [-9,-3]:beam('Línea cancha',(x,0,.009),(x,11,.009),.025,white)
for x in [-8.3,-5.7]:beam('Poste arco',(x,11.9,0),(x,11.9,2.1),.08,steel)
beam('Travesaño',(-8.3,11.9,2.1),(-5.7,11.9,2.1),.08,steel)
box('Tablero básquet',(-7,12.35,3.1),(1.8,.08,1.15),white)
for i in range(18):box('Escalón lateral',(-8.7,-8+i*.23,.09+i*.17),(2,.24,.18),grey)
beam('Baranda lateral',(-7.5,-8,1.05),(-7.5,-4.1,4.05),.045,steel)
# Frente observado al entrar: vitrina y marca escolar.
box('Vitrina fondo',(-1,12.35,2),(4.5,.35,1.8),wood);box('Vitrina vidrio',(-1,12.1,2),(4.5,.025,1.8),glass,0)
for z in [1.2,1.8,2.4,2.85]:box('Estante vitrina',(-1,12.2,z),(4.5,.7,.035),white)
for x in range(-6,3):
 for z in [1.35,1.95,2.55]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.09,location=(x*.4,12,z+.13));bpy.context.object.data.materials.append(gold);box('Base trofeo',(x*.4,12,z),(.14,.13,.05),wood)
text('Marca técnica','E5',(1.65,12.47,2.1),1.2,green)
for x in [-7,-3,1]:box('Ventana superior',(x,12.63,5.2),(1.3,.05,1.25),glass)
for y in [-5,2,8]:
 box('Banco asiento',(1,y,.47),(2.4,.4,.08),wood)
 for x in [0,2]:box('Pata banco',(x,y,.23),(.06,.32,.46),steel)
for y in [-6,3]:box('Mesa taller',(-4,y,.8),(2.4,1.1,.08),wood)
# Umbral calle/escuela como referencia de transición, aún sin fachada detallada.
for x in [-6,6]:box('Frente entrada',(x,-12.6,3),(8,.2,6),white)
box('Dintel rojo',(0,-12.6,5.6),(20,.5,1.1),red);text('Cartel exterior','EEST N°5',(-2,-12.91,4.9),.65,red)
for y in [-8,0,8]:
 d=bpy.data.lights.new('Luz de nave','AREA');d.energy=1100;d.shape='DISK';d.size=3;o=bpy.data.objects.new(d.name,d);bpy.context.collection.objects.link(o);o.location=(0,y,7);box('Luminaria',(0,y,7.15),(.5,.5,.08),lightmat)
world=bpy.data.worlds.new('Cielo diurno');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.75,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;bpy.context.scene.world=world
bpy.ops.object.light_add(type='SUN',location=(0,-8,8));bpy.context.object.rotation_euler=(.45,-.35,-.5);bpy.context.object.data.energy=1.7;bpy.context.object.data.angle=.2
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Entrada - recorrido preliminar';cam.data.lens=25
for frame,pos,target in [(1,(0,-17,1.65),(0,5,2)),(90,(0,-10,1.65),(1,7,2)),(180,(0,-2,1.65),(1,12,2.5)),(240,(0,3,1.65),(1,12,2.6))]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame)
scene=bpy.context.scene;scene.camera=cam;scene.frame_end=240;scene.render.fps=24;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.frame_set(180);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(O/'school-layout.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(O/'school-layout.glb'),export_format='GLB',export_cameras=True,export_animations=True)
scene.render.filepath=str(O/'school-layout-preview.png');bpy.ops.render.render(write_still=True)
