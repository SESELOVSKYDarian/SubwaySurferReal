"""Miniatura del menú de personajes (480×560) desde el GLB del juego. Blender 4.3.

Uso: blender -b --python-exit-code 1 --python tools/render_menu_thumb.py -- classic-student classic.png
Fondo gris cálido y encuadre iguales a las otras miniaturas (figura de 47 a 513 px).
"""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
stem, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/characters' / f'{stem}.glb'))
# El importador agrega una esfera para dibujar huesos: no es parte del personaje.
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.data.materials:
        bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x, scene.render.resolution_y = 480, 560
scene.view_settings.view_transform = 'AgX'
srgb = lambda v: ((v / 255 + .055) / 1.055) ** 2.4
world = bpy.data.worlds.new('fondo')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (srgb(84), srgb(89), srgb(95), 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .9
scene.world = world
# Vértices reales (el bound_box de mallas con esqueleto puede incluir la armadura escalada).
pts = [o.matrix_world @ v.co for o in scene.objects if o.type == 'MESH' for v in o.data.vertices]
h = max(p.z for p in pts) - min(p.z for p in pts)
z0 = min(p.z for p in pts)


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


for name, pos, power in [('Key', (-2.2, 3.2, 2.6), 380), ('Fill', (2.6, 2.4, 1.6), 260), ('Rim', (.5, -3, 2.8), 520)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.size = power * .42 * h / 1.8, 2.5
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = pos
    aim(light, (0, 0, z0 + h * .55))
cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 70
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
center = Vector((0, 0, z0 + h * .5))
# Distancia para que la figura ocupe 466 de 560 px de alto (como las demás).
# Con sensor AUTO y cuadro vertical, angle_y no es el ángulo útil: corrección
# medida sobre la imagen (313 → 466 px de figura).
dist = (h / 2) / math.tan(cam_data.angle_y / 2) * 560 / 466 * .672
cam.location = center + Vector((.18 * dist, dist, .06 * dist))
aim(cam, center + Vector((0, 0, -h * .015)))
scene.render.filepath = str(ROOT / 'assets/menu' / out)
bpy.ops.render.render(write_still=True)
print('miniatura', scene.render.filepath, 'altura', round(h, 3), 'distancia', round(dist, 2))
